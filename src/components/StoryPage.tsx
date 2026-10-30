import { Fragment, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { StoryContent, StoryEntry } from '../lib/storyContent'
import { useI18n } from '../hooks/useI18n'

export interface StoryPageProps {
  content: StoryContent
  closing?: boolean
  onBack: () => void
  backLabel: string
}

/** `inline code` in backticks → <code>; everything else as text. */
function inline(text: string): ReactNode {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
  )
}

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Oct 2026" / "out 2026" on the timeline; the exact day(s) — "October 24 – 27, 2026" — on hover. */
function EntryDate({ date, upcoming, lang }: { date: StoryEntry['date']; upcoming: string; lang: string }) {
  const cls = 'font-mono text-xs text-accent dark:text-dark-accent'
  if (!date) return <p className={cls}>{upcoming}</p>
  const [from, to] = Array.isArray(date) ? date : [date, date]
  // Month + year from the parts, so PT reads "ago 2026" rather than "ago. de 2026".
  const parts = new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(day(from))
  const label = ['month', 'year'].map((t) => parts.find((p) => p.type === t)?.value.replace('.', '') ?? '').join(' ')
  const full = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const exact = from === to ? full.format(day(from)) : full.formatRange(day(from), day(to))
  return (
    <p className={cls}>
      <time dateTime={from} title={exact} className="cursor-default">
        {label}
      </time>
    </p>
  )
}

/**
 * The story page (#story): Marksage's architecture decisions and models as a timeline — minimal and fast, for
 * people deciding whether the engineering behind it is sound. Detail lives in the docs pages the entries link to.
 */
export function StoryPage({ content, closing = false, onBack, backLabel }: StoryPageProps) {
  const { lang } = useI18n()
  const last = content.entries.length - 1
  return (
    <main className={`scroll-area min-h-0 flex-1 overflow-y-auto ${closing ? 'anim-fade-out' : 'anim-fade'}`}>
      <div className={`mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-10 ${closing ? 'anim-stagger-out' : 'anim-stagger'}`}>
        <button
          type="button"
          onClick={onBack}
          className="tap -ml-2 mb-8 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </button>

        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{content.title}</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted dark:text-dark-ink-muted">{content.intro}</p>
        </header>

        {/* The rail is one segment per entry, from its dot to the next; each dot sits on it, centred (line at 7–8 px,
            dot 11 px wide from 2 px), with a ring of the page colour so the line never shows through its edge. */}
        <ol className="story-timeline anim-stagger mt-10">
          {content.entries.map((e, i) => (
            <li key={i} className="group relative pb-10 pl-8 last:pb-2">
              {i < last && <span aria-hidden className="absolute bottom-0 left-[7px] top-2 w-px bg-line dark:bg-dark-line" />}
              <span
                aria-hidden
                className="absolute left-[2px] top-[2.5px] h-[11px] w-[11px] rounded-full border-2 border-accent bg-surface ring-4 ring-surface transition-transform duration-200 group-hover:scale-125 dark:border-dark-accent dark:bg-dark-surface dark:ring-dark-surface"
              />
              <EntryDate date={e.date} upcoming={content.upcoming} lang={lang} />
              <h2 className="mt-1 text-base font-semibold tracking-tight text-ink dark:text-dark-ink">{e.title}</h2>
              <div className="story-body">
                {e.body.map((p, j) => (
                  <p key={j} className="mt-2 text-sm leading-6 text-ink-muted dark:text-dark-ink-muted">
                    {inline(p)}
                  </p>
                ))}
              </div>
              {e.facts && (
                <ul className="mt-3 space-y-1.5">
                  {e.facts.map((f, j) => (
                    <li key={j} className="flex gap-2 text-[13px] leading-5 text-ink dark:text-dark-ink">
                      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent dark:bg-dark-accent" />
                      <span className="tabular-nums">{inline(f)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.link && (
                <a
                  href={`#${e.link.hash}`}
                  className="tap group/link mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline dark:text-dark-accent"
                >
                  {e.link.label}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" />
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}
