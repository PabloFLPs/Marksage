import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, ListTree } from 'lucide-react'
import { ScrollJump } from './ScrollJump'
import { MarkdownPreview } from './MarkdownPreview'
// Single source of truth: the repo docs are rendered in-app with our own renderer.
import techDocsEn from '../../docs/SMART-ASSIST.md?raw'
import techDocsPt from '../../docs/SMART-ASSIST.pt-BR.md?raw'
import modelsEn from '../../docs/MODELS.md?raw'
import modelsPt from '../../docs/MODELS.pt-BR.md?raw'
import inferEn from '../../docs/models-inference.svg?raw'
import inferPt from '../../docs/models-inference.pt-BR.svg?raw'
import trainEn from '../../docs/models-training.svg?raw'
import trainPt from '../../docs/models-training.pt-BR.svg?raw'
import archEn from '../../docs/architecture.svg?raw'
import archPt from '../../docs/architecture.pt-BR.svg?raw'
import archNarrowEn from '../../docs/architecture.narrow.svg?raw'
import archNarrowPt from '../../docs/architecture.narrow.pt-BR.svg?raw'
import { DocDiagram } from './DocDiagram'
import { useI18n } from '../hooks/useI18n'
import { useOutline } from '../assist/useOutline'
import { useOutlineNav } from '../hooks/useOutlineNav'
import { OutlinePanel, type PanelTab } from './OutlinePanel'

const noEditor = { current: null }

export type DocsPageId = 'smart-assist' | 'models'

interface TechDocsPageProps {
  page: DocsPageId
  closing?: boolean
  onBack: () => void
  isDesktop: boolean
  /** Local model mode: the Outline may use the section model, as it does for documents. */
  useModel: boolean
}

const DOCS: Record<DocsPageId, { en: string; pt: string }> = {
  'smart-assist': { en: techDocsEn, pt: techDocsPt },
  models: { en: modelsEn, pt: modelsPt },
}

/** Links between the doc files (they work on GitHub) become in-app pages. */
const INTERNAL_LINKS: Record<string, string> = {
  'SMART-ASSIST.md': '#smart-assist',
  'SMART-ASSIST.pt-BR.md': '#smart-assist',
  'MODELS.md': '#models',
  'MODELS.pt-BR.md': '#models',
}

/** The SVG each Markdown image points to, plus a stacked version for narrow screens (app only). */
const SVGS: Record<string, { svg: string; narrow?: string }> = {
  'architecture.svg': { svg: archEn, narrow: archNarrowEn },
  'architecture.pt-BR.svg': { svg: archPt, narrow: archNarrowPt },
  'models-inference.svg': { svg: inferEn },
  'models-inference.pt-BR.svg': { svg: inferPt },
  'models-training.svg': { svg: trainEn },
  'models-training.pt-BR.svg': { svg: trainPt },
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
function extractDiagrams(md: string): { md: string; diagrams: Map<string, Diagram> } {
  const diagrams = new Map<string, Diagram>()
  const re = /<!-- diagram: ([\w-]+) -->\n!\[([^\]]*)\]\(([^)]+)\)\n+<details>[\s\S]*?```mermaid\n([\s\S]*?)```\s*<\/details>/g
  const out = md.replace(re, (all, name: string, alt: string, file: string, mermaid: string) => {
    const svgs = SVGS[file]
    if (!svgs) return all
    diagrams.set(name, { alt, ...svgs, mermaid })
    return '```marksage-diagram\n' + name + '\n```'
  })
  return { md: out, diagrams }
}

/** Split the doc into its H1 title, intro (before the first `##`) and body, plus `##` titles for the TOC. */
function parseDoc(source: string) {
  const { md, diagrams } = extractDiagrams(source)
  const lines = md.split('\n')
  const title = (lines.find((l) => l.startsWith('# ')) ?? '').replace(/^#\s+/, '')
  const rest = lines.filter((l) => !l.startsWith('# ')).join('\n')
  const sections = [...rest.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/^\d+\.\s*/, ''))
  return { title, body: rest, sections, diagrams }
}

/** Technical docs pages: "How Smart Assist works" (#smart-assist) and "How the two models work" (#models). */
export function TechDocsPage({ page, closing = false, onBack, isDesktop, useModel }: TechDocsPageProps) {
  const { t, lang } = useI18n()
  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)
  const doc = useMemo(() => parseDoc(lang === 'pt-BR' ? DOCS[page].pt : DOCS[page].en), [lang, page])

  // The docs double as a demo of the Outline: same panel, reading this page (read-only, it only scrolls).
  const [panelOpen, setPanelOpen] = useState(isDesktop)
  const [tab, setTab] = useState<PanelTab>('outline')
  const outline = useOutline(doc.body, panelOpen, useModel)
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
      filename={page === 'models' ? 'MODELS.md' : 'SMART-ASSIST.md'}
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

  const jumpTo = (i: number) => {
    const h = bodyRef.current?.querySelectorAll('.markdown-body h2')[i]
    h?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`flex min-h-0 flex-1 ${closing ? 'anim-fade-out' : 'anim-fade'}`}>
    {panelOpen && isDesktop && panel('side')}
    <main ref={scrollRef} className="scroll-area min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className={`mx-auto w-full max-w-[900px] ${closing ? 'anim-stagger-out' : 'anim-stagger'}`}>
        <div className="flex items-center justify-between px-4 pt-8 sm:px-6 sm:pt-10">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {page === 'models' ? t('docs.backToDocs') : t('docs.backToAbout')}
          </button>
          <span className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-xs uppercase tracking-wider text-ink-muted sm:inline-flex dark:text-dark-ink-muted">
              <BookOpen className="h-3.5 w-3.5" /> {t('docs.badge')}
            </span>
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              aria-pressed={panelOpen}
              title={t('docs.outlineDemo')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                panelOpen
                  ? 'border-accent text-accent dark:border-dark-accent dark:text-dark-accent'
                  : 'border-line text-ink hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent'
              }`}
            >
              <ListTree className="h-3.5 w-3.5" /> {t('outline.toggle')}
            </button>
          </span>
        </div>

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
                      className="group inline-flex items-baseline gap-2 text-left text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
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
