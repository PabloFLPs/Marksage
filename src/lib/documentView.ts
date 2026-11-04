import { lazy, type ComponentType } from 'react'
import type { DocumentViewProps } from '../components/DocumentView'
import { loadDocument } from './storage'

/**
 * The document view — editor, preview, Markdown pipeline, Smart Assist, Outline — is its own chunk: the start screen
 * doesn't need it (pre-launch review, first load). App prefetches it once the start screen has painted; index.html
 * preloads it when a document is stored (vite.config.ts, `marksage-document-preload`).
 */
let loaded: ComponentType<DocumentViewProps> | null = null
export const loadDocumentView = () =>
  import('../components/DocumentView').then((m) => {
    loaded = m.DocumentView
    return m
  })
const LazyDocumentView = lazy(() => loadDocumentView().then((m) => ({ default: m.DocumentView })))

/** The loaded component when it's here, else the lazy one. App picks once: switching later would remount the view. */
export const documentViewComponent = () => loaded ?? LazyDocumentView

/**
 * A stored document opens straight into the view, so main.tsx renders once this has settled: the view is then used
 * directly, with no loading pass — React holds a revealed Suspense boundary back ~300 ms, which a returning visitor
 * waited for on every visit. With nothing stored it resolves at once and the start screen paints without waiting.
 */
export const documentViewReady: Promise<unknown> = loadDocument() ? loadDocumentView().catch(() => {}) : Promise.resolve()
