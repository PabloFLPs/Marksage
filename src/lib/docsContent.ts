import type { Lang } from './i18n'

export type DocsPageId = 'smart-assist' | 'models'

/** One language's technical docs: the Markdown of each page and the SVGs its images point to. */
export interface DocsContent {
  pages: Record<DocsPageId, string>
  /** Markdown image file name → the SVG, plus a stacked version for narrow screens (app only). */
  svgs: Record<string, { svg: string; narrow?: string }>
}

/**
 * The docs page and its content for one language, in two chunks loaded in parallel (each language is its own
 * chunk, so a reader never downloads the other one). Also used to prefetch while About is open.
 */
export function loadDocsPage(lang: Lang) {
  return Promise.all([
    import('../components/TechDocsPage'),
    lang === 'pt-BR' ? import('./docsContent.pt-BR') : import('./docsContent.en'),
  ])
}
