import type { Lang } from './i18n'

/**
 * The story page (#story): Marksage's main architecture decisions and models, in date order — a showcase for
 * engineers and recruiters, not documentation (the docs pages hold the detail; entries link to them). Numbers
 * must match docs/MODELS.md and training/README.md. Each language is its own chunk, loaded with the page.
 */
export interface StoryEntry {
  /**
   * ISO day ("2026-08-14") or a range ["2026-10-24", "2026-10-27"]: the timeline shows the month and year, the
   * exact day(s) on hover. Absent for "what's next".
   */
  date?: string | [string, string]
  title: string
  /** Paragraphs; `inline code` in backticks. */
  body: string[]
  /** Short measured facts, shown as a list under the text. */
  facts?: string[]
  /** Where the detail lives. */
  link?: { label: string; hash: 'smart-assist' | 'models' }
}

export interface StoryContent {
  title: string
  intro: string
  /** Shown in place of a date for the entry without one ("Next"). */
  upcoming: string
  entries: StoryEntry[]
}

export function loadStoryPage(lang: Lang) {
  return Promise.all([
    import('../components/StoryPage'),
    lang === 'pt-BR' ? import('./storyContent.pt-BR') : import('./storyContent.en'),
  ])
}
