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
 *   real2     — a second, fresh held-out set: code blocks (model v2), unpolished lines (structure, 2026-10-28), pastes
 */
import { existsSync, readFileSync } from 'node:fs'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { passesGate } from '../src/assist/types.ts'
import { LANGUAGES, PASTE_KINDS, Q } from '../src/assist/questions.ts'
import { headingType } from '../src/assist/sections.ts'
import { buildOutline } from '../src/assist/outline.ts'
import { computeDocStats } from '../src/assist/docStats.ts'
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
  const TITLES = { authored: 'Authored set (written with the rules — optimistic)', dev: 'Dev set (real-world, used for tuning)', real: 'Real-world set (held out)', real2: 'Real-world set 2 (fresh, held out: code blocks for model v2; issue/wiki lines and real pastes from 2026-10-28)' }
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
      // `line` (0-based, newer cases) names the labelled line; older cases hold exactly one candidate.
      const start = l.line === undefined ? -1 : l.doc.split('\n').slice(0, l.line).join('\n').length + (l.line ? 1 : 0)
      const cands = findStructureCandidates(l.doc).filter((c) => start < 0 || c.lineStart === start)
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

// Document tab — kind + flags on small authored documents (heading rule only, no model)
if (!realOnly && existsSync(fixture('docstats.json'))) {
  console.log('\n## Document tab — authored')
  let ok = 0
  const cases = load('docstats.json') as { name: string; doc: string; filename: string | null; expectKind: string | null; expectFlags: string[] }[]
  for (const c of cases) {
    const s = computeDocStats(c.doc, buildOutline(c.doc), c.filename)
    const kind = s.kind?.id ?? null
    const flags = s.flags.map((f) => `${f.kind}:${f.line}`)
    const pass = kind === c.expectKind && JSON.stringify(flags) === JSON.stringify(c.expectFlags)
    ok += +pass
    if (!pass || !brief) console.log(`  ${pass ? '✓' : '✗'} ${c.name}${pass ? '' : ` — kind ${kind} (expected ${c.expectKind}), flags ${flags.join(' ') || '—'} (expected ${c.expectFlags.join(' ') || '—'})`}`)
  }
  console.log(`${ok}/${cases.length} documents as expected`)
}

// Standalone runner (examples/marksage-models.mjs) must give the app's probabilities, for both models.
if (!realOnly) {
  const runner = await import('../examples/marksage-models.mjs')
  const bin = (f: string) => new Uint8Array(readFileSync(new URL(`../public/models/${f}`, import.meta.url))).buffer
  const { splitDocSections } = await import('../src/assist/sections.ts')
  const docs = ['SMART-ASSIST.md', 'MODELS.md', 'SMART-ASSIST.pt-BR.md', 'MODELS.pt-BR.md'].map((f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8'))
  const cases: [string, string[]][] = [
    ['lang-v2.bin', ['fences.json', 'fences.dev.json', 'fences.real.json', 'fences.real2.json'].filter((f) => existsSync(fixture(f))).flatMap((f) => (load(f) as { code: string }[]).map((x) => x.code))],
    ['sections-v2.bin', docs.flatMap((d) => splitDocSections(d).map((s) => s.own))],
  ]
  console.log('\n## Standalone runner parity')
  for (const [file, texts] of cases) {
    const app = loadModel(bin(file))
    const ext = runner.loadModel(bin(file))
    let worst = 0
    for (const t of texts) {
      const a = app.predict(t)
      const e = ext.predict(t) as Record<string, number>
      for (const k of Object.keys(a)) worst = Math.max(worst, Math.abs(a[k] - e[k]))
    }
    console.log(`${worst < 1e-6 ? '✓' : '✗'} ${file}: ${texts.length} inputs, largest difference ${worst.toExponential(1)}`)
  }
}
