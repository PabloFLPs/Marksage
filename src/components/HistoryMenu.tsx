import { useEffect, useRef, useState } from 'react'
import { History } from 'lucide-react'
import { searchHistory, type HistoryEntry } from '../lib/history'
import { HistoryList } from './HistoryList'
import { ClearHistory, HistorySearch } from './HistoryTools'
import { Presence } from './motion'
import { useKeyStyle } from '../hooks/useKeyStyle'
import { shortcut } from '../lib/keyStyle'
import { useI18n } from '../hooks/useI18n'

interface HistoryMenuProps {
  entries: HistoryEntry[]
  currentId?: string
  onOpen: (entry: HistoryEntry) => void
  onRemove: (id: string) => void
  onClear: () => void
  /** Mobile: bigger tap target, full-width sheet under the header. */
  compact?: boolean
}

export function HistoryMenu({ entries, currentId, onOpen, onRemove, onClear, compact = false }: HistoryMenuProps) {
  const { t } = useI18n()
  const { keyStyle } = useKeyStyle()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const shown = searchHistory(entries, query, t('doc.untitled'))

  // A fresh search every time the menu opens.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // ⌘/Ctrl + Shift + H toggles the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('history.button')}
        aria-expanded={open}
        title={t('history.buttonTitle', { keys: shortcut(['mod', 'shift', 'h'], keyStyle) })}
        className={`group inline-flex items-center ${compact ? 'h-9 w-9' : 'h-8 w-8'} justify-center rounded-md border bg-surface transition-colors dark:bg-dark-surface-soft ${
          open
            ? 'border-accent text-accent dark:border-dark-accent dark:text-dark-accent'
            : 'border-line text-ink-muted hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink-muted dark:hover:border-dark-accent dark:hover:text-dark-accent'
        }`}
      >
        <History className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-45" />
      </button>

      <Presence
        show={open}
        enter="anim-menu-in"
        exit="anim-menu-out"
        duration={140}
        className={
          compact
            ? 'fixed inset-x-3 top-[3.75rem] z-40 origin-top'
            : 'absolute right-0 top-10 z-40 w-80 origin-top-right'
        }
      >
        <div className="whitespace-normal rounded-lg border border-line bg-surface p-1.5 shadow-lg dark:border-dark-line dark:bg-dark-surface-soft">
          <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
              {t('history.title')}
            </span>
            {entries.length > 0 && <ClearHistory count={entries.length} onClear={onClear} />}
          </div>
          {entries.length > 0 && (
            <div className="px-1 pb-1.5">
              <HistorySearch value={query} onChange={setQuery} autoFocus={open && !compact} />
            </div>
          )}
          {entries.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-xs text-ink-muted dark:text-dark-ink-muted">
              {t('history.empty')}
            </p>
          ) : shown.length === 0 ? (
            <p className="anim-rise px-2.5 py-4 text-center text-xs text-ink-muted dark:text-dark-ink-muted">
              {t('history.noMatches', { q: query.trim() })}
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <HistoryList
                entries={shown}
                currentId={currentId}
                onRemove={onRemove}
                onOpen={(e) => {
                  setOpen(false)
                  onOpen(e)
                }}
              />
            </div>
          )}
          <p className="border-t border-line px-2.5 pb-1 pt-2 text-[11px] text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
            {t('history.localOnly')}
          </p>
        </div>
      </Presence>
    </div>
  )
}
