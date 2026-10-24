import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

/** Search field for Recent documents (filters by title, file name and content). */
export function HistorySearch({ value, onChange, autoFocus = false }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const { t } = useI18n()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted dark:text-dark-ink-muted" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Esc clears the query first; a second Esc reaches the menu and closes it.
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
        placeholder={t('history.search')}
        aria-label={t('history.search')}
        className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-7 text-base text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-accent sm:text-[13px] dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink dark:placeholder:text-dark-ink-muted dark:focus:border-dark-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            ref.current?.focus({ preventScroll: true })
          }}
          aria-label={t('history.searchClear')}
          className="anim-pop absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** "Clear all" with an inline confirmation instead of a browser dialog. */
export function ClearHistory({ count, onClear }: { count: number; onClear: () => void }) {
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const yesRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!confirming) return
    yesRef.current?.focus({ preventScroll: true })
    const timer = window.setTimeout(() => setConfirming(false), 6000) // forget an abandoned confirmation
    return () => window.clearTimeout(timer)
  }, [confirming])

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded px-1 text-xs text-ink-muted transition-colors hover:text-red-600 dark:text-dark-ink-muted dark:hover:text-red-400"
      >
        {t('history.clearAll')}
      </button>
    )
  return (
    <span className="anim-rise inline-flex items-center gap-2 text-xs" role="group" aria-label={t('history.clearAsk', { n: String(count) })}>
      <span className="text-ink-muted dark:text-dark-ink-muted">{t('history.clearAsk', { n: String(count) })}</span>
      <button
        ref={yesRef}
        type="button"
        onClick={() => {
          setConfirming(false)
          onClear()
        }}
        className="rounded px-1 font-medium text-red-600 hover:underline dark:text-red-400"
      >
        {t('history.clearYes')}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          setConfirming(false)
        }}
        className="rounded px-1 text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
      >
        {t('history.clearNo')}
      </button>
    </span>
  )
}
