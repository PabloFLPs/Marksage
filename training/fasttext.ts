/**
 * Shared training code for Marksage's small models (code languages, section types):
 * fastText-style — mean of hashed feature vectors → linear → softmax, plain SGD with a linearly
 * decaying learning rate, class re-weighting, int8 export in the MSLM format (src/assist/model/model.ts).
 */
import { FORMAT_VERSION, MAGIC, forward, poolParts, softmaxT, type ModelHeader, type Pooling } from '../src/assist/model/model.ts'

export function fnv(str: string): number {
  let h = 2166136261
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed
  return () => ((a = (a + 0x6d2b79f5) | 0), ((Math.imul(a ^ (a >>> 15), 1 | a) ^ (a >>> 7)) >>> 0) / 2 ** 32)
}

export type Sample = { y: number; ids: Uint32Array }
export type Weights = { emb: Float32Array; W: Float32Array; b: Float32Array }
export interface FitOptions {
  dim: number
  buckets: number
  classes: number
  epochs: number
  lr: number
  /** Class weights (n_max / n_k)^balance — 0 = none, 1 = fully balanced. */
  balance: number
  seed: number
  quiet?: boolean
  /** v3 experiment: "mean" (default), "mean+max", "mean+max+min" — see model.ts. */
  pooling?: Pooling
  /**
   * Learning-rate factor for the max / min parts' clue updates (default 1). Mean pooling spreads a step over all n
   * clues (lr / n each); a max slot sends the whole step to one clue — at the mean part's rate that diverged.
   */
  poolLr?: number
  /**
   * Max / min pooling only: keep every clue number within ±embClip. Without a bound, scaling clue numbers and output
   * weights up together keeps lowering the loss — the numbers grew ~170× and raw scores reached 10⁵ (2026-10-30).
   */
  embClip?: number
}

export const rowOf = (emb: Float32Array, dim: number) => (id: number, h: Float32Array) => {
  const base = id * dim
  for (let d = 0; d < dim; d++) h[d] += emb[base + d]
}

export function fit(samples: Sample[], o: FitOptions): Weights {
  const { dim, buckets, classes: K, epochs, lr: LR, balance } = o
  const pooling = o.pooling ?? 'mean'
  const H = dim * poolParts(pooling)
  const rand = rng(o.seed)
  const emb = new Float32Array(buckets * dim).map(() => (rand() * 2 - 1) / dim)
  const W = new Float32Array(H * K)
  const b = new Float32Array(K)
  const counts: number[] = Array.from({ length: K }, () => 0)
  for (const s of samples) counts[s.y]++
  const nMax = Math.max(...counts)
  const classW = counts.map((n) => (n ? (nMax / n) ** balance : 0))
  const row = rowOf(emb, dim)
  const order = samples.map((_, i) => i)
  const total = epochs * samples.length
  let step = 0
  const gH = new Float32Array(H)
  const arg = new Int32Array(H)
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    let loss = 0
    for (const oi of order) {
      const s = samples[oi]
      if (!s.ids.length) continue
      const lr = LR * (1 - step++ / total)
      const { h, logits } = forward(s.ids, dim, K, row, W, b, pooling, arg)
      const p = softmaxT(logits, 1)
      loss -= Math.log(Math.max(p[s.y], 1e-9)) * classW[s.y]
      gH.fill(0)
      for (let k = 0; k < K; k++) {
        const g = (p[k] - (k === s.y ? 1 : 0)) * classW[s.y]
        if (g === 0) continue
        for (let d = 0; d < H; d++) {
          gH[d] += W[d * K + k] * g
          W[d * K + k] -= lr * g * h[d]
        }
        b[k] -= lr * g
      }
      const scale = lr / s.ids.length
      for (const id of s.ids) {
        const base = id * dim
        for (let d = 0; d < dim; d++) emb[base + d] -= scale * gH[d]
      }
      // Max / min parts: each slot's gradient goes to the one clue that won it.
      const poolStep = lr * (o.poolLr ?? 1)
      const clip = o.embClip ?? Infinity
      for (let d = dim; d < H; d++) {
        const at = arg[d] * dim + (d % dim)
        emb[at] = Math.max(-clip, Math.min(clip, emb[at] - poolStep * gH[d]))
      }
      if (H > dim && clip < Infinity)
        for (const id of s.ids) for (let d = 0; d < dim; d++) emb[id * dim + d] = Math.max(-clip, Math.min(clip, emb[id * dim + d]))
    }
    if (!o.quiet) console.log(`epoch ${ep + 1}/${epochs}  loss ${(loss / samples.length).toFixed(4)}`)
  }
  return { emb, W, b }
}

/** Temperature minimising negative log-likelihood on (logits, y). */
export function fitTemperature(logits: Float32Array[], y: number[]): number {
  const nllOn = (T: number) => logits.reduce((a, l, j) => a - Math.log(Math.max(softmaxT(l, T)[y[j]], 1e-9)), 0) / Math.max(1, logits.length)
  let best = 1
  // Up to 40 (v3 experiment: max pooling made raw scores far larger); steps of 0.05 up to 8 as before, 0.5 above.
  for (let T = 0.25; T <= 40; T += T < 8 ? 0.05 : 0.5) if (nllOn(T) < nllOn(best)) best = +T.toFixed(2)
  return best
}

/** int8 embeddings with a per-row scale, float output layer → MSLM file. */
export function serialise(header: ModelHeader, w: Weights): ArrayBuffer {
  const { buckets: B, dim: D } = header
  const q = new Int8Array(B * D)
  const scales = new Float32Array(B)
  for (let r = 0; r < B; r++) {
    let m = 0
    for (let d = 0; d < D; d++) m = Math.max(m, Math.abs(w.emb[r * D + d]))
    const s = m / 127
    scales[r] = s
    if (s) for (let d = 0; d < D; d++) q[r * D + d] = Math.round(w.emb[r * D + d] / s)
  }
  let headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const pad = (4 - (headerBytes.length % 4)) % 4
  headerBytes = Uint8Array.from([...headerBytes, ...Array.from({ length: pad }, () => 0x20)])
  const embBytes = (q.length + 3) & ~3
  const size = 12 + headerBytes.length + embBytes + scales.byteLength + w.W.byteLength + w.b.byteLength
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
  new Float32Array(buf, off, w.W.length).set(w.W)
  off += w.W.byteLength
  new Float32Array(buf, off, w.b.length).set(w.b)
  return buf
}
