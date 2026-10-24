import { useMemo, useRef } from 'react'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { MarkdownPreview } from './MarkdownPreview'
// Single source of truth: the repo docs are rendered in-app with our own renderer.
import techDocsEn from '../../docs/SMART-ASSIST.md?raw'
import techDocsPt from '../../docs/SMART-ASSIST.pt-BR.md?raw'
import { useI18n } from '../hooks/useI18n'

interface TechDocsPageProps {
  closing?: boolean
  onBack: () => void
}

/** Split the doc into its H1 title, intro (before the first `##`) and body, plus `##` titles for the TOC. */
function parseDoc(md: string) {
  const lines = md.split('\n')
  const title = (lines.find((l) => l.startsWith('# ')) ?? '').replace(/^#\s+/, '')
  const rest = lines.filter((l) => !l.startsWith('# ')).join('\n')
  const sections = [...rest.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/^\d+\.\s*/, ''))
  return { title, body: rest, sections }
}

/** "How Smart Assist works" — technical docs (heuristics, own model, evaluation). */
export function TechDocsPage({ closing = false, onBack }: TechDocsPageProps) {
  const { t, lang } = useI18n()
  const bodyRef = useRef<HTMLDivElement>(null)
  const doc = useMemo(() => parseDoc(lang === 'pt-BR' ? techDocsPt : techDocsEn), [lang])

  const jumpTo = (i: number) => {
    const h = bodyRef.current?.querySelectorAll('.markdown-body h2')[i]
    h?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className={`scroll-area min-h-0 flex-1 overflow-y-auto ${closing ? 'anim-fade-out' : 'anim-fade'}`}>
      <div className={`mx-auto w-full max-w-[900px] ${closing ? 'anim-stagger-out' : 'anim-stagger'}`}>
        <div className="flex items-center justify-between px-4 pt-8 sm:px-6 sm:pt-10">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {t('docs.backToAbout')}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
            <BookOpen className="h-3.5 w-3.5" /> {t('docs.badge')}
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
          <MarkdownPreview content={doc.body} />
        </div>
      </div>
    </main>
  )
}
