/**
 * Marksage's code-language model: fastText-style — the mean of one learned vector per hashed
 * feature, then a linear layer and a softmax. Inference is a few thousand multiply-adds, so it runs
 * in well under a millisecond in plain JS.
 *
 * Binary format (little-endian), produced by training/train.ts:
 *   magic "MSLM" · u32 version · u32 headerBytes · header JSON (utf-8, padded to 4 bytes)
 *   · int8[buckets × dim] embeddings · f32[buckets] per-row scales
 *   · f32[dim × classes] output weights · f32[classes] bias
 * header = { labels, buckets, dim, temperature, featurizer, trainedOn }
 */
import { featureIds } from './features.ts'

export interface ModelHeader {
  labels: string[]
  buckets: number
  dim: number
  /** Softmax temperature fitted on the dev set (calibration). */
  temperature: number
  featurizer: number
  trainedOn: string
}

export interface LangModel {
  header: ModelHeader
  /** Raw scores before softmax (temperature not applied). */
  logits(code: string): Float32Array
  /** Calibrated probabilities, keyed by label. */
  predict(code: string): Record<string, number>
}

export const MAGIC = 0x4d4c534d // "MSLM"
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

/** Shared forward pass over float weights (trainer) or dequantized rows (app). */
export function forward(
  ids: Uint32Array,
  dim: number,
  classes: number,
  row: (id: number, h: Float32Array) => void,
  W: Float32Array,
  b: Float32Array,
): { h: Float32Array; logits: Float32Array } {
  const h = new Float32Array(dim)
  for (const id of ids) row(id, h)
  if (ids.length) for (let d = 0; d < dim; d++) h[d] /= ids.length
  const logits = new Float32Array(classes)
  for (let k = 0; k < classes; k++) {
    let s = b[k]
    for (let d = 0; d < dim; d++) s += W[d * classes + k] * h[d]
    logits[k] = s
  }
  return { h, logits }
}

export function loadModel(buf: ArrayBuffer): LangModel {
  const view = new DataView(buf)
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a Marksage language model')
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
  const W = new Float32Array(buf, off, dim * K)
  off += dim * K * 4
  const b = new Float32Array(buf, off, K)

  const row = (id: number, h: Float32Array) => {
    const s = scales[id]
    if (s === 0) return
    const base = id * dim
    for (let d = 0; d < dim; d++) h[d] += emb[base + d] * s
  }
  const logits = (code: string) => forward(featureIds(code, buckets), dim, K, row, W, b).logits
  return {
    header,
    logits,
    predict(code) {
      const p = softmaxT(logits(code), header.temperature)
      const out: Record<string, number> = {}
      labels.forEach((l, i) => (out[l] = p[i]))
      return out
    },
  }
}
