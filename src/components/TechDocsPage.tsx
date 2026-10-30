import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { copyTextToClipboard } from '../lib/file'
import { ScrollJump } from './ScrollJump'
import { MarkdownPreview } from './MarkdownPreview'
// Single source of truth: the repo docs are rendered in-app with our own renderer (content: lib/docsContent.*).
import type { DocsContent, DocsPageId } from '../lib/docsContent'
import { DocDiagram } from './DocDiagram'
import { useI18n } from '../hooks/useI18n'
import { useOutline } from '../assist/useOutline'
import { useOutlineNav } from '../hooks/useOutlineNav'
import { OutlinePanel, type PanelTab } from './OutlinePanel'
import { DocBar } from './DocBar'
import { useDocKind } from '../hooks/useDocKind'

const noEditor = { current: null }

export interface TechDocsPageProps {
  page: DocsPageId
  /** This language's docs (loaded with the page, see `loadDocsPage`). */
  content: DocsContent
  closing?: boolean
  onBack: () => void
  /** Where Back goes — the page this one was opened from. */
  backLabel: string
  isDesktop: boolean
  /** Rules + AI mode: the Outline may use the section model, as it does for documents. */
  useModel: boolean
}

/** Links between the doc files (they work on GitHub) become in-app pages. */
const INTERNAL_LINKS: Record<string, string> = {
  'SMART-ASSIST.md': '#smart-assist',
  'SMART-ASSIST.pt-BR.md': '#smart-assist',
  'MODELS.md': '#models',
  'MODELS.pt-BR.md': '#models',
}

interface Diagram {
  alt: string
  svg: string
  narrow?: string
  mermaid: string
}

/**
 * In the Markdown (for GitHub): `<!-- diagram: x -->`, the SVG image, then the Mermaid version inside
 * <details>. In the app the whole group becomes one ```marksage-diagram block, rendered as a DocDiagram.
 */
function extractDiagrams(md: string, svgsByFile: DocsContent['svgs']): { md: string; diagrams: Map<string, Diagram> } {
  const diagrams = new Map<string, Diagram>()
  const re = /<!-- diagram: ([\w-]+) -->\n!\[([^\]]*)\]\(([^)]+)\)\n+<details>[\s\S]*?```mermaid\n([\s\S]*?)```\s*<\/details>/g
  const out = md.replace(re, (all, name: string, alt: string, file: string, mermaid: string) => {
    const svgs = svgsByFile[file]
    if (!svgs) return all
    diagrams.set(name, { alt, ...svgs, mermaid })
    return '```marksage-diagram\n' + name + '\n```'
  })
  return { md: out, diagrams }
}

/** Split the doc into its H1 title, intro (before the first `##`) and body, plus `##` titles for the TOC. */
function parseDoc(source: string, svgs: DocsContent['svgs']) {
  const { md, diagrams } = extractDiagrams(source, svgs)
  const lines = md.split('\n')
  const title = (lines.find((l) => l.startsWith('# ')) ?? '').replace(/^#\s+/, '')
  const rest = lines.filter((l) => !l.startsWith('# ')).join('\n')
  const sections = [...rest.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/^\d+\.\s*/, ''))
  return { title, body: rest, sections, diagrams }
}

/** Technical docs pages: "How Smart Assist works" (#smart-assist) and "How the two models work" (#models). */
export function TechDocsPage({ page, content, closing = false, onBack, backLabel, isDesktop, useModel }: TechDocsPageProps) {
  const { t, lang } = useI18n()
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const doc = useMemo(() => parseDoc(content.pages[page], content.svgs), [content, page])

  // The docs double as a demo of the Outline: same panel, reading this page (read-only, it only scrolls).
  const [panelOpen, setPanelOpen] = useState(isDesktop)
  const [tab, setTab] = useState<PanelTab>('outline')
  // Built with the panel closed too: the bar shows the document type the Document tab gives (no model download).
  const outline = useOutline(doc.body, true, useModel, panelOpen)
  const filename = page === 'models' ? 'MODELS.md' : 'SMART-ASSIST.md'
  // Without the file name — the type comes from the text, as for any pasted document.
  const kind = useDocKind(outline.text, outline.items, null, `${page}|${lang}`)
  const showDocument = useCallback(() => {
    setTab('document')
    setPanelOpen(true)
  }, [])
  const nav = useOutlineNav(scrollRef, noEditor, outline.items.map((i) => i.line), panelOpen, `${page}|${lang}`)
  const closePanel = useCallback(() => setPanelOpen(false), [])
  const select = useCallback(
    (line: number) => {
      nav.goTo(line)
      if (!isDesktop) setPanelOpen(false)
    },
    [nav, isDesktop],
  )
  const panel = (variant: 'side' | 'sheet') => (
    <OutlinePanel
      variant={variant}
      items={outline.items}
      status={outline.status}
      activeLine={nav.activeLine}
      onSelect={select}
      onHover={nav.hover}
      onClose={closePanel}
      tab={tab}
      onTabChange={setTab}
      text={outline.text}
      filename={filename}
    />
  )

  const renderBlock = useCallback(
    (lang: string, code: string) => {
      if (lang !== 'marksage-diagram') return null
      const d = doc.diagrams.get(code.trim())
      return d ? <DocDiagram svg={d.svg} narrowSvg={d.narrow} mermaid={d.mermaid} alt={d.alt} /> : null
    },
    [doc],
  )

  // Copy this page's Markdown exactly as in the repo (the GitHub version: SVG image + Mermaid under <details>).
  const [copied, setCopied] = useState(false)
  const copyPage = useCallback(async () => {
    if (!(await copyTextToClipboard(content.pages[page]))) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }, [content, page])

  const jumpTo = (i: number) => {
    const h = bodyRef.current?.querySelectorAll('.markdown-body h2')[i]
    h?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`flex min-h-0 flex-1 ${closing ? 'anim-fade-out' : 'anim-fade'}`}>
    {panelOpen && isDesktop && panel('side')}
    <main ref={scrollRef} className="scroll-area min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className={`mx-auto w-full max-w-[900px] ${closing ? 'anim-stagger-out' : 'anim-stagger'}`}>
        {/* The same bar every document gets: the type, Copy Markdown (the page as in the repo) and the Outline. */}
        <DocBar
          className="pt-8 sm:pt-10"
          kind={kind}
          name={filename}
          fallbackLabel={t('docs.badge')}
          onShowDocument={showDocument}
          copied={copied}
          onCopy={copyPage}
          copyTitle={t('docs.copyTitle')}
          outlineOpen={panelOpen}
          onToggleOutline={() => setPanelOpen((o) => !o)}
          leading={
            <button
              type="button"
              onClick={onBack}
              className="tap -ml-2 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
            >
              <ArrowLeft className="h-4 w-4" /> {backLabel}
            </button>
          }
          extra={
            /* Phones: the header has no room for "Read-only", so the page says it. Read-only by design (no "open in
               editor"); copying the Markdown is the way to take it with you. */
            <span title={t('docs.readOnlyTitle')} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-ink-muted sm:hidden dark:text-dark-ink-muted">
              <Lock className="h-3 w-3" /> {t('docs.readOnly')}
            </span>
          }
        />

        {/* Title block — same restraint as the About page: plain title, accent tagline, quiet contents list. */}
        <header className="px-4 pt-8 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-1 text-sm font-medium text-accent dark:text-dark-accent">{t('app.tagline')}</p>
          {doc.sections.length > 0 && (
            <nav aria-label={t('docs.contents')} className="mt-8">
              <h2 className="mb-3 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
                {t('docs.contents')}
              </h2>
              <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {doc.sections.map((s, i) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => jumpTo(i)}
                      className="tap group inline-flex items-baseline gap-2 text-left text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
                    >
                      <span className="font-mono text-xs text-accent dark:text-dark-accent">{i + 1}</span>
                      <span className="transition-transform duration-200 group-hover:translate-x-0.5">{s}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </header>

        <div ref={bodyRef} className="tech-docs">
          <MarkdownPreview content={doc.body} renderBlock={renderBlock} internalLinks={INTERNAL_LINKS} />
        </div>
      </div>
      <ScrollJump />
    </main>
    {panelOpen && !isDesktop && panel('sheet')}
    </div>
  )
}
