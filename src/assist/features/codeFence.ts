import type { DecisionEngine, Suggestion } from '../types.ts'
import { passesGate } from '../types.ts'
import { findBareFences } from '../prefilter.ts'
import { LANGUAGES, Q, type Language } from '../questions.ts'

export const FENCE_THRESHOLD = { threshold: 0.8, margin: 0.2 }

/**
 * Two-option rule: when no language passes the gate but the top two together clearly dominate
 * (≥ 85 % between them, the second ≥ 20 %), offer both — `void main() { … }` is Java *and* C++.
 * Shared with the eval so the measured rule is the shipped one.
 */
export const PAIR_RULE = { together: 0.85, second: 0.2 }

export function fencePair<T extends string>(probs: Record<T, number>): [T, T] | null {
  const sorted = (Object.entries(probs) as [T, number][]).sort((a, b) => b[1] - a[1])
  const [a, b] = sorted
  if (!a || !b || a[0] === 'plaintext' || b[0] === 'plaintext') return null
  if (passesGate(sorted.map((x) => x[1]), FENCE_THRESHOLD.threshold, FENCE_THRESHOLD.margin)) return null
  return a[1] + b[1] >= PAIR_RULE.together && b[1] >= PAIR_RULE.second ? [a[0], b[0]] : null
}

/** F1 — suggest a language tag for the nearest closed, untagged fence the cursor is NOT inside. */
export async function suggestFenceLanguage(
  text: string,
  cursor: number,
  engine: DecisionEngine,
  isDismissed: (key: string) => boolean,
  signal?: AbortSignal,
): Promise<Suggestion | null> {
  const fences = findBareFences(text)
    .filter((f) => (cursor < f.blockStart || cursor > f.blockEnd) && f.body.trim().length >= 3)
    .sort((a, b) => distance(a, cursor) - distance(b, cursor))

  for (const fence of fences.slice(0, 3)) {
    const key = `codeFence:${hash(fence.body)}`
    if (isDismissed(key)) continue
    const d = await engine.choice<Language>(fence.body, Q.fenceLanguage, LANGUAGES)
    if (signal?.aborted) return null
    const probs = Object.values(d.probs) as number[]
    if (d.choice === 'plaintext' || !passesGate(probs, FENCE_THRESHOLD.threshold, FENCE_THRESHOLD.margin)) {
      // Not sure of one language — but maybe of two. Only the model's probabilities are calibrated
      // enough for this; heuristic scores aren't.
      const pair = engine.kind === 'model' ? fencePair(d.probs) : null
      if (!pair) continue
      const edit = (lang: string) => ({ from: fence.insertAt, to: fence.insertAt, insert: lang })
      return {
        key,
        feature: 'codeFence',
        label: 'Which language?',
        message: { key: 'suggest.fencePair' },
        confidence: d.probs[pair[0]],
        edit: edit(pair[0]),
        expected: '',
        choices: pair.map((lang) => ({ id: lang, label: LANGUAGES[lang], confidence: d.probs[lang], edit: edit(lang) })),
      }
    }
    return {
      key,
      feature: 'codeFence',
      label: `Add language “${d.choice}” to code block`,
      detail: LANGUAGES[d.choice],
      message: { key: 'suggest.fence', vars: { lang: d.choice } },
      confidence: d.probs[d.choice],
      edit: { from: fence.insertAt, to: fence.insertAt, insert: d.choice },
      expected: '',
    }
  }
  return null
}

function distance(f: { blockStart: number; blockEnd: number }, cursor: number): number {
  return cursor < f.blockStart ? f.blockStart - cursor : cursor - f.blockEnd
}

export function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
