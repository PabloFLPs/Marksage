import type { Decision } from '../types.ts'
import { passesGate } from '../types.ts'

/**
 * Model v2's combination rule for code-block languages, shared by the app (ModelEngine) and the eval:
 * the model answers when it is confident; otherwise a confident heuristic answer is used only if the
 * model's own top pick agrees. Two independent methods agreeing adds suggestions without adding mistakes.
 */
export function combineFence<T extends string>(model: Decision<T>, heuristic: () => Promise<Decision<T>>): Promise<Decision<T>> | Decision<T> {
  const confident = (d: Decision<T>) => d.choice !== 'plaintext' && passesGate(Object.values(d.probs) as number[])
  if (confident(model)) return model
  return heuristic().then((h) => (confident(h) && h.choice === model.choice ? h : model))
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
