import type { Decision, DecisionEngine } from './types.ts'
import { Q } from './questions.ts'
import { loadModel, type LangModel } from './model/model.ts'

/**
 * "Local model" mode: Marksage's own code-language model answers F1 (and the language tag of a
 * code paste); every other question goes to the heuristic engine. The model is ~385 KB and decides
 * in ~0.1 ms, so it runs on the main thread — a worker would cost more than the inference.
 *
 * The file is fetched lazily (only when this mode is picked), with progress, and kept in the Cache
 * API so later sessions don't download it again. One load is shared by every engine instance.
 * If anything fails, `ready()` rejects and the hook keeps the heuristics (status "fallback").
 */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/lang-v1.bin`
const CACHE_NAME = 'marksage-models-v1'
const loads = new Map<string, Promise<LangModel>>()
const listeners = new Map<string, Set<(loaded: number, total: number) => void>>()

function sharedLoad(url: string, onProgress: (loaded: number, total: number) => void): Promise<LangModel> {
  const subs = listeners.get(url) ?? listeners.set(url, new Set()).get(url)!
  subs.add(onProgress)
  let p = loads.get(url)
  if (!p) {
    p = fetchModel(url, (l, t) => subs.forEach((f) => f(l, t))).then(loadModel)
    p.catch(() => loads.delete(url)) // allow a retry next time the mode is picked
    loads.set(url, p)
  }
  return p.finally(() => subs.delete(onProgress))
}

export class ModelEngine implements DecisionEngine {
  readonly kind = 'model' as const
  onProgress?: (loaded: number, total: number) => void
  private model: LangModel | null = null
  private loading: Promise<void> | null = null
  private readonly fallback: DecisionEngine
  private readonly url: string

  constructor(fallback: DecisionEngine, url = MODEL_URL) {
    this.fallback = fallback
    this.url = url
  }

  ready(): Promise<void> {
    this.loading ??= sharedLoad(this.url, (l, t) => this.onProgress?.(l, t)).then((m) => {
      this.model = m
    })
    return this.loading
  }

  async choice<T extends string>(state: string, q: string, options: Record<T, string>): Promise<Decision<T>> {
    if (q !== Q.fenceLanguage || !this.model) return this.fallback.choice(state, q, options)
    const p = this.model.predict(state)
    const keys = Object.keys(options) as T[]
    // Restrict to the options asked for (normally the same 21 languages) and renormalise.
    const sum = keys.reduce((s, k) => s + (p[k] ?? 0), 0) || 1
    const probs = {} as Record<T, number>
    let best = keys[0]
    for (const k of keys) {
      probs[k] = (p[k] ?? 0) / sum
      if (probs[k] > probs[best]) best = k
    }
    return { choice: best, probs }
  }

  score(state: string, q: string, scale: string[]) {
    return this.fallback.score(state, q, scale)
  }

  noul(state: string, statement: string) {
    return this.fallback.noul(state, statement)
  }
}

async function fetchModel(url: string, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try {
    cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (hit) return await hit.arrayBuffer()
  } catch {
    cache = null // Cache API unavailable (private mode, insecure origin) — plain fetch still works.
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`model download failed (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  let buf: ArrayBuffer
  if (res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress(loaded, total)
    }
    const all = new Uint8Array(loaded)
    let off = 0
    for (const c of chunks) {
      all.set(c, off)
      off += c.byteLength
    }
    buf = all.buffer
  } else {
    buf = await res.arrayBuffer()
  }

  try {
    await cache?.put(url, new Response(buf.slice(0), { headers: { 'content-type': 'application/octet-stream' } }))
  } catch {
    // Quota or private mode — the model still works for this session.
  }
  return buf
}
