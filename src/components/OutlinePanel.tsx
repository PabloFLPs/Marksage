import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Hash, Sparkles, X } from 'lucide-react'
import { SECTION_ICONS } from './sectionIcons'
import type { OutlineItem } from '../assist/outline'
import type { OutlineModelStatus } from '../assist/useOutline'
import { plainHeading } from '../assist/sections'
import { useI18n } from '../hooks/useI18n'
import { DocumentTab } from './DocumentTab'
import { SuggestionsTab, type SuggestionsTabProps } from './SuggestionsTab'

export type PanelTab = 'outline' | 'document' | 'suggestions'

interface OutlinePanelProps {
  items: OutlineItem[]
  status: OutlineModelStatus
  /** Source line of the section in view. */
  activeLine: number | null
  onSelect: (line: number) => void
  onHover: (line: number | null) => void
  onClose: () => void
  /** "side": docked next to the document (desktop); "sheet": bottom sheet over it (mobile). */
  variant: 'side' | 'sheet'
  closing?: boolean
  tab: PanelTab
  onTabChange: (tab: PanelTab) => void
  /** For the Document tab: the text the items were built from, and the file name. */
  text: string
  filename: string | null
  /** The Suggestions tab (documents only — the read-only docs pages have none). */
  suggestions?: SuggestionsTabProps
}

export function OutlinePanel({ items, status, activeLine, onSelect, onHover, onClose, variant, closing = false, tab, onTabChange, text, filename, suggestions }: OutlinePanelProps) {
  const { t } = useI18n()
  const minLevel = items.reduce((m, i) => Math.min(m, i.level), 6)
  const typed = items.filter((i) => i.type).length
  const tabs: PanelTab[] = suggestions ? ['outline', 'document', 'suggestions'] : ['outline', 'document']
  const current: PanelTab = tabs.includes(tab) ? tab : 'outline'
  const pending = suggestions?.enabled ? suggestions.items.length : 0

  useEffect(() => {
    if (variant !== 'sheet') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant, onClose])

  const body = (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2 dark:border-dark-line">
        <div role="tablist" aria-label={t('outline.toggleTitle')} className="flex shrink-0 items-center">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`panel-tab-${id}`}
              aria-selected={current === id}
              title={id === 'outline' && items.length > 0 ? t('outline.count', { n: items.length, typed }) : undefined}
              aria-controls={`panel-${id}`}
              onClick={() => onTabChange(id)}
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] transition-colors ${
                current === id
                  ? 'bg-surface-soft font-semibold text-ink dark:bg-dark-surface-soft dark:text-dark-ink'
                  : 'text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink'
              }`}
            >
              {t(`panel.tab.${id}`)}
              {id === 'suggestions' && pending > 0 && (
                <span className="rounded-full bg-accent/10 px-1.5 text-[10.5px] font-semibold tabular-nums text-accent dark:bg-dark-accent/15 dark:text-dark-accent">
                  {pending}
                  {suggestions?.capped && '+'}
                </span>
              )}
            </button>
          ))}
        </div>
        {current === 'outline' && items.length > 0 && !suggestions && (
          <span title={t('outline.count', { n: items.length, typed })} className="ml-1 min-w-0 truncate text-xs text-ink-muted dark:text-dark-ink-muted">
            {t('outline.count', { n: items.length, typed })}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('outline.close')}
          title={t('outline.close')}
          className="tap ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {current === 'suggestions' && suggestions ? (
        <div role="tabpanel" id="panel-suggestions" aria-labelledby="panel-tab-suggestions" className="flex min-h-0 flex-1 flex-col">
          <SuggestionsTab {...suggestions} />
        </div>
      ) : current === 'document' ? (
        <div role="tabpanel" id="panel-document" aria-labelledby="panel-tab-document" className="flex min-h-0 flex-1 flex-col">
          <DocumentTab text={text} items={items} filename={filename} onSelect={onSelect} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-outline" aria-labelledby="panel-tab-outline" className="flex min-h-0 flex-1 flex-col">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted dark:text-dark-ink-muted">{t('outline.empty')}</p>
          ) : (
            <nav aria-label={t('outline.title')} className="scroll-area min-h-0 flex-1 overflow-y-auto p-1.5" onMouseLeave={() => onHover(null)}>
              <ol className="flex flex-col gap-px">
                {items.map((item) => (
                  <OutlineRow
                    key={item.line}
                    item={item}
                    indent={item.level - minLevel}
                    active={item.line === activeLine}
                    onSelect={() => onSelect(item.line)}
                    onHover={(on) => onHover(on ? item.line : null)}
                  />
                ))}
              </ol>
            </nav>
          )}
          <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] leading-snug text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
            {t(`outline.status.${status}`)}
          </p>
        </div>
      )}
    </>
  )

  if (variant === 'side') {
    return (
      <aside
        className={`flex w-80 shrink-0 flex-col border-r border-line bg-surface dark:border-dark-line dark:bg-dark-surface ${closing ? 'anim-slide-out-left' : 'anim-slide-in-left'}`}
      >
        {body}
      </aside>
    )
  }
  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={t('outline.close')}
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 ${closing ? 'anim-fade-out' : 'anim-fade'}`}
      />
      <div
        role="dialog"
        aria-label={t('outline.title')}
        className={`absolute inset-x-0 bottom-0 flex max-h-[75dvh] flex-col rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl dark:border-dark-line dark:bg-dark-surface ${closing ? 'anim-sheet-out' : 'anim-sheet-in'}`}
      >
        {body}
      </div>
    </div>
  )
}

function OutlineRow({ item, indent, active, onSelect, onHover }: { item: OutlineItem; indent: number; active: boolean; onSelect: () => void; onHover: (on: boolean) => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLButtonElement>(null)
  // Keep the section being read visible in a long outline.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  const Icon = item.type ? SECTION_ICONS[item.type] : Hash
  const pct = Math.round((item.confidence ?? 0) * 100)
  const typeTitle =
    item.source === 'model'
      ? t(item.tentative ? 'outline.fromModelMaybe' : 'outline.fromModel', { pct })
      : item.source === 'heading'
        ? t('outline.fromHeading')
        : undefined
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={onSelect}
        onMouseEnter={() => onHover(true)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-current={active ? 'location' : undefined}
        style={{ paddingLeft: `${0.5 + Math.min(indent, 4) * 0.75}rem` }}
        className={`flex w-full gap-2 rounded-md py-1.5 pr-2 text-left transition-colors ${
          active ? 'bg-accent/10 dark:bg-dark-accent/15' : 'hover:bg-surface-soft dark:hover:bg-dark-surface-soft'
        }`}
      >
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${item.type && !item.tentative ? 'text-accent dark:text-dark-accent' : 'text-ink-muted/60 dark:text-dark-ink-muted/60'}`} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${indent === 0 ? 'font-semibold' : 'font-medium'} ${active ? 'text-accent dark:text-dark-accent' : 'text-ink dark:text-dark-ink'}`}>
            {plainHeading(item.heading)}
          </span>
          {item.type && (
            <Badge title={typeTitle} tentative={item.tentative}>
              {item.tentative ? t('outline.maybe', { type: t(`section.${item.type}`) }) : t(`section.${item.type}`)}
              {item.source === 'model' && <Sparkles aria-hidden className="h-2.5 w-2.5" />}
            </Badge>
          )}
          {item.key && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-ink-muted dark:text-dark-ink-muted">{item.key}</span>}
        </span>
      </button>
    </li>
  )
}

function Badge({ title, tentative, children }: { title?: string; tentative?: boolean; children: ReactNode }) {
  return (
    <span
      title={title}
      className={`mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide ${
        tentative ? 'text-ink-muted dark:text-dark-ink-muted' : 'text-accent dark:text-dark-accent'
      }`}
    >
      {children}
    </span>
  )
}
