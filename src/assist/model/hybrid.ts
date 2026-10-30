import type { Decision } from '../types.ts'
import { passesGate } from '../types.ts'

/**
 * A rules answer this sure stands even when the model is unsure and disagrees (2026-10-30, launch QA #17): on short
 * snippets the model's mean-pooled features dilute a few decisive cues — `const x: number = 1;` gave js 63 % while
 * the rules said ts 99 %. On the fixture sets this added one right suggestion (dev) and no wrong one anywhere.
 */
export const RULES_OVERRIDE = 0.99

/**
 * Model v2's combination rule for code-block languages, shared by the app (ModelEngine) and the eval:
 * the model answers when it is confident; otherwise a confident heuristic answer is used if the model's own top
 * pick agrees (two independent methods agreeing adds suggestions without adding mistakes) — or if the rules are
 * nearly certain (RULES_OVERRIDE), decided by the rules alone (no ✦).
 */
export function combineFence<T extends string>(model: Decision<T>, heuristic: () => Promise<Decision<T>>): Promise<Decision<T>> | Decision<T> {
  const confident = (d: Decision<T>) => d.choice !== 'plaintext' && passesGate(Object.values(d.probs) as number[])
  if (confident(model)) return { ...model, by: 'model' }
  return heuristic().then((h) => {
    if (!confident(h)) return { ...model, by: 'model' }
    if (h.choice === model.choice) return { ...h, by: 'agreement' }
    return h.probs[h.choice] >= RULES_OVERRIDE ? { ...h, by: undefined } : { ...model, by: 'model' }
  })
}

/** Probabilities → a Decision restricted to the asked options (renormalised). */
export function toChoice<T extends string>(p: Record<string, number>, options: Record<T, string>): Decision<T> {
  const keys = Object.keys(options) as T[]
  const sum = keys.reduce((s, k) => s + (p[k] ?? 0), 0) || 1
  const probs = {} as Record<T, number>
  let best = keys[0]
  for (const k of keys) {
    probs[k] = (p[k] ?? 0) / sum
    if (probs[k] > probs[best]) best = k
  }
  return { choice: best, probs }
}
