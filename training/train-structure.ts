/**
 * Train the structure model → public/models/structure-v1.bin
 *   node --experimental-strip-types training/build-structure.ts
 *   node --experimental-strip-types training/train-structure.ts [--dim 8] [--buckets 32768] [--epochs 3] [--lr 0.3] [--balance 1] [--save public/models/structure-v1.bin] [--test]
 *
 * Same recipe as the other two models (training/fasttext.ts) with featurizer 3
 * (src/assist/model/structureFeatures.ts): two answers, "no" and "yes" — the app's `noul` probability is p(yes).
 * Fitted on the train repos, temperature on the dev repos. The real judge is hand-labelled unpolished text
 * (issues, wikis): `lines.dev.json` to choose settings, `lines.real2.json` run once with `--test`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fit, fitTemperature, rowOf, serialise, type Sample } from './fasttext.ts'
import { forward, softmaxT, type ModelHeader } from '../src/assist/model/model.ts'
import { structureFeatureIds, structureInput } from './structureFeatures.ts'
import { findStructureCandidates } from '../src/assist/prefilter.ts'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { MODEL_STRUCTURE_KINDS, type StructureRow } from './build-structure.ts'

const ROOT = new URL('.', import.meta.url).pathname
const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : dflt
}
const DIM = arg('dim', 8)
const BUCKETS = arg('buckets', 32768)
const EPOCHS = arg('epochs', 3)
const LR = arg('lr', 0.3)
const BALANCE = arg('balance', 1)
const SEED = arg('seed', 1)
const GATE = arg('gate', 0.8)
const RESCUE = arg('rescue', 0.95)
const SAVE = process.argv.includes('--save') ? process.argv[process.argv.indexOf('--save') + 1] : null
const TEST = process.argv.includes('--test')
const QUIET = process.argv.includes('--quiet')
const DROP = (process.argv.includes('--drop') ? process.argv[process.argv.indexOf('--drop') + 1] : '').split(',').filter(Boolean)
const LABELS = ['no', 'yes']

const rows = readFileSync(join(ROOT, 'data/structure.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as StructureRow)
const keep = (r: StructureRow) => !DROP.includes(r.src) && !DROP.includes(r.kind)
const toSample = (r: StructureRow): Sample => ({ y: r.y, ids: structureFeatureIds(r.input, BUCKETS) })
const train = rows.filter((r) => r.split === 'train' && keep(r)).map(toSample)
const devRows = rows.filter((r) => r.split === 'dev' && keep(r))

const w = fit(train, { dim: DIM, buckets: BUCKETS, classes: 2, epochs: EPOCHS, lr: LR, balance: BALANCE, seed: SEED, quiet: QUIET })
const row = rowOf(w.emb, DIM)
const logitsOf = (input: string) => forward(structureFeatureIds(input, BUCKETS), DIM, 2, row, w.W, w.b).logits
const T = fitTemperature(devRows.map((r) => logitsOf(r.input)), devRows.map((r) => r.y))
const pYes = (input: string) => softmaxT(logitsOf(input), T)[1]

const header: ModelHeader = { labels: LABELS, buckets: BUCKETS, dim: DIM, temperature: T, featurizer: 3, trainedOn: `${train.length} lines, training/README.md` }
const buf = serialise(header, w)
console.log(`dim ${DIM}  buckets ${BUCKETS}  epochs ${EPOCHS}  lr ${LR}  balance ${BALANCE}  T ${T}  train ${train.length}  file ${(buf.byteLength / 1024).toFixed(0)} KB`)

// Weak, synthetic-heavy: the dev repos of the corpus (positives are real items made into near-misses).
{
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '—')
  const per: Record<string, number[]> = {}
  for (const r of devRows) {
    const p = pYes(r.input)
    const k = (per[`${r.src}/${r.kind}`] ??= [0, 0])
    k[0]++
    if ((p >= GATE ? 1 : 0) === r.y) k[1]++
  }
  if (!QUIET) console.log('corpus dev (right/n): ' + Object.entries(per).sort().map(([k, [n, ok]]) => `${k} ${ok}/${n}`).join(' · '))
  const shown = devRows.filter((r) => pYes(r.input) >= GATE)
  console.log(`corpus dev: ${devRows.length} lines · shown ${shown.length} · right when shown ${pct(shown.filter((r) => r.y).length, shown.length)}%`)
}

// The judge: hand-labelled lines from unpolished text.
const heuristics = new HeuristicEngine()
async function judge(file: string) {
  const cases = JSON.parse(readFileSync(join(ROOT, '../src/assist/__fixtures__', file), 'utf8')) as { doc: string; line?: number; expect: boolean; kind: string; source: string }[]
  type R = { kind: string; expect: boolean; m: number; h: number; text: string }
  const res: R[] = []
  for (const l of cases) {
    const start = l.line === undefined ? -1 : l.doc.split('\n').slice(0, l.line).join('\n').length + (l.line ? 1 : 0)
    const c = findStructureCandidates(l.doc).find((x) => start < 0 || x.lineStart === start)
    if (!c) continue
    const h = await heuristics.noul(c.context, c.statement)
    const m = MODEL_STRUCTURE_KINDS.includes(c.kind) ? pYes(structureInput(c.context, c.text)) : h
    res.push({ kind: c.kind, expect: l.expect, m, h, text: c.text })
  }
  const line = (name: string, f: (r: R) => number, subset = res) => {
    const shown = subset.filter((r) => f(r) >= GATE)
    const ok = shown.filter((r) => r.expect).length
    const acc = subset.filter((r) => (f(r) >= GATE) === r.expect).length
    return `${name.padEnd(10)} accuracy ${((100 * acc) / subset.length).toFixed(1)}% · shown ${shown.length}/${subset.length} · right when shown ${shown.length ? ((100 * ok) / shown.length).toFixed(1) : '—'}% (${ok}/${shown.length}) · true lines found ${ok}/${subset.filter((r) => r.expect).length}`
  }
  console.log(`\n${file}`)
  console.log('  ' + line('rules', (r) => r.h))
  console.log('  ' + line('model', (r) => r.m))
  console.log('  ' + line('agree', (r) => (r.m >= GATE || (r.h >= GATE && r.m >= 0.5) ? Math.max(r.m, r.h) : 0)))
  // Chosen on dev before the held-out run: the rules, plus the model's very confident answers where the rules stay quiet.
  console.log('  ' + line('rescue', (r) => (r.h >= GATE ? r.h : r.m >= RESCUE ? r.m : 0)))
  if (process.argv.includes('--grid')) {
    for (const V of [0, 0.05, 0.1, 0.2, 0.3]) for (const R of [1.01, 0.97, 0.95, 0.9]) {
      const show = (r: R) => (r.h >= GATE && r.m >= V) || (r.h < GATE && r.m >= R)
      const shown = res.filter(show)
      const ok = shown.filter((r) => r.expect).length
      console.log(`    veto < ${V} · rescue ≥ ${R}: shown ${shown.length} · right ${ok} (${((100 * ok) / shown.length).toFixed(1)}%)`)
    }
  }
  if (!QUIET) {
    for (const k of [...new Set(res.map((r) => r.kind))].sort()) {
      const sub = res.filter((r) => r.kind === k)
      console.log(`    ${k.padEnd(16)} rules ${sub.filter((r) => r.h >= GATE && r.expect).length}/${sub.filter((r) => r.h >= GATE).length} · model ${sub.filter((r) => r.m >= GATE && r.expect).length}/${sub.filter((r) => r.m >= GATE).length} · true ${sub.filter((r) => r.expect).length}/${sub.length}`)
    }
    if (process.argv.includes('--errors')) for (const r of res) if ((r.m >= GATE) !== r.expect) console.log(`    ${r.expect ? 'MISS' : 'FP  '} m ${r.m.toFixed(2)} h ${r.h.toFixed(2)} ${JSON.stringify(r.text.slice(0, 80))}`)
  }
}
await judge('lines.dev.json')
if (TEST) await judge('lines.real2.json')
if (SAVE) {
  writeFileSync(join(ROOT, '..', SAVE), new Uint8Array(buf))
  console.log(`saved ${SAVE}`)
}
