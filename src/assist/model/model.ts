/**
 * Marksage's code-language model: fastText-style — the mean of one learned vector per hashed
 * feature, then a linear layer and a softmax. Inference is a few thousand multiply-adds, so it runs
 * in well under a millisecond in plain JS.
 *
 * Binary format (little-endian), produced by training/train.ts:
 *   magic "MSLM" · u32 version · u32 headerBytes · header JSON (utf-8, padded to 4 bytes)
 *   · int8[buckets × dim] embeddings · f32[buckets] per-row scales
 *   · f32[dim × classes] output weights · f32[classes] bias
 *   (the output weights are f32[(dim × parts) × classes] when `pooling` concatenates parts, see below)
 * header = { labels, buckets, dim, temperature, temperatureShort?, featurizer, trainedOn, pooling? }
 * The same format carries the section-type model (training/train-sections.ts, featurizer 2).
 *
 * Pooling (v3 experiment, 2026-10-30): how the clue vectors become one vector. "mean" (v1/v2, the default when the
 * header has none) averages them; "mean+max" also keeps, per dimension, the largest value any clue has — so one
 * decisive clue can't be averaged away — and "mean+max+min" the smallest too. Parts are concatenated.
 */
import { featureIds } from './features.ts'
import { sectionFeatureIds } from './sectionFeatures.ts'

/** header.featurizer → features: 1 = code (features.ts, language model), 2 = sections (sectionFeatures.ts). */
export const FEATURIZERS: Record<number, (text: string, buckets: number) => Uint32Array> = { 1: featureIds, 2: sectionFeatureIds }

export interface ModelHeader {
  labels: string[]
  buckets: number
  dim: number
  /** Softmax temperature fitted on the dev set (calibration). */
  temperature: number
  /** v2: temperature for short snippets (≤ SHORT_LINES non-blank lines), which are easier to over-trust. */
  temperatureShort?: number
  featurizer: number
  trainedOn: string
  /** Missing = "mean" (v1, v2). */
  pooling?: Pooling
}

export type Pooling = 'mean' | 'mean+max' | 'mean+max+min'
/** Number of dim-sized parts the pooled vector has. */
export const poolParts = (p: Pooling = 'mean') => (p === 'mean' ? 1 : p === 'mean+max' ? 2 : 3)

export interface LangModel {
  header: ModelHeader
  /** Raw scores before softmax (temperature not applied). */
  logits(code: string): Float32Array
  /** Calibrated probabilities, keyed by label. */
  predict(code: string): Record<string, number>
}

export const MAGIC = 0x4d4c534d // "MSLM"
export const SHORT_LINES = 3

export function isShort(code: string): boolean {
  let n = 0
  for (const l of code.split('\n')) if (l.trim() && ++n > SHORT_LINES) return false
  return true
}

/** The temperature this snippet is calibrated with. */
export function temperatureFor(header: Pick<ModelHeader, 'temperature' | 'temperatureShort'>, code: string): number {
  return header.temperatureShort && isShort(code) ? header.temperatureShort : header.temperature
}
export const FORMAT_VERSION = 1

export function softmaxT(logits: Float32Array, temperature: number): Float32Array {
  let max = -Infinity
  for (const v of logits) if (v > max) max = v
  const out = new Float32Array(logits.length)
  let sum = 0
  for (let i = 0; i < logits.length; i++) sum += out[i] = Math.exp((logits[i] - max) / temperature)
  for (let i = 0; i < out.length; i++) out[i] /= sum
  return out
}

/**
 * Shared forward pass over float weights (trainer) or dequantized rows (app). `row(id, h)` adds clue `id`'s vector
 * into `h`. With max / min pooling, `arg` (if given, length dim × parts) receives the clue that won each max / min
 * slot — the trainer sends that slot's gradient to it.
 */
export function forward(
  ids: Uint32Array,
  dim: number,
  classes: number,
  row: (id: number, h: Float32Array) => void,
  W: Float32Array,
  b: Float32Array,
  pooling: Pooling = 'mean',
  arg?: Int32Array,
): { h: Float32Array; logits: Float32Array } {
  const parts = poolParts(pooling)
  const H = dim * parts
  const h = new Float32Array(H)
  if (parts === 1) {
    for (const id of ids) row(id, h)
  } else if (ids.length) {
    const v = new Float32Array(dim)
    for (let d = dim; d < H; d++) h[d] = d < 2 * dim ? -Infinity : Infinity
    for (const id of ids) {
      v.fill(0)
      row(id, v)
      for (let d = 0; d < dim; d++) {
        const x = v[d]
        h[d] += x
        if (x > h[dim + d]) {
          h[dim + d] = x
          if (arg) arg[dim + d] = id
        }
        if (parts === 3 && x < h[2 * dim + d]) {
          h[2 * dim + d] = x
          if (arg) arg[2 * dim + d] = id
        }
      }
    }
  }
  if (ids.length) for (let d = 0; d < dim; d++) h[d] /= ids.length
  const logits = new Float32Array(classes)
  for (let k = 0; k < classes; k++) {
    let s = b[k]
    for (let d = 0; d < H; d++) s += W[d * classes + k] * h[d]
    logits[k] = s
  }
  return { h, logits }
}

export function loadModel(buf: ArrayBuffer): LangModel {
  const view = new DataView(buf)
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a Marksage model')
  const version = view.getUint32(4, true)
  if (version !== FORMAT_VERSION) throw new Error(`Unsupported model format v${version}`)
  const headerBytes = view.getUint32(8, true)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, headerBytes))) as ModelHeader
  let off = 12 + headerBytes
  const { buckets, dim, labels } = header
  const K = labels.length
  const emb = new Int8Array(buf, off, buckets * dim)
  off += buckets * dim
  off = (off + 3) & ~3
  const scales = new Float32Array(buf, off, buckets)
  off += buckets * 4
  const H = dim * poolParts(header.pooling)
  const W = new Float32Array(buf, off, H * K)
  off += H * K * 4
  const b = new Float32Array(buf, off, K)

  const row = (id: number, h: Float32Array) => {
    const s = scales[id]
    if (s === 0) return
    const base = id * dim
    for (let d = 0; d < dim; d++) h[d] += emb[base + d] * s
  }
  const featurize = FEATURIZERS[header.featurizer]
  if (!featurize) throw new Error(`Unknown featurizer ${header.featurizer}`)
  const logits = (code: string) => forward(featurize(code, buckets), dim, K, row, W, b, header.pooling).logits
  return {
    header,
    logits,
    predict(code) {
      const p = softmaxT(logits(code), temperatureFor(header, code))
      const out: Record<string, number> = {}
      labels.forEach((l, i) => (out[l] = p[i]))
      return out
    },
  }
}
