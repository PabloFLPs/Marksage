/**
 * Train the paste-kind model → public/models/paste-v1.bin
 *   node --experimental-strip-types training/build-pastes.ts
 *   node --experimental-strip-types training/train-pastes.ts [--dim 8] [--buckets 32768] [--epochs 3] [--lr 0.3] [--balance 0.5] [--save public/models/paste-v1.bin] [--test]
 *
 * Same recipe as the other models (training/fasttext.ts) with featurizer 4 (src/assist/model/pasteFeatures.ts),
 * seven answers (src/assist/questions.ts PASTE_KINDS). Fitted on the train repos, temperature on the dev repos.
 * The judge is real pastes: `pastes.dev.json` to choose settings, `pastes.real2.json` (fresh, hand-built from
 * real files) run once with `--test`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fit, fitTemperature, rowOf, serialise, type Sample } from './fasttext.ts'
import { forward, softmaxT, type ModelHeader } from '../src/assist/model/model.ts'
import { pasteFeatureIds } from './pasteFeatures.ts'
import { passesGate } from '../src/assist/types.ts'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { PASTE_KINDS, Q, type PasteKind } from '../src/assist/questions.ts'
import type { PasteRow } from './build-pastes.ts'

const ROOT = new URL('.', import.meta.url).pathname
const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : dflt
}
const DIM = arg('dim', 8)
const BUCKETS = arg('buckets', 32768)
const EPOCHS = arg('epochs', 3)
const LR = arg('lr', 0.3)
const BALANCE = arg('balance', 0.5)
const SEED = arg('seed', 1)
const SAVE = process.argv.includes('--save') ? process.argv[process.argv.indexOf('--save') + 1] : null
const TEST = process.argv.includes('--test')
const QUIET = process.argv.includes('--quiet')
export const PASTE_LABELS = Object.keys(PASTE_KINDS) as PasteKind[]
const K = PASTE_LABELS.length

const rows = readFileSync(join(ROOT, 'data/pastes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as PasteRow)
const toSample = (r: PasteRow): Sample => ({ y: PASTE_LABELS.indexOf(r.label), ids: pasteFeatureIds(r.text, BUCKETS) })
const train = rows.filter((r) => r.split === 'train').map(toSample)
const devRows = rows.filter((r) => r.split === 'dev')

const w = fit(train, { dim: DIM, buckets: BUCKETS, classes: K, epochs: EPOCHS, lr: LR, balance: BALANCE, seed: SEED, quiet: QUIET })
const row = rowOf(w.emb, DIM)
const logitsOf = (text: string) => forward(pasteFeatureIds(text, BUCKETS), DIM, K, row, w.W, w.b).logits
const T = fitTemperature(devRows.map((r) => logitsOf(r.text)), devRows.map((r) => PASTE_LABELS.indexOf(r.label)))
const probs = (text: string) => Array.from(softmaxT(logitsOf(text), T))

const header: ModelHeader = { labels: PASTE_LABELS, buckets: BUCKETS, dim: DIM, temperature: T, featurizer: 4, trainedOn: `${train.length} pastes, training/README.md` }
const buf = serialise(header, w)
console.log(`dim ${DIM}  buckets ${BUCKETS}  epochs ${EPOCHS}  lr ${LR}  balance ${BALANCE}  T ${T}  train ${train.length}  file ${(buf.byteLength / 1024).toFixed(0)} KB`)

/** A paste suggestion is shown when the answer isn't prose and passes the 0.8 / 0.2 gate (features/smartPaste.ts). */
const shownKind = (p: number[]) => {
  const best = p.indexOf(Math.max(...p))
  return PASTE_LABELS[best] !== 'prose' && passesGate(p) ? best : -1
}
{
  let shown = 0
  let ok = 0
  let acc = 0
  for (const r of devRows) {
    const p = probs(r.text)
    const y = PASTE_LABELS.indexOf(r.label)
    if (p.indexOf(Math.max(...p)) === y) acc++
    const k = shownKind(p)
    if (k >= 0) {
      shown++
      if (k === y) ok++
    }
  }
  console.log(`corpus dev: ${devRows.length} pastes · accuracy ${((100 * acc) / devRows.length).toFixed(1)}% · shown ${shown} · right when shown ${((100 * ok) / shown).toFixed(1)}%`)
}

const heuristics = new HeuristicEngine()
async function judge(file: string) {
  const path = join(ROOT, '../src/assist/__fixtures__', file)
  if (!existsSync(path)) return
  const cases = JSON.parse(readFileSync(path, 'utf8')) as { label: PasteKind; text: string; source?: string }[]
  const res: { y: number; m: number[]; h: number[]; text: string }[] = []
  for (const c of cases) {
    const d = await heuristics.choice<PasteKind>(c.text, Q.pasteKind, PASTE_KINDS)
    res.push({ y: PASTE_LABELS.indexOf(c.label), m: probs(c.text), h: PASTE_LABELS.map((k) => d.probs[k]), text: c.text })
  }
  const line = (name: string, f: (r: (typeof res)[0]) => number[]) => {
    let acc = 0
    let shown = 0
    let ok = 0
    for (const r of res) {
      const p = f(r)
      if (p.indexOf(Math.max(...p)) === r.y) acc++
      const k = shownKind(p)
      if (k >= 0) {
        shown++
        if (k === r.y) ok++
      }
    }
    return `${name.padEnd(8)} accuracy ${((100 * acc) / res.length).toFixed(1)}% · shown ${shown}/${res.length} · right when shown ${shown ? ((100 * ok) / shown).toFixed(1) : '—'}% (${ok}/${shown})`
  }
  console.log(`\n${file}`)
  console.log('  ' + line('rules', (r) => r.h))
  console.log('  ' + line('model', (r) => r.m))
  // Agreement, as for code languages: the model when confident, else a confident rule answer the model's top pick agrees with.
  console.log('  ' + line('agree', (r) => (shownKind(r.m) >= 0 ? r.m : shownKind(r.h) >= 0 && r.h.indexOf(Math.max(...r.h)) === r.m.indexOf(Math.max(...r.m)) ? r.h : r.m)))
  if (process.argv.includes('--errors'))
    for (const r of res) {
      const k = shownKind(r.m)
      const top = r.m.indexOf(Math.max(...r.m))
      if (top !== r.y || (k >= 0 && k !== r.y)) console.log(`    ${PASTE_LABELS[r.y]} → model ${PASTE_LABELS[top]} ${(r.m[top] * 100).toFixed(0)}%${k >= 0 ? ' [SHOWN]' : ''} · rules ${PASTE_LABELS[r.h.indexOf(Math.max(...r.h))]}  ${JSON.stringify(r.text.slice(0, 70))}`)
    }
}
await judge('pastes.json')
await judge('pastes.dev.json')
if (TEST) await judge('pastes.real2.json')
if (SAVE) {
  writeFileSync(join(ROOT, '..', SAVE), new Uint8Array(buf))
  console.log(`saved ${SAVE}`)
}
