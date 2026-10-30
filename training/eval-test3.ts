/**
 * The single run of the third held-out set (fences.real3.json) for code-language model v3 — 2026-10-30.
 *   node --experimental-strip-types training/eval-test3.ts <v3.bin> <control.bin> [--set dev]
 *
 * Compares, behind the app's 0.80 / 0.20 gate: the heuristics, the shipped lang-v2.bin, the v3 candidate and the
 * same-data control (mean pooling, retrained on today's data), each as the model alone and as the app's hybrid
 * (model/hybrid.ts: agreement, plus RULES_OVERRIDE — and once without it, to re-measure whether it's still needed).
 * Then the bar fixed beforehand (Implementation Context §35). `--set dev` runs the same report on dev (a dry run
 * of this script; the held-out set is run once).
 */
import { readFileSync } from 'node:fs'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { LANGUAGES, Q } from '../src/assist/questions.ts'
import { passesGate, type Decision } from '../src/assist/types.ts'
import { loadModel, type LangModel } from '../src/assist/model/model.ts'
import { combineFence, toChoice } from '../src/assist/model/hybrid.ts'
import { hasJsonComment } from './jsonComments.ts'
import { decisive } from './pairSyntax.ts'

type Lang = keyof typeof LANGUAGES
const set = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'real3'
const [v3File, controlFile] = process.argv.slice(2).filter((a) => a.endsWith('.bin'))
const rows = JSON.parse(readFileSync(new URL(`../src/assist/__fixtures__/fences.${set}.json`, import.meta.url), 'utf8')) as { label: Lang; code: string; subset?: string }[]
const bin = (f: string) => loadModel(new Uint8Array(readFileSync(f)).buffer)
const models: [string, LangModel][] = [['v2 (shipped)', bin(new URL('../public/models/lang-v2.bin', import.meta.url).pathname)], ['v3 (mean+max)', bin(v3File)], ['control (mean, today)', bin(controlFile)]]
const heur = new HeuristicEngine()

type R = { label: string; pred: string; shown: boolean; code: string; subset?: string }
const shownOf = (d: Decision<Lang>) => d.choice !== 'plaintext' && passesGate(Object.values(d.probs) as number[])
/** The hybrid without RULES_OVERRIDE (v2's rule before 2026-10-30). */
async function agreementOnly(m: Decision<Lang>, h: () => Promise<Decision<Lang>>): Promise<Decision<Lang>> {
  if (shownOf(m)) return m
  const hd = await h()
  return shownOf(hd) && hd.choice === m.choice ? hd : m
}

const results = new Map<string, R[]>()
const heurRows: R[] = []
const heurDecisions: Decision<Lang>[] = []
for (const x of rows) {
  const d = await heur.choice(x.code, Q.fenceLanguage, LANGUAGES)
  heurDecisions.push(d)
  heurRows.push({ label: x.label, pred: d.choice, shown: shownOf(d), code: x.code, subset: x.subset })
}
results.set('heuristics', heurRows)
const t0: Record<string, number> = {}
for (const [name, model] of models) {
  const alone: R[] = []
  const hybrid: R[] = []
  const noOverride: R[] = []
  const start = performance.now()
  for (const [i, x] of rows.entries()) {
    const m = toChoice(model.predict(x.code), LANGUAGES)
    alone.push({ label: x.label, pred: m.choice, shown: shownOf(m), code: x.code, subset: x.subset })
    const h = await combineFence(m, async () => heurDecisions[i])
    hybrid.push({ label: x.label, pred: h.choice, shown: shownOf(h), code: x.code, subset: x.subset })
    const a = await agreementOnly(m, async () => heurDecisions[i])
    noOverride.push({ label: x.label, pred: a.choice, shown: shownOf(a), code: x.code, subset: x.subset })
  }
  t0[name] = (performance.now() - start) / rows.length
  results.set(`${name} · alone`, alone)
  results.set(`${name} · hybrid`, hybrid)
  results.set(`${name} · hybrid, no override`, noOverride)
}

const PAIRS: [string, string[]][] = [['TS/JS', ['ts', 'js']], ['C++/C', ['cpp', 'c']], ['C#/Java', ['csharp', 'java']]]
const PAIR_LANGS = PAIRS.flatMap(([, l]) => l)
type Stat = { n: number; acc: number; shown: number; right: number; wrong: number; precision: number }
const stat = (rs: R[]): Stat => {
  const sh = rs.filter((r) => r.shown)
  const right = sh.filter((r) => r.pred === r.label).length
  return { n: rs.length, acc: rs.filter((r) => r.pred === r.label).length / Math.max(1, rs.length), shown: sh.length, right, wrong: sh.length - right, precision: right / Math.max(1, sh.length) }
}
const fmt = (s: Stat) => `${String(s.n).padStart(4)}  ${(s.acc * 100).toFixed(1).padStart(5)}%  ${String(s.shown).padStart(4)} (${((s.shown / Math.max(1, s.n)) * 100).toFixed(0).padStart(2)}%)  ${(s.precision * 100).toFixed(1).padStart(5)}%  ${String(s.right).padStart(4)} / ${String(s.wrong).padStart(3)}`
const groups: [string, (r: R) => boolean][] = [
  ['overall', () => true],
  ['pairs (6 langs)', (r) => PAIR_LANGS.includes(r.label)],
  ...PAIRS.map(([n, ls]) => [n, (r: R) => ls.includes(r.label)] as [string, (r: R) => boolean]),
  ['JSON w/ comments', (r) => r.label === 'json' && hasJsonComment(r.code)],
  ['ts w/ TS syntax', (r) => r.label === 'ts' && decisive('ts', r.code)],
  ['cpp w/ C++ syntax', (r) => r.label === 'cpp' && decisive('cpp', r.code)],
]
console.log(`# fences.${set}.json — ${rows.length} blocks\n`)
console.log(`${''.padEnd(40)}    n    acc   shown        prec  right / wrong`)
for (const [g, f] of groups) {
  console.log(`\n## ${g}`)
  for (const [name, rs] of results) console.log(`${name.padEnd(40)} ${fmt(stat(rs.filter(f)))}`)
}
console.log('\n## shown as the sibling (wrong)')
for (const [name, rs] of results) {
  const w = (a: string, b: string) => rs.filter((r) => r.shown && r.label === a && r.pred === b).length
  console.log(`${name.padEnd(40)} ts→js ${w('ts', 'js')} · js→ts ${w('js', 'ts')} · cpp→c ${w('cpp', 'c')} · c→cpp ${w('c', 'cpp')} · csharp→java ${w('csharp', 'java')} · java→csharp ${w('java', 'csharp')} · json→js ${w('json', 'js')}`)
}
console.log('\n## ms per decision (model + hybrid): ' + Object.entries(t0).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' · '))

// ---------- the bar (Implementation Context §35) ----------
console.log('\n## The bar — v3 against the shipped v2')
let pass = true
for (const mode of ['alone', 'hybrid']) {
  const v2 = results.get(`v2 (shipped) · ${mode}`)!
  const v3 = results.get(`v3 (mean+max) · ${mode}`)!
  const p2 = stat(v2.filter((r) => PAIR_LANGS.includes(r.label)))
  const p3 = stat(v3.filter((r) => PAIR_LANGS.includes(r.label)))
  const o2 = stat(v2)
  const o3 = stat(v3)
  const c1 = p3.right > p2.right && p3.precision >= p2.precision
  const c2 = o3.precision >= o2.precision
  pass &&= c1 && c2
  console.log(`${mode.padEnd(7)} 1. pairs: right ${p3.right} vs ${p2.right}, precision ${(p3.precision * 100).toFixed(1)}% vs ${(p2.precision * 100).toFixed(1)}% → ${c1 ? 'PASS' : 'FAIL'}`)
  console.log(`${''.padEnd(7)} 2. overall precision ${(o3.precision * 100).toFixed(1)}% vs ${(o2.precision * 100).toFixed(1)}% → ${c2 ? 'PASS' : 'FAIL'}`)
}
const size = readFileSync(v3File).length
const c3 = size <= 400 * 1024
pass &&= c3
console.log(`        3. file ${(size / 1024).toFixed(1)} KB (≤ 400), ${t0['v3 (mean+max)'].toFixed(3)} ms per decision (hybrid incl.) → ${c3 ? 'PASS' : 'FAIL'}`)
console.log(`\nVERDICT: ${pass ? 'v3 meets the bar' : 'v3 does not meet the bar'}`)
