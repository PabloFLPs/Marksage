/**
 * Smart Assist fixture eval — heuristic engine (Laya column once wired).
 *   node --experimental-strip-types scripts/eval-assist.ts            # all sets
 *   node --experimental-strip-types scripts/eval-assist.ts --real     # held-out real-world set only
 *
 * Fixture sets (see src/assist/__fixtures__/README.md):
 *   authored  — written alongside the heuristics (regression tests; optimistic by construction)
 *   dev       — real-world excerpts to tune against (F3 only so far)
 *   real      — real-world excerpts, held out: never tune heuristics against them
 */
import { existsSync, readFileSync } from 'node:fs'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { passesGate } from '../src/assist/types.ts'
import { LANGUAGES, PASTE_KINDS, Q } from '../src/assist/questions.ts'
import { findStructureCandidates } from '../src/assist/prefilter.ts'

const fixture = (f: string) => new URL(`../src/assist/__fixtures__/${f}`, import.meta.url)
const load = (f: string) => JSON.parse(readFileSync(fixture(f), 'utf8'))
const engine = new HeuristicEngine()
const realOnly = process.argv.includes('--real')
type Set = 'authored' | 'dev' | 'real'
const SETS: Set[] = realOnly ? ['real'] : ['authored', 'dev', 'real']
const file = (base: string, set: Set) => (set === 'authored' ? `${base}.json` : `${base}.${set}.json`)
const has = (base: string, set: Set) => existsSync(fixture(file(base, set)))

type Row = { label: string; pred: string; conf: number; shown: boolean; source?: string }
function report(name: string, rows: Row[], ms: number) {
  const acc = rows.filter((r) => r.pred === r.label).length / rows.length
  const shown = rows.filter((r) => r.shown)
  const precision = shown.filter((r) => r.pred === r.label).length / Math.max(1, shown.length)
  console.log(`\n## ${name}  (n=${rows.length}, ${(ms / rows.length).toFixed(2)} ms/decision)`)
  console.log(`accuracy (argmax): ${(acc * 100).toFixed(1)}%`)
  console.log(`shown past gate:   ${shown.length}/${rows.length}  — precision when shown: ${(precision * 100).toFixed(1)}%`)
  const bins = [0, 0.5, 0.7, 0.8, 0.9, 1.01]
  for (let i = 0; i < bins.length - 1; i++) {
    const b = rows.filter((r) => r.conf >= bins[i] && r.conf < bins[i + 1])
    if (b.length) console.log(`  conf ${bins[i].toFixed(1)}–${Math.min(1, bins[i + 1]).toFixed(1)}: ${b.length} → ${((b.filter((r) => r.pred === r.label).length / b.length) * 100).toFixed(0)}% correct`)
  }
  for (const r of rows.filter((r) => r.pred !== r.label))
    console.log(`  ✗ expected ${r.label}, got ${r.pred} (${(r.conf * 100).toFixed(0)}%)${r.shown ? ' [SHOWN]' : ''}${r.source ? `  ${r.source}` : ''}`)
}

for (const set of SETS) {
  const TITLES = { authored: 'Authored set (written with the rules — optimistic)', dev: 'Dev set (real-world, used for tuning)', real: 'Real-world set (held out)' }
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
