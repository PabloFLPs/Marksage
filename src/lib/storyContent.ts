import type { Lang } from './i18n'

/**
 * The story page (#story): Marksage's main architecture decisions and models, in date order — a showcase for
 * engineers and recruiters, not documentation (the docs pages hold the detail; entries link to them). Numbers
 * must match docs/MODELS.md and training/README.md. Each language is its own chunk, loaded with the page.
 */
export interface StoryEntry {
  /** Shown as written ("Aug 14, 2026", "Oct 28–30"). */
  date: string
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
  entries: StoryEntry[]
}

export function loadStoryPage(lang: Lang) {
  return Promise.all([
    import('../components/StoryPage'),
    lang === 'pt-BR' ? import('./storyContent.pt-BR') : import('./storyContent.en'),
  ])
}
