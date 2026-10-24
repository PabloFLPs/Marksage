/**
 * Smart Assist fixture eval — heuristic engine, plus Marksage's own code-language model (the newest
 * public/models/lang-v*.bin, combined with the heuristics exactly as the app does — model/hybrid.ts).
 *   node --experimental-strip-types scripts/eval-assist.ts            # all sets
 *   node --experimental-strip-types scripts/eval-assist.ts --real     # held-out real-world sets only
 *   … --brief                                                         # no per-error lines
 *
 * Fixture sets (see src/assist/__fixtures__/README.md):
 *   authored  — written alongside the heuristics (regression tests; optimistic by construction)
 *   dev       — real-world excerpts to tune against (F1, F3)
 *   real      — real-world excerpts, held out: never tune heuristics against them
 *   real2     — a second, fresh held-out code-block set (model v2), from repos used nowhere else
 */
import { existsSync, readFileSync } from 'node:fs'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { passesGate } from '../src/assist/types.ts'
import { LANGUAGES, PASTE_KINDS, Q } from '../src/assist/questions.ts'
import { headingType } from '../src/assist/sections.ts'
import { findStructureCandidates } from '../src/assist/prefilter.ts'
import { loadModel } from '../src/assist/model/model.ts'
import { combineFence, toChoice } from '../src/assist/model/hybrid.ts'
import { fencePair } from '../src/assist/features/codeFence.ts'

const fixture = (f: string) => new URL(`../src/assist/__fixtures__/${f}`, import.meta.url)
const load = (f: string) => JSON.parse(readFileSync(fixture(f), 'utf8'))
const engine = new HeuristicEngine()
const realOnly = process.argv.includes('--real')
const brief = process.argv.includes('--brief')
const MODEL_FILE = ['lang-v2.bin', 'lang-v1.bin'].map((f) => new URL(`../public/models/${f}`, import.meta.url)).find((u) => existsSync(u)) ?? new URL('../public/models/none.bin', import.meta.url)
const model = existsSync(MODEL_FILE) ? loadModel(new Uint8Array(readFileSync(MODEL_FILE)).buffer) : null
type Set = 'authored' | 'dev' | 'real' | 'real2'
const SETS: Set[] = realOnly ? ['real', 'real2'] : ['authored', 'dev', 'real', 'real2']
const file = (base: string, set: Set) => (set === 'authored' ? `${base}.json` : `${base}.${set}.json`)
const has = (base: string, set: Set) => existsSync(fixture(file(base, set)))

type Row = { label: string; pred: string; conf: number; shown: boolean; source?: string; pair?: [string, string] }
function report(name: string, rows: Row[], ms: number) {
  const acc = rows.filter((r) => r.pred === r.label).length / rows.length
  const shown = rows.filter((r) => r.shown)
  const precision = shown.filter((r) => r.pred === r.label).length / Math.max(1, shown.length)
  console.log(`\n## ${name}  (n=${rows.length}, ${(ms / rows.length).toFixed(2)} ms/decision)`)
  console.log(`accuracy (argmax): ${(acc * 100).toFixed(1)}%`)
  console.log(`shown past gate:   ${shown.length}/${rows.length}  — precision when shown: ${(precision * 100).toFixed(1)}%`)
  const pairs = rows.filter((r) => r.pair)
  if (pairs.length) {
    const among = pairs.filter((r) => r.pair!.includes(r.label)).length
    const first = pairs.filter((r) => r.pair![0] === r.label).length
    console.log(`two-option offers: ${pairs.length}  — right one among the two: ${among} (${((among / pairs.length) * 100).toFixed(0)}%), first option right: ${first}`)
  }
  const bins = [0, 0.5, 0.7, 0.8, 0.9, 1.01]
  for (let i = 0; i < bins.length - 1; i++) {
    const b = rows.filter((r) => r.conf >= bins[i] && r.conf < bins[i + 1])
    if (b.length) console.log(`  conf ${bins[i].toFixed(1)}–${Math.min(1, bins[i + 1]).toFixed(1)}: ${b.length} → ${((b.filter((r) => r.pred === r.label).length / b.length) * 100).toFixed(0)}% correct`)
  }
  if (!brief) for (const r of rows.filter((r) => r.pred !== r.label))
    console.log(`  ✗ expected ${r.label}, got ${r.pred} (${(r.conf * 100).toFixed(0)}%)${r.shown ? ' [SHOWN]' : ''}${r.source ? `  ${r.source}` : ''}`)
}

for (const set of SETS) {
  const TITLES = { authored: 'Authored set (written with the rules — optimistic)', dev: 'Dev set (real-world, used for tuning)', real: 'Real-world set (held out)', real2: 'Real-world set 2 (fresh, held out — model v2)' }
  console.log(`\n# ${TITLES[set]}`)

  // F1 — code-fence language
  if (has('fences', set)) {
    const t0 = performance.now()
    const rows: Row[] = []
    for (const f of load(file('fences', set))) {
      const d = await engine.choice(f.code, Q.fenceLanguage, LANGUAGES)
      const probs = Object.values(d.probs) as number[]
      rows.push({ label: f.label, pred: d.choice, conf: d.probs[d.choice as keyof typeof d.probs], shown: d.choice !== 'plaintext' && passesGate(probs), source: f.source })
    }
    report(`F1 code-fence language — ${set}`, rows, performance.now() - t0)

    if (model) {
      const t1 = performance.now()
      const mrows: Row[] = []
      for (const f of load(file('fences', set))) {
        const v2 = MODEL_FILE.pathname.endsWith('lang-v2.bin')
        const m = toChoice(model.predict(f.code), LANGUAGES)
        const d = v2 ? await combineFence(m, () => engine.choice(f.code, Q.fenceLanguage, LANGUAGES)) : m
        const pred = d.choice
        const probs = Object.values(d.probs) as number[]
        const shownNow = pred !== 'plaintext' && passesGate(probs)
        mrows.push({ label: f.label, pred, conf: d.probs[pred], shown: shownNow, source: f.source, pair: shownNow ? undefined : (fencePair(d.probs) ?? undefined) })
      }
      report(`F1 code-fence language — ${set} · model (${(MODEL_FILE.pathname.split('/').pop())})`, mrows, performance.now() - t1)
    }
  }

  // F2 — smart paste
  if (has('pastes', set)) {
    const t0 = performance.now()
    const rows: Row[] = []
    for (const p of load(file('pastes', set))) {
      const d = await engine.choice(p.text, Q.pasteKind, PASTE_KINDS)
      rows.push({ label: p.label, pred: d.choice, conf: d.probs[d.choice as keyof typeof d.probs], shown: d.choice !== 'prose' && passesGate(Object.values(d.probs) as number[]), source: p.source })
    }
    report(`F2 smart paste — ${set}`, rows, performance.now() - t0)
  }

  // F3 — structure intent
  if (has('lines', set)) {
    const t0 = performance.now()
    const rows: Row[] = []
    for (const l of load(file('lines', set))) {
      const cands = findStructureCandidates(l.doc)
      let p = 0
      for (const c of cands) p = Math.max(p, await engine.noul(c.context, c.statement))
      const shown = p >= 0.8
      rows.push({ label: String(l.expect), pred: String(shown), conf: Math.max(p, 1 - p), shown, source: l.source })
    }
    report(`F3 structure intent — ${set}`, rows, performance.now() - t0)
  }
}

// Outline — section type from the heading alone (authored regression set; the section model is measured in training/)
if (!realOnly && existsSync(fixture('headings.json'))) {
  const rows: Row[] = (load('headings.json') as { heading: string; expect: string | null }[]).map((h) => {
    const pred = headingType(h.heading)
    return { label: String(h.expect), pred: String(pred), conf: 1, shown: pred !== null, source: h.heading }
  })
  report('Outline heading rule — authored', rows, 0)
}
