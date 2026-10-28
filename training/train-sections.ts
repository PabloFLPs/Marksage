/**
 * Train the section-type model → public/models/sections-v2.bin
 *   node --experimental-strip-types training/build-sections.ts
 *   node --experimental-strip-types training/train-sections.ts [--dim 8] [--buckets 32768] [--epochs 3] [--lr 0.3] [--balance 0.5] [--save public/models/sections-v2.bin] [--test]
 *
 * Same recipe as the language model (training/fasttext.ts) with the prose featurizer
 * (src/assist/model/sectionFeatures.ts). Fitted on the train repos; the temperature is fitted on the
 * dev repos, and every setting is chosen on dev. `--test` also scores the held-out test repos — run it
 * once, for the reported numbers, not while tuning.
 *
 * Labels come from headings (build-sections.ts) and the model never sees the heading, so "agreement"
 * below means: from the text alone, the model names the type the heading names.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fit, fitTemperature, rowOf, serialise, type Sample } from './fasttext.ts'
import { forward, softmaxT, type ModelHeader } from '../src/assist/model/model.ts'
import { sectionFeatureIds } from '../src/assist/model/sectionFeatures.ts'
import { passesGate } from '../src/assist/types.ts'
import { MODEL_SECTION_TYPES as SECTION_TYPES } from '../src/assist/sections.ts'
import { OTHER, type SectionRow } from './build-sections.ts'

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
const LABELS = [...SECTION_TYPES, OTHER]
const K = LABELS.length
const OTHER_IDX = K - 1

const rows = readFileSync(join(ROOT, 'data/sections.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as SectionRow)
const toSample = (r: SectionRow): Sample => ({ y: LABELS.indexOf(r.label), ids: sectionFeatureIds(r.text, BUCKETS) })
const train = rows.filter((r) => r.split === 'train').map(toSample)
const devRows = rows.filter((r) => r.split === 'dev')
const testRows = rows.filter((r) => r.split === 'test')

const w = fit(train, { dim: DIM, buckets: BUCKETS, classes: K, epochs: EPOCHS, lr: LR, balance: BALANCE, seed: SEED, quiet: QUIET })
const row = rowOf(w.emb, DIM)
const logitsOf = (r: SectionRow) => forward(sectionFeatureIds(r.text, BUCKETS), DIM, K, row, w.W, w.b).logits
const devLogits = devRows.map(logitsOf)
const T = fitTemperature(devLogits, devRows.map((r) => LABELS.indexOf(r.label)))

const GATE = arg('gate', 0.8)
/** A type is shown when the top pick isn't "other" and passes the gate (as in the app). */
const shownType = (p: number[]) => {
  const best = p.indexOf(Math.max(...p))
  return best !== OTHER_IDX && passesGate(p, GATE, 0.2) ? best : -1
}

function report(name: string, rs: SectionRow[], logits: Float32Array[]) {
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : '—')
  const typed = rs.map((r, i) => ({ r, i })).filter((x) => x.r.label !== OTHER)
  const other = rs.map((r, i) => ({ r, i })).filter((x) => x.r.label === OTHER)
  let shown = 0
  let ok = 0
  const per = SECTION_TYPES.map(() => ({ shown: 0, ok: 0 }))
  for (const { r, i } of typed) {
    const t = shownType(Array.from(softmaxT(logits[i], T)))
    if (t < 0) continue
    shown++
    per[t].shown++
    if (t === LABELS.indexOf(r.label)) {
      ok++
      per[t].ok++
    }
  }
  const otherTagged = other.filter(({ i }) => shownType(Array.from(softmaxT(logits[i], T))) >= 0).length
  console.log(
    `${name.padEnd(5)} ${typed.length} typed sections (${new Set(typed.map((x) => x.r.repo)).size} repos) · type shown ${shown} (${pct(shown, typed.length)}) · agrees with heading ${pct(ok, shown)}` +
      ` · "other" sections given a type ${otherTagged}/${other.length} (${pct(otherTagged, other.length)})`,
  )
  if (!QUIET) console.log('      ' + SECTION_TYPES.map((t, k) => `${t} ${per[k].ok}/${per[k].shown}`).join(' · '))
}

const header: ModelHeader = { labels: LABELS, buckets: BUCKETS, dim: DIM, temperature: T, featurizer: 2, trainedOn: `${train.length} sections, training/README.md` }
const buf = serialise(header, w)
console.log(`dim ${DIM}  buckets ${BUCKETS}  epochs ${EPOCHS}  lr ${LR}  balance ${BALANCE}  T ${T}  train ${train.length}  file ${(buf.byteLength / 1024).toFixed(0)} KB (int8)`)
report('dev', devRows, devLogits)
if (TEST) report('test', testRows, testRows.map(logitsOf))
if (SAVE) {
  writeFileSync(join(ROOT, '..', SAVE), new Uint8Array(buf))
  console.log(`saved ${SAVE}`)
}
