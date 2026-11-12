import { FileText, X } from 'lucide-react'
import { entryTitle, numberedEntries, relativeTime, type HistoryEntry } from '../lib/history'
import { useI18n } from '../hooks/useI18n'
import { countKey } from '../lib/i18n'

interface HistoryListProps {
  entries: HistoryEntry[]
  currentId?: string
  /** The current document isn't on screen (About, a docs page): its row opens it instead of sitting disabled. */
  currentOpens?: boolean
  onOpen: (entry: HistoryEntry) => void
  onRemove: (id: string) => void
  limit?: number
  /** The header menu: the first 9 documents you can switch to carry 1–9 (typing the digit opens it). */
  numbered?: boolean
}


/** Shared list used by the header menu and the empty state. */
export function HistoryList({ entries, currentId, currentOpens = false, onOpen, onRemove, limit, numbered = false }: HistoryListProps) {
  const { t, lang } = useI18n()
  const items = limit ? entries.slice(0, limit) : entries
  const numbers = new Map(numbered ? numberedEntries(entries, currentId).map((e, i) => [e.id, i + 1]) : [])
  return (
    <ul className="anim-stagger flex flex-col">
      {items.map((e) => {
        const current = e.id === currentId
        const dirty = e.content !== e.savedContent
        return (
          <li key={e.id} className="group/item relative">
            <button
              type="button"
              onClick={() => onOpen(e)}
              disabled={current && !currentOpens}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 pr-8 pointer-coarse:pr-11 text-left transition-colors ${
                current
                  ? `bg-accent/5 dark:bg-dark-accent/10 ${currentOpens ? 'hover:bg-accent/10 dark:hover:bg-dark-accent/15' : 'cursor-default'}`
                  : 'hover:bg-surface-soft dark:hover:bg-dark-surface-raised'
              }`}
            >
              {numbered && (
                <kbd aria-hidden className={`w-3 shrink-0 text-center font-sans text-[11px] tabular-nums text-ink-muted dark:text-dark-ink-muted ${numbers.has(e.id) ? '' : 'invisible'}`}>
                  {numbers.get(e.id) ?? 0}
                </kbd>
              )}
              <FileText
                className={`h-4 w-4 shrink-0 transition-transform duration-200 group-hover/item:-rotate-6 ${
                  current ? 'text-accent dark:text-dark-accent' : 'text-ink-muted dark:text-dark-ink-muted'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1 truncate text-sm text-ink dark:text-dark-ink">
                  <span className={`truncate ${e.filename ? 'font-mono text-[13px]' : ''}`}>{entryTitle(e, t('doc.untitled'))}</span>
                  {dirty && <span className="text-accent dark:text-dark-accent" title={t('history.notExported')}>*</span>}
                </span>
                <span className="block text-[11px] text-ink-muted dark:text-dark-ink-muted">
                  {current ? t('history.openNow') : relativeTime(e.updatedAt, t, lang)} · {t(countKey('history.chars', e.content.length), { n: e.content.length.toLocaleString(lang) })}
                </span>
              </span>
            </button>
            {!current && (
              <button
                type="button"
                onClick={() => onRemove(e.id)}
                aria-label={t('history.removeNamed', { name: entryTitle(e, t('doc.untitled')) })}
                title={t('history.remove')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover/item:opacity-100 pointer-coarse:p-2 pointer-coarse:opacity-100 dark:text-dark-ink-muted dark:hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
