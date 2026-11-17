import type { MatchItem, MatchResult, Matcher } from './matcher'

/** Case- and accent-insensitive: "Sugestões" and "sugestoes" are the same word. */
export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Words of a text, folded; punctuation separates them ("Assist: Rules + AI" → assist, rules, ai). */
export const words = (text: string): string[] => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * Words that carry no command on their own ("save **as** pdf", "copia **isso**", "**please** export"): left out of
 * a query that has other words, so they don't have to match. EN + PT, folded (no accents). Kept out of this list on
 * purpose, since they decide the command: off, no (also PT "no" = "em o"), up, down, all, sem; and "aí", which folds
 * to "ai" (AI).
 */
export const FILLER = new Set(
  (
    'a an the to from of in into on for with and or is it its this that these those my me i you can could would ' +
    'please pls want like let lets make turn go do some ' +
    'o os as um uma uns umas de do da dos das em na nos nas para pra por com e ou que meu minha meus minhas ' +
    'isso isto esse essa este esta eu voce quero pode poderia favor fazer faz deixa deixar coloca colocar'
  ).split(' '),
)

/** Where a word was found counts: the name first, then its other-language names, the search words, the group. */
const WEIGHT = { label: 1, alias: 0.9, keyword: 0.8, group: 0.6 } as const

/** Typos forgiven by a typed word's length: none up to 3 letters (too many false hits), 1 up to 7, then 2. */
export function allowedTypos(length: number): number {
  return length >= 8 ? 2 : length >= 4 ? 1 : 0
}

/**
 * Edit distance with swapped neighbors counting as one edit (optimal string alignment): "exprot" → "export" is 1.
 * Stops early once every path is past `max`, returning `max + 1`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let beforePrevious: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowBest = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, beforePrevious[j - 2] + 1)
      current[j] = d
      rowBest = Math.min(rowBest, d)
    }
    if (rowBest > max) return max + 1
    beforePrevious = previous
    previous = current
  }
  return previous[b.length]
}

/** How well one typed word matches one word of an item: exact 1, start 0.9, inside 0.7, a typo 0.5 (two: 0.4). */
export function wordScore(typed: string, word: string): number {
  if (word === typed) return 1
  if (word.startsWith(typed)) return 0.9
  if (word.includes(typed)) return 0.7
  const max = allowedTypos(typed.length)
  // Short words take no typos either: "thme" isn't "the".
  if (max === 0 || word.length < 4) return 0
  // The whole word, or — from 5 typed letters — its start (a typo in a word still being typed: "exprot" in
  // "exportar"); at 4, one typo in a start is too loose ("dark" would find "Markdown").
  const whole = editDistance(typed, word, max)
  const start = typed.length >= 5 && word.length > typed.length ? editDistance(typed, word.slice(0, typed.length), max) : max + 1
  const typos = Math.min(whole, start)
  return typos <= max ? 0.6 - 0.1 * typos : 0
}

interface Field {
  words: string[]
  weight: number
}

function fieldsOf(item: MatchItem): Field[] {
  return [
    { words: words(item.label), weight: WEIGHT.label },
    { words: (item.aliases ?? []).flatMap(words), weight: WEIGHT.alias },
    { words: words(item.keywords ?? ''), weight: WEIGHT.keyword },
    { words: words(item.group), weight: WEIGHT.group },
  ]
}

/** One item's score: the mean of each typed word's best match; 0 when any typed word matches nothing. */
function itemScore(typed: string[], fields: Field[]): number {
  let total = 0
  for (const t of typed) {
    let best = 0
    for (const f of fields) for (const w of f.words) best = Math.max(best, f.weight * wordScore(t, w))
    if (best === 0) return 0
    total += best
  }
  return total / typed.length
}

/** Below this share of the best score, a match is noise next to it ("dark": the theme, not a typo of something else). */
export const KEEP_SHARE = 0.6

/**
 * Every typed word (filler words aside — `FILLER`) must match somewhere in the item — its name in either language, its search words or its group —
 * exactly, as a start, inside a word, or with a typo or two. Best matches first; ties keep the list's order; matches
 * under `KEEP_SHARE` of the best one are left out.
 */
export const fuzzyMatcher: Matcher = {
  rank(query: string, items: readonly MatchItem[]): MatchResult[] {
    const all = words(query)
    if (!all.length) return items.map((i) => ({ id: i.id, score: 1 }))
    // Filler words only count when there's nothing else ("a" alone still searches).
    const meaningful = all.filter((w) => !FILLER.has(w))
    const typed = meaningful.length ? meaningful : all
    const results: MatchResult[] = []
    for (const item of items) {
      const score = itemScore(typed, fieldsOf(item))
      if (score > 0) results.push({ id: item.id, score })
    }
    results.sort((a, b) => b.score - a.score)
    const floor = (results[0]?.score ?? 0) * KEEP_SHARE
    return results.filter((r) => r.score >= floor)
  },
}
