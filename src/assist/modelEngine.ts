import type { Decision, DecisionEngine } from './types.ts'
import { Q } from './questions.ts'
import { loadModel, type LangModel } from './model/model.ts'
import { combineFence, toChoice } from './model/hybrid.ts'

/**
 * Hybrid mode: Marksage's own code-language model answers code-block languages (and the
 * language tag of a code paste) — v2 also accepts a confident heuristic answer when the model's top
 * pick agrees (see model/hybrid.ts); every other question goes to the heuristic engine. The model is ~385 KB and decides
 * in ~0.1 ms, so it runs on the main thread — a worker would cost more than the inference.
 *
 * The file is fetched lazily (only when this mode is picked), with progress, and kept in the Cache
 * API so later sessions don't download it again. One load is shared by every engine instance.
 * If anything fails, `ready()` rejects and the hook keeps the heuristics (status "fallback").
 */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/lang-v2.bin`
/** Section types for the Outline panel (training/train-sections.ts) — fetched only while the panel is open. */
export const SECTIONS_MODEL_URL = `${import.meta.env.BASE_URL}models/sections-v2.bin`
const CACHE_NAME = 'marksage-models-v1'
const loads = new Map<string, Promise<LangModel>>()
const listeners = new Map<string, Set<(loaded: number, total: number) => void>>()

/** Load a Marksage model file once per page (cached in the browser after the first download). */
export function sharedLoad(url: string, onProgress: (loaded: number, total: number) => void = () => {}): Promise<LangModel> {
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
    return combineFence(toChoice(this.model.predict(state), options), () => this.fallback.choice(state, q, options))
  }

  score(state: string, q: string, scale: string[]) {
    return this.fallback.score(state, q, scale)
  }

  noul(state: string, statement: string) {
    return this.fallback.noul(state, statement)
  }
}

/** Remove the downloaded models from this browser (they download again if the mode is picked later). */
export async function deleteDownloadedModel(): Promise<boolean> {
  loads.clear()
  try {
    return await caches.delete(CACHE_NAME)
  } catch {
    return false
  }
}

/** Whether any model file is currently stored in this browser. */
export async function hasDownloadedModel(): Promise<boolean> {
  try {
    if (!(await caches.has(CACHE_NAME))) return false // don't create an empty cache just by asking
    return (await (await caches.open(CACHE_NAME)).keys()).length > 0
  } catch {
    return false
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
    // A newer version replaces the old file of the same model ("lang-v1" → "lang-v2") instead of piling up.
    const href = new URL(url, location.href).href
    const family = (u: string) => u.replace(/-v\d+\.bin(\?.*)?$/, '')
    for (const req of (await cache?.keys()) ?? []) if (req.url !== href && family(req.url) === family(href)) await cache?.delete(req)
  } catch {
    // Quota or private mode — the model still works for this session.
  }
  return buf
}
