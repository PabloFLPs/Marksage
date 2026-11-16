/**
 * How the command palette finds what was typed. Two implementations: `fuzzyMatcher` (every mode, no download) and,
 * later, an intent model in Rules + AI. Items arrive already filtered by `when`, so a matcher only ranks them.
 */

/** Something the palette can find: a registry command or a recent document. */
export interface MatchItem {
  id: string
  /** Its name in the current language. */
  label: string
  /** Its group's name ("Document", "Go to"…). */
  group: string
  /** Extra search words, in both languages. */
  keywords?: string
  /** Its name in the other languages — found by either. */
  aliases?: readonly string[]
}

export interface MatchResult {
  id: string
  /** 0–1; higher is a better match. */
  score: number
}

export interface Matcher {
  /** The items that match, best first; an empty query returns every item, in order. */
  rank(query: string, items: readonly MatchItem[]): MatchResult[]
}
