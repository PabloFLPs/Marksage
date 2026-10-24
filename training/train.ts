/**
 * Step 3 — train the code-language model and evaluate it on the dev set.
 *   node --experimental-strip-types training/train.ts [--dim 16] [--buckets 65536] [--epochs 8]
 *        [--lr 0.4] [--balance 0.5] [--seed 1] [--save public/models/lang-v1.bin]
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
import { FORMAT_VERSION, MAGIC, forward, loadModel, softmaxT, type ModelHeader } from '../src/assist/model/model.ts'
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

const LABELS = Object.keys(LANGUAGES)
const K = LABELS.length
const idx = new Map(LABELS.map((l, i) => [l, i]))

function rng(seed: number) {
  let a = seed
  return () => ((a = (a + 0x6d2b79f5) | 0), ((Math.imul(a ^ (a >>> 15), 1 | a) ^ (a >>> 7)) >>> 0) / 2 ** 32)
}

type Sample = { y: number; ids: Uint32Array; code: string }
const load = (rows: { label: string; code: string }[]): Sample[] =>
  rows.filter((r) => idx.has(r.label)).map((r) => ({ y: idx.get(r.label)!, ids: featureIds(r.code, BUCKETS), code: r.code }))

const t0 = performance.now()
const train = load(readFileSync(join(ROOT, 'data/train.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)))
const dev = load(JSON.parse(readFileSync(join(ROOT, '../src/assist/__fixtures__/fences.dev.json'), 'utf8')))
const log = (...a: unknown[]) => !QUIET && console.log(...a)
log(`featurised ${train.length} train / ${dev.length} dev in ${((performance.now() - t0) / 1000).toFixed(1)}s`)

// ---------- train ----------
const rand = rng(SEED)
const emb = new Float32Array(BUCKETS * DIM).map(() => (rand() * 2 - 1) / DIM)
const W = new Float32Array(DIM * K)
const b = new Float32Array(K)
const counts: number[] = Array.from({ length: K }, () => 0)
for (const s of train) counts[s.y]++
const nMax = Math.max(...counts)
const classW = counts.map((n) => (n ? (nMax / n) ** BALANCE : 0))

const floatRow = (id: number, h: Float32Array) => {
  const base = id * DIM
  for (let d = 0; d < DIM; d++) h[d] += emb[base + d]
}
const order = train.map((_, i) => i)
const total = EPOCHS * train.length
let step = 0
const gH = new Float32Array(DIM)
for (let ep = 0; ep < EPOCHS; ep++) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let loss = 0
  for (const oi of order) {
    const s = train[oi]
    if (!s.ids.length) continue
    const lr = LR * (1 - step++ / total)
    const { h, logits } = forward(s.ids, DIM, K, floatRow, W, b)
    const p = softmaxT(logits, 1)
    loss -= Math.log(Math.max(p[s.y], 1e-9)) * classW[s.y]
    gH.fill(0)
    for (let k = 0; k < K; k++) {
      const g = (p[k] - (k === s.y ? 1 : 0)) * classW[s.y]
      if (g === 0) continue
      for (let d = 0; d < DIM; d++) {
        gH[d] += W[d * K + k] * g
        W[d * K + k] -= lr * g * h[d]
      }
      b[k] -= lr * g
    }
    const scale = lr / s.ids.length
    for (const id of s.ids) {
      const base = id * DIM
      for (let d = 0; d < DIM; d++) emb[base + d] -= scale * gH[d]
    }
  }
  log(`epoch ${ep + 1}/${EPOCHS}  loss ${(loss / train.length).toFixed(4)}`)
}

// ---------- calibrate + evaluate on dev ----------
const devLogits = dev.map((s) => forward(s.ids, DIM, K, floatRow, W, b).logits)
function nll(T: number, logits: Float32Array[]) {
  return logits.reduce((a, l, i) => a - Math.log(Math.max(softmaxT(l, T)[dev[i].y], 1e-9)), 0) / logits.length
}
let bestT = 1
for (let T = 0.25; T <= 6; T += 0.05) if (nll(T, devLogits) < nll(bestT, devLogits)) bestT = +T.toFixed(2)

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

// Quantise: int8 per row with a float scale.
function quantise() {
  const q = new Int8Array(BUCKETS * DIM)
  const scales = new Float32Array(BUCKETS)
  for (let r = 0; r < BUCKETS; r++) {
    let m = 0
    for (let d = 0; d < DIM; d++) m = Math.max(m, Math.abs(emb[r * DIM + d]))
    const s = m / 127
    scales[r] = s
    if (s) for (let d = 0; d < DIM; d++) q[r * DIM + d] = Math.round(emb[r * DIM + d] / s)
  }
  return { q, scales }
}
function serialise(header: ModelHeader): ArrayBuffer {
  const { q, scales } = quantise()
  let headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const pad = (4 - (headerBytes.length % 4)) % 4
  headerBytes = Uint8Array.from([...headerBytes, ...Array.from({ length: pad }, () => 0x20)])
  const embBytes = (q.length + 3) & ~3
  const size = 12 + headerBytes.length + embBytes + scales.byteLength + W.byteLength + b.byteLength
  const buf = new ArrayBuffer(size)
  const view = new DataView(buf)
  view.setUint32(0, MAGIC, true)
  view.setUint32(4, FORMAT_VERSION, true)
  view.setUint32(8, headerBytes.length, true)
  let off = 12
  new Uint8Array(buf, off, headerBytes.length).set(headerBytes)
  off += headerBytes.length
  new Int8Array(buf, off, q.length).set(q)
  off += embBytes
  new Float32Array(buf, off, scales.length).set(scales)
  off += scales.byteLength
  new Float32Array(buf, off, W.length).set(W)
  off += W.byteLength
  new Float32Array(buf, off, b.length).set(b)
  return buf
}

const header: ModelHeader = { labels: LABELS, buckets: BUCKETS, dim: DIM, temperature: bestT, featurizer: 1, trainedOn: `${train.length} blocks, training/README.md` }
const buf = serialise(header)
const model = loadModel(buf)
const heur = new HeuristicEngine()
const heurPreds: Pred[] = []
for (const s of dev) {
  const d = await heur.choice(s.code, Q.fenceLanguage, LANGUAGES)
  heurPreds.push(gate(LABELS.map((l) => d.probs[l as keyof typeof d.probs])))
}
const modelPreds = dev.map((s) => gate(LABELS.map((l) => model.predict(s.code)[l])))
const pick = (a: Pred, b2: Pred) => (a.shown ? a : b2.shown ? b2 : a)

console.log(`\ndim ${DIM}  buckets ${BUCKETS}  epochs ${EPOCHS}  lr ${LR}  balance ${BALANCE}  T ${bestT}  file ${(buf.byteLength / 1024).toFixed(0)} KB (int8)`)
report('heuristics', heurPreds)
report('model (float, T=1)', devLogits.map((l) => gate(softmaxT(l, 1))))
report('model (int8, calib.)', modelPreds)
report('hybrid: heur → model', heurPreds.map((h, i) => pick(h, modelPreds[i])))
report('hybrid: model → heur', modelPreds.map((m, i) => pick(m, heurPreds[i])))

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
