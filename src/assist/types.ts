/**
 * Smart Assist — decision-model contracts.
 * The engine only *decides* between options fixed up front; our code acts.
 */

export type Decision<T extends string> = { choice: T; probs: Record<T, number> }

export interface DecisionEngine {
  readonly kind: 'heuristic' | 'model'
  ready(): Promise<void>
  /** Pick one of `options` (key → human description). `q` is a stable question id. */
  choice<T extends string>(state: string, q: string, options: Record<T, string>): Promise<Decision<T>>
  /** Place `state` on an ordered scale. `value` is the argmax index. */
  score(state: string, q: string, scale: string[]): Promise<{ value: number; probs: number[] }>
  /** Probability that `statement` is true about `state`. */
  noul(state: string, statement: string): Promise<number>
  dispose?(): void
}

export type AssistMode = 'off' | 'heuristics' | 'model'

export type FeatureId = 'codeFence' | 'smartPaste' | 'structure'

/** A text edit expressed against the document the suggestion was computed on. */
export interface TextEdit {
  from: number
  to: number
  insert: string
}

export interface Suggestion {
  /** Stable key — used for dedup and "don't show again this session". */
  key: string
  feature: FeatureId
  label: string
  detail?: string
  /** i18n message for the label / detail (UI translates; `label` stays as English fallback). */
  message?: { key: string; vars?: Record<string, string> }
  detailKey?: string
  confidence: number
  edit: TextEdit
  /** Guard: the text in [from, to) must still equal this when accepting. */
  expected: string
  /**
   * A choice instead of a single fix: the user picks one (Tab = first, Alt+2 = second, or click).
   * `edit` above is the first choice's edit.
   */
  choices?: SuggestionChoice[]
}

export interface SuggestionChoice {
  id: string
  label: string
  confidence: number
  edit: TextEdit
}

export interface ReadabilityMark {
  /** Heading text of the `##` section. */
  heading: string
  /** 0 = very easy … 4 = very hard */
  value: number
  label: string
}

/** Confidence gate from the spec: top ≥ threshold AND margin over 2nd ≥ minMargin. */
export function passesGate(probs: number[], threshold = 0.8, minMargin = 0.2): boolean {
  const sorted = [...probs].sort((a, b) => b - a)
  const top = sorted[0] ?? 0
  const second = sorted[1] ?? 0
  return top >= threshold && top - second >= minMargin
}

export function softmax(scores: number[], temperature = 1): number[] {
  const max = Math.max(...scores)
  const exps = scores.map((s) => Math.exp((s - max) / temperature))
  const sum = exps.reduce((a, b) => a + b, 0)
  return exps.map((e) => e / sum)
}

export function toDecision<T extends string>(keys: T[], scores: number[], temperature = 1): Decision<T> {
  const p = softmax(scores, temperature)
  const probs = {} as Record<T, number>
  let best = 0
  keys.forEach((k, i) => {
    probs[k] = p[i]
    if (p[i] > p[best]) best = i
  })
  return { choice: keys[best], probs }
}
