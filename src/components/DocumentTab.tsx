import { useMemo } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { ChartNoAxesColumn, Eye, Gauge, MessageSquareQuote, ScanSearch, Shapes } from 'lucide-react'
import { computeDocStats, FLAG_ORDER, type DocFlag, type DocStats } from '../assist/docStats'
import type { OutlineItem } from '../assist/outline'
import { SECTION_ICONS } from './sectionIcons'
import { useI18n } from '../hooks/useI18n'

interface DocumentTabProps {
  /** The text the outline was built from (deferred while typing). */
  text: string
  items: OutlineItem[]
  filename: string | null
  onSelect: (line: number) => void
}

const MAX_CHIPS = 6

/** The Document tab: facts, what the document looks like, readability, tone signals, things worth a look. */
export function DocumentTab({ text, items, filename, onSelect }: DocumentTabProps) {
  const { t, lang } = useI18n()
  const stats = useMemo(() => computeDocStats(text, items, filename), [text, items, filename])
  const num = (n: number) => n.toLocaleString(lang)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  return (
    <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[13px] text-ink dark:text-dark-ink">
      <Block icon={ScanSearch} title={t('doc.kind.title')}>
        <p className={`text-base font-semibold ${stats.kind ? 'text-accent dark:text-dark-accent' : ''}`}>{stats.kind ? t(`doc.kind.${stats.kind.id}`) : t('doc.kind.none')}</p>
        {stats.kind && <Muted>{because(stats.kind, t)}</Muted>}
      </Block>

      <Block icon={ChartNoAxesColumn} title={t('doc.facts')}>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          <Fact label={t('doc.words')} value={num(stats.words)} />
          <Fact label={t('doc.reading')} value={t('doc.readingValue', { n: stats.readingMinutes })} />
          <Fact label={t('doc.sections')} value={num(stats.sections)} />
          <Fact label={t('doc.code')} value={num(stats.codeBlocks)} />
          {stats.tables > 0 && <Fact label={t('doc.tables')} value={num(stats.tables)} />}
          {stats.links > 0 && <Fact label={t('doc.links')} value={num(stats.links)} />}
          {stats.images > 0 && <Fact label={t('doc.images')} value={num(stats.images)} />}
          {stats.language && <Fact label={t('doc.language')} value={t(`doc.lang.${stats.language}`)} />}
        </dl>
        {stats.codeLanguages.length > 0 && (
          <Muted className="mt-2">
            {t('doc.code')}:{' '}
            {stats.codeLanguages
              .slice(0, 6)
              .map(([l, n]) => `${l || t('doc.noLang')} ${n}`)
              .join(' · ')}
          </Muted>
        )}
      </Block>

      <Block icon={Gauge} title={t('doc.readability')}>
        {stats.readability ? (
          <>
            <p className="font-medium">
              {cap(t(`readability.${stats.readability.value}`))} <span className="font-normal text-ink-muted dark:text-dark-ink-muted">· LIX {stats.readability.lix}</span>
            </p>
            <Muted>{t('doc.avgSentence', { n: stats.avgSentenceWords })}</Muted>
            {stats.hardestSection && stats.sections > 1 && (
              <button type="button" onClick={() => onSelect(stats.hardestSection!.line)} className="mt-1 block text-left text-xs text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent">
                {t('doc.hardest')}: <span className="font-medium text-ink dark:text-dark-ink">{stats.hardestSection.heading}</span> ({t(`readability.${stats.hardestSection.value}`)})
              </button>
            )}
          </>
        ) : (
          <Muted>{t('doc.readabilityShort')}</Muted>
        )}
      </Block>

      <Block icon={MessageSquareQuote} title={t('doc.tone')}>
        {stats.tone ? (
          <>
            <p className="font-medium">
              {t(`doc.tone.${stats.tone.register}`)} <span className="font-normal text-ink-muted dark:text-dark-ink-muted">· {t(`doc.voice.${stats.tone.voice}`)}</span>
            </p>
            {signals(stats.tone.signals, t) && <Muted>{signals(stats.tone.signals, t)}</Muted>}
          </>
        ) : (
          <Muted>{t('doc.toneShort')}</Muted>
        )}
      </Block>

      {stats.sectionTypes.length > 0 && (
        <Block icon={Shapes} title={t('doc.types')}>
          <ul className="flex flex-wrap gap-1.5">
            {stats.sectionTypes.map(([type, n]) => {
              const Icon = SECTION_ICONS[type]
              return (
                <li key={type} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs dark:border-dark-line">
                  <Icon className="h-3 w-3 text-accent dark:text-dark-accent" />
                  {t(`section.${type}`)} <span className="text-ink-muted dark:text-dark-ink-muted">{n}</span>
                </li>
              )
            })}
          </ul>
        </Block>
      )}

      <Block icon={Eye} title={t('doc.flags')}>
        {stats.flags.length === 0 ? <Muted>{t('doc.flags.none')}</Muted> : <Flags flags={stats.flags} onSelect={onSelect} />}
      </Block>

      <p className="mt-4 text-[11px] leading-snug text-ink-muted dark:text-dark-ink-muted">{t('doc.footer')}</p>
    </div>
  )
}

type T = ReturnType<typeof useI18n>['t']

function because(kind: NonNullable<DocStats['kind']>, t: T): string {
  const [first] = kind.because
  if (first?.startsWith('file:')) return t('doc.because.file', { name: first.slice(5) })
  if (first?.startsWith('steps:')) return t('doc.because.steps', { n: first.slice(6) })
  if (first === 'lists') return t('doc.because.lists')
  if (first === 'prose') return t('doc.because.prose')
  return t('doc.because.sections', { list: kind.because.join(', ') })
}

function signals(s: NonNullable<DocStats['tone']>['signals'], t: T): string {
  return (Object.entries(s) as [keyof typeof s, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => t(n === 1 ? `doc.signal.${k}.one` : `doc.signal.${k}`, { n }))
    .join(' · ')
}

function Flags({ flags, onSelect }: { flags: DocFlag[]; onSelect: (line: number) => void }) {
  const { t } = useI18n()
  const groups = FLAG_ORDER.map((kind) => ({ kind, list: flags.filter((f) => f.kind === kind) })).filter((g) => g.list.length)
  return (
    <ul className="flex flex-col gap-2.5">
      {groups.map(({ kind, list }) => (
        <li key={kind}>
          <p className="flex items-baseline gap-1.5">
            <span>{t(`doc.flag.${kind}`)}</span>
            <span className="text-xs text-ink-muted dark:text-dark-ink-muted">{list.length}</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {list.slice(0, MAX_CHIPS).map((f, i) => (
              <button
                key={`${f.line}-${i}`}
                type="button"
                onClick={() => onSelect(f.line)}
                title={f.detail ? `${t('doc.line', { n: f.line + 1 })} — ${f.detail}` : undefined}
                className="max-w-full truncate rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink-muted dark:hover:border-dark-accent dark:hover:text-dark-accent"
              >
                {f.detail && kind !== 'longSentence' ? f.detail : t('doc.line', { n: f.line + 1 })}
              </button>
            ))}
            {list.length > MAX_CHIPS && <span className="px-1 py-0.5 text-[11px] text-ink-muted dark:text-dark-ink-muted">{t('doc.more', { n: list.length - MAX_CHIPS })}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Block({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
  return (
    <section className="mb-4 border-b border-line pb-4 last-of-type:border-0 dark:border-dark-line">
      <h3 className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
        <Icon aria-hidden className="h-3.5 w-3.5 text-accent dark:text-dark-accent" />
        {title}
      </h3>
      {children}
    </section>
  )
}


function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-muted dark:text-dark-ink-muted">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs leading-snug text-ink-muted dark:text-dark-ink-muted ${className}`}>{children}</p>
}
