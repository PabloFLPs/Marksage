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
import { FORMAT_VERSION, MAGIC, forward, isShort, loadModel, softmaxT, type ModelHeader } from '../src/assist/model/model.ts'
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

function fnv(str: string) {
  let h = 2166136261
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
function rng(seed: number) {
  let a = seed
  return () => ((a = (a + 0x6d2b79f5) | 0), ((Math.imul(a ^ (a >>> 15), 1 | a) ^ (a >>> 7)) >>> 0) / 2 ** 32)
}

type Sample = { y: number; ids: Uint32Array; code: string; repo: string; slice?: boolean }
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
type Weights = { emb: Float32Array; W: Float32Array; b: Float32Array }
function fit(samples: Sample[], seed: number, quiet = QUIET): Weights {
  const rand = rng(seed)
  const emb = new Float32Array(BUCKETS * DIM).map(() => (rand() * 2 - 1) / DIM)
  const W = new Float32Array(DIM * K)
  const b = new Float32Array(K)
  const counts: number[] = Array.from({ length: K }, () => 0)
  for (const s of samples) counts[s.y]++
  const nMax = Math.max(...counts)
  const classW = counts.map((n) => (n ? (nMax / n) ** BALANCE : 0))
  const row = (id: number, h: Float32Array) => {
    const base = id * DIM
    for (let d = 0; d < DIM; d++) h[d] += emb[base + d]
  }
  const order = samples.map((_, i) => i)
  const total = EPOCHS * samples.length
  let step = 0
  const gH = new Float32Array(DIM)
  for (let ep = 0; ep < EPOCHS; ep++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    let loss = 0
    for (const oi of order) {
      const s = samples[oi]
      if (!s.ids.length) continue
      const lr = LR * (1 - step++ / total)
      const { h, logits } = forward(s.ids, DIM, K, row, W, b)
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
    if (!quiet) console.log(`epoch ${ep + 1}/${EPOCHS}  loss ${(loss / samples.length).toFixed(4)}`)
  }
  return { emb, W, b }
}
const rowOf = (emb: Float32Array) => (id: number, h: Float32Array) => {
  const base = id * DIM
  for (let d = 0; d < DIM; d++) h[d] += emb[base + d]
}

/**
 * v2: calibrate on repos the model hasn't seen, from inside train — 5 folds by repo; each fold's model
 * scores the other repos' blocks. Thousands of out-of-repo predictions across ~150 repos instead of
 * the 280 dev blocks, and dev stays a clean check of calibration.
 */
function outOfRepoLogits(): { logits: Float32Array[]; y: number[]; short: boolean[] } {
  const fold = (repo: string) => fnv(repo) % 5
  const out = { logits: [] as Float32Array[], y: [] as number[], short: [] as boolean[] }
  for (let f = 0; f < 5; f++) {
    const w = fit(train.filter((s) => fold(s.repo) !== f), SEED + f + 1, true)
    const held = train.filter((s) => fold(s.repo) === f && !s.slice)
    const r = rng(SEED + 50 + f)
    for (const s of held.filter(() => r() < 1500 / Math.max(1, held.length))) {
      out.logits.push(forward(s.ids, DIM, K, rowOf(w.emb), w.W, w.b).logits)
      out.y.push(s.y)
      out.short.push(isShort(s.code))
    }
    log(`cv fold ${f + 1}/5: ${held.length} held-out blocks`)
  }
  return out
}

const { emb, W, b } = fit(train, SEED)
const floatRow = rowOf(emb)

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
function fitOn(logits: Float32Array[], y: number[]) {
  const nllOn = (T: number) => logits.reduce((a, l, j) => a - Math.log(Math.max(softmaxT(l, T)[y[j]], 1e-9)), 0) / Math.max(1, logits.length)
  let best = 1
  for (let T = 0.25; T <= 8; T += 0.05) if (nllOn(T) < nllOn(best)) best = +T.toFixed(2)
  return best
}
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
    let T = fitOn(ix.map((i) => oof.logits[i]), ix.map((i) => oof.y[i]))
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

const header: ModelHeader = { labels: LABELS, buckets: BUCKETS, dim: DIM, temperature: bestT, ...(bestTShort ? { temperatureShort: bestTShort } : {}), featurizer: 1, trainedOn: `${train.length} blocks, training/README.md` }
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
