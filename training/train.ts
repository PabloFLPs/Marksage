/**
 * Step 3 — train the code-language model and evaluate it on the dev set.
 *   node --experimental-strip-types training/train.ts [--dim 16] [--buckets 65536] [--epochs 8]
 *        [--lr 0.4] [--balance 0.5] [--seed 1] [--cv-temp] [--short-t] [--target-precision 0.95] [--slices 0]
 *        [--save public/models/lang-v2.bin]
 *
 * fastText-style: mean of hashed feature vectors → linear → softmax, trained with plain SGD and a
 * linearly decaying learning rate. Classes are re-weighted by (n_max / n_k)^balance so rare languages
 * aren't drowned out. The softmax temperature is fitted on dev (calibration), then the model is
 * quantised to int8 and re-checked, so the reported numbers are those of the file that ships.
 * Never pass the held-out set here — that's eval-assist's job, once.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { featureIds } from '../src/assist/model/features.ts'
import { forward, isShort, loadModel, softmaxT, type ModelHeader } from '../src/assist/model/model.ts'
import { fit, fitTemperature, fnv, rng, rowOf, serialise, type Sample as BaseSample } from './fasttext.ts'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { LANGUAGES, Q } from '../src/assist/questions.ts'
import { passesGate } from '../src/assist/types.ts'

const ROOT = new URL('.', import.meta.url).pathname
const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : dflt
}
const DIM = arg('dim', 16)
const BUCKETS = arg('buckets', 65536)
const EPOCHS = arg('epochs', 8)
const LR = arg('lr', 0.4)
const BALANCE = arg('balance', 0.5)
const SEED = arg('seed', 1)
const SAVE = process.argv.includes('--save') ? process.argv[process.argv.indexOf('--save') + 1] : null
const QUIET = process.argv.includes('--quiet')
/** v2: extra short slices (1–3 lines) cut from each longer training block — what users leave untagged. */
const SLICES = arg('slices', 0)
/** v2: separate softmax temperature for short snippets (≤ 3 non-blank lines), fitted on dev. */
const SHORT_T = process.argv.includes('--short-t')
/** v2: fit the temperature(s) on out-of-repo predictions from 5 repo folds of train instead of on dev. */
const CV_T = process.argv.includes('--cv-temp')
/** v2: with --cv-temp, raise the temperature until out-of-repo precision at the app's gate reaches this. */
const TARGET_P = arg('target-precision', 0)
const TRAIN_FILE = process.argv.includes('--train') ? process.argv[process.argv.indexOf('--train') + 1] : 'data/train.jsonl'

const LABELS = Object.keys(LANGUAGES)
const K = LABELS.length
const idx = new Map(LABELS.map((l, i) => [l, i]))
const PLAIN_IDX = idx.get('plaintext')!

type Sample = BaseSample & { code: string; repo: string; slice?: boolean }
type Row = { label: string; code: string; repo?: string; slice?: boolean }
const load = (rows: Row[]): Sample[] =>
  rows.filter((r) => idx.has(r.label)).map((r) => ({ y: idx.get(r.label)!, ids: featureIds(r.code, BUCKETS), code: r.code, repo: r.repo ?? '', slice: r.slice }))

const t0 = performance.now()
const trainRows = readFileSync(join(ROOT, TRAIN_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Row)
if (SLICES) {
  const r = rng(SEED + 99)
  const extra: Row[] = []
  for (const row of trainRows) {
    const ls = row.code.split('\n').filter((l) => l.trim())
    if (ls.length < 4) continue
    for (let k = 0; k < SLICES; k++) {
      const len = 1 + Math.floor(r() * 3)
      const at = Math.floor(r() * (ls.length - len + 1))
      const code = ls.slice(at, at + len).join('\n')
      if (code.replace(/\s/g, '').length >= 8) extra.push({ label: row.label, code, repo: row.repo, slice: true })
    }
  }
  trainRows.push(...extra)
}
const train = load(trainRows)
const dev = load(JSON.parse(readFileSync(join(ROOT, '../src/assist/__fixtures__/fences.dev.json'), 'utf8')))
const log = (...a: unknown[]) => !QUIET && console.log(...a)
log(`featurised ${train.length} train / ${dev.length} dev in ${((performance.now() - t0) / 1000).toFixed(1)}s`)

// ---------- train ----------
const FIT = { dim: DIM, buckets: BUCKETS, classes: K, epochs: EPOCHS, lr: LR, balance: BALANCE }
const fitWith = (samples: Sample[], seed: number, quiet = QUIET) => fit(samples, { ...FIT, seed, quiet })
const rowFor = (emb: Float32Array) => rowOf(emb, DIM)

/**
 * v2: calibrate on repos the model hasn't seen, from inside train — 5 folds by repo; each fold's model
 * scores the other repos' blocks. Thousands of out-of-repo predictions across ~150 repos instead of
 * the 280 dev blocks, and dev stays a clean check of calibration.
 */
function outOfRepoLogits(): { logits: Float32Array[]; y: number[]; short: boolean[] } {
  const fold = (repo: string) => fnv(repo) % 5
  const out = { logits: [] as Float32Array[], y: [] as number[], short: [] as boolean[] }
  for (let f = 0; f < 5; f++) {
    const w = fitWith(train.filter((s) => fold(s.repo) !== f), SEED + f + 1, true)
    const held = train.filter((s) => fold(s.repo) === f && !s.slice)
    const r = rng(SEED + 50 + f)
    for (const s of held.filter(() => r() < 1500 / Math.max(1, held.length))) {
      out.logits.push(forward(s.ids, DIM, K, rowFor(w.emb), w.W, w.b).logits)
      out.y.push(s.y)
      out.short.push(isShort(s.code))
    }
    log(`cv fold ${f + 1}/5: ${held.length} held-out blocks`)
  }
  return out
}

const weights = fitWith(train, SEED)
const { W, b } = weights
const floatRow = rowFor(weights.emb)

// ---------- calibrate + evaluate on dev ----------
const devLogits = dev.map((s) => forward(s.ids, DIM, K, floatRow, W, b).logits)
function nll(T: number, logits: Float32Array[]) {
  return logits.reduce((a, l, i) => a - Math.log(Math.max(softmaxT(l, T)[dev[i].y], 1e-9)), 0) / logits.length
}
function fitT(idx: number[]) {
  const ls = idx.map((i) => devLogits[i])
  const nllOn = (T: number) => ls.reduce((a, l, j) => a - Math.log(Math.max(softmaxT(l, T)[dev[idx[j]].y], 1e-9)), 0) / Math.max(1, ls.length)
  let best = 1
  for (let T = 0.25; T <= 8; T += 0.05) if (nllOn(T) < nllOn(best)) best = +T.toFixed(2)
  return best
}
void nll
const shortIdx = dev.map((s, i) => (isShort(s.code) ? i : -1)).filter((i) => i >= 0)
const longIdx = dev.map((s, i) => (isShort(s.code) ? -1 : i)).filter((i) => i >= 0)
let bestT: number
let bestTShort: number | undefined
if (CV_T) {
  const oof = outOfRepoLogits()
  const pickIdx = (want: boolean) => oof.logits.map((_, i) => i).filter((i) => !SHORT_T || oof.short[i] === want)
  // Out-of-repo precision of what the app would show at temperature T (top ≥ 0.8, margin ≥ 0.2, not plaintext).
  const gatePrecision = (ix: number[], T: number) => {
    let shown = 0
    let ok = 0
    for (const i of ix) {
      const p = softmaxT(oof.logits[i], T)
      let best = 0
      for (let k = 1; k < K; k++) if (p[k] > p[best]) best = k
      if (best === PLAIN_IDX || !passesGate(Array.from(p))) continue
      shown++
      if (best === oof.y[i]) ok++
    }
    return { precision: ok / Math.max(1, shown), shown: shown / Math.max(1, ix.length) }
  }
  const tune = (ix: number[]) => {
    let T = fitTemperature(ix.map((i) => oof.logits[i]), ix.map((i) => oof.y[i]))
    if (TARGET_P) while (T < 8 && gatePrecision(ix, T).precision < TARGET_P) T = +(T + 0.05).toFixed(2)
    const g = gatePrecision(ix, T)
    log(`  oof (${ix.length}): T ${T} → shown ${(g.shown * 100).toFixed(0)}%, precision ${(g.precision * 100).toFixed(1)}%`)
    return T
  }
  bestT = tune(pickIdx(false))
  if (SHORT_T) bestTShort = tune(pickIdx(true))
} else {
  bestT = SHORT_T ? fitT(longIdx) : fitT(dev.map((_, i) => i))
  bestTShort = SHORT_T ? fitT(shortIdx) : undefined
}

type Pred = { pred: number; conf: number; shown: boolean }
const PLAIN = idx.get('plaintext')!
const gate = (p: ArrayLike<number>): Pred => {
  let best = 0
  for (let k = 1; k < K; k++) if (p[k] > p[best]) best = k
  return { pred: best, conf: p[best], shown: best !== PLAIN && passesGate(Array.from(p)) }
}

function report(name: string, preds: Pred[]) {
  const acc = preds.filter((p, i) => p.pred === dev[i].y).length / preds.length
  const shown = preds.filter((p) => p.shown)
  const right = preds.filter((p, i) => p.shown && p.pred === dev[i].y).length
  const bins = [0, 0.5, 0.7, 0.8, 0.9, 1.01]
  const cal = bins.slice(0, -1).map((lo, j) => {
    const inBin = preds.map((p, i) => ({ p, i })).filter(({ p }) => p.conf >= lo && p.conf < bins[j + 1])
    return inBin.length ? `${lo.toFixed(1)}:${inBin.length}→${Math.round((inBin.filter(({ p, i }) => p.pred === dev[i].y).length / inBin.length) * 100)}%` : ''
  })
  console.log(`${name.padEnd(22)} acc ${(acc * 100).toFixed(1).padStart(5)}%   shown ${String(shown.length).padStart(3)}/${preds.length} (${((shown.length / preds.length) * 100).toFixed(0)}%)   precision ${((right / Math.max(1, shown.length)) * 100).toFixed(1)}%   ${cal.filter(Boolean).join(' ')}`)
}

const header: ModelHeader = { labels: LABELS, buckets: BUCKETS, dim: DIM, temperature: bestT, ...(bestTShort ? { temperatureShort: bestTShort } : {}), featurizer: 1, trainedOn: `${train.length} blocks, training/README.md` }
const buf = serialise(header, weights)
const model = loadModel(buf)
const heur = new HeuristicEngine()
const heurPreds: Pred[] = []
for (const s of dev) {
  const d = await heur.choice(s.code, Q.fenceLanguage, LANGUAGES)
  heurPreds.push(gate(LABELS.map((l) => d.probs[l as keyof typeof d.probs])))
}
const modelPreds = dev.map((s) => gate(LABELS.map((l) => model.predict(s.code)[l])))
const pick = (a: Pred, b2: Pred) => (a.shown ? a : b2.shown ? b2 : a)

console.log(`\ndim ${DIM}  buckets ${BUCKETS}  epochs ${EPOCHS}  lr ${LR}  balance ${BALANCE}  slices ${SLICES}  T ${bestT}${bestTShort ? ` / short ${bestTShort}` : ''}  train ${train.length}  file ${(buf.byteLength / 1024).toFixed(0)} KB (int8)`)
const subset = (name: string, preds: Pred[], idx: number[]) => {
  const sh = idx.filter((i) => preds[i].shown)
  const ok = sh.filter((i) => preds[i].pred === dev[i].y).length
  console.log(`${name.padEnd(22)} acc ${((idx.filter((i) => preds[i].pred === dev[i].y).length / idx.length) * 100).toFixed(1).padStart(5)}%   shown ${String(sh.length).padStart(3)}/${idx.length}   precision ${((ok / Math.max(1, sh.length)) * 100).toFixed(1)}%`)
}
report('heuristics', heurPreds)
report('model (float, T=1)', devLogits.map((l) => gate(softmaxT(l, 1))))
report('model (int8, calib.)', modelPreds)
subset('  · short (≤ 3 lines)', modelPreds, shortIdx)
subset('  · longer', modelPreds, longIdx)
subset('  · heuristics short', heurPreds, shortIdx)
report('hybrid: heur → model', heurPreds.map((h, i) => pick(h, modelPreds[i])))
report('hybrid: model → heur', modelPreds.map((m, i) => pick(m, heurPreds[i])))
report('hybrid: model ∪ agreed heur', modelPreds.map((m, i) => (m.shown ? m : heurPreds[i].shown && heurPreds[i].pred === m.pred ? { ...heurPreds[i] } : m)))

if (SAVE) {
  mkdirSync(dirname(SAVE), { recursive: true })
  writeFileSync(SAVE, new Uint8Array(buf))
  console.log(`saved ${SAVE}`)
}

if (process.argv.includes('--analyze')) {
  const P = dev.map((s) => model.predict(s.code))
  console.log('\nthreshold curve (model, margin 0.2):')
  for (const th of [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95]) {
    const sh = dev.map((s, i) => ({ s, p: P[i] })).map(({ s, p }) => {
      const pr = LABELS.map((l) => p[l])
      const g = gate(pr)
      return { ok: g.pred === s.y, shown: g.pred !== PLAIN && passesGate(pr, th, 0.2) }
    })
    const n = sh.filter((x) => x.shown).length
    console.log(`  ≥${th}: shown ${n} (${Math.round((n / dev.length) * 100)}%)  precision ${((sh.filter((x) => x.shown && x.ok).length / Math.max(1, n)) * 100).toFixed(1)}%`)
  }
  const conf = new Map<string, number>()
  modelPreds.forEach((p, i) => { if (p.pred !== dev[i].y) { const k = `${LABELS[dev[i].y]}→${LABELS[p.pred]}`; conf.set(k, (conf.get(k) ?? 0) + 1) } })
  console.log('\nconfusions:', [...conf].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '))
  console.log('\nshown & wrong:')
  modelPreds.forEach((p, i) => { if (p.shown && p.pred !== dev[i].y) console.log(`  ${LABELS[dev[i].y]}→${LABELS[p.pred]} (${(p.conf * 100).toFixed(0)}%)  ${JSON.stringify(dev[i].code.slice(0, 110))}`) })
}
