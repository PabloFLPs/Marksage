import { useEffect, useState } from 'react'
import { ClipboardPaste, FileText, FolderOpen } from 'lucide-react'
import { searchHistory, type HistoryEntry } from '../lib/history'
import { HistoryList } from './HistoryList'
import { ClearHistory, HistorySearch } from './HistoryTools'
import { useI18n } from '../hooks/useI18n'

interface EmptyStateProps {
  isDragging: boolean
  onOpenFile: () => void
  onPaste: () => Promise<boolean>
  history: HistoryEntry[]
  onOpenHistory: (entry: HistoryEntry) => void
  onRemoveHistory: (id: string) => void
  onClearHistory: () => void
}

export function EmptyState({ isDragging, onOpenFile, onPaste, history, onOpenHistory, onRemoveHistory, onClearHistory }: EmptyStateProps) {
  const { t } = useI18n()
  const [hint, setHint] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const matches = searchHistory(history, query, t('doc.untitled'))

  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => setHint(null), 4000)
    return () => window.clearTimeout(timer)
  }, [hint])

  const handlePaste = async () => {
    const ok = await onPaste()
    if (!ok) setHint(t('empty.clipboardUnavailable', { keys: 'Ctrl/Cmd + V' }))
  }

  return (
    <div className="anim-rise scroll-area flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-8 overflow-y-auto p-6">
      <div
        className={`flex w-full max-w-md flex-col items-center rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
          isDragging
            ? 'scale-[1.02] border-accent bg-accent/5 dark:border-dark-accent dark:bg-dark-accent/10'
            : 'border-line dark:border-dark-line'
        }`}
      >
        <FileText
          className={`mb-4 h-10 w-10 transition-transform duration-300 ${isDragging ? '-translate-y-1 scale-110 ' : ''}${isDragging ? 'text-accent dark:text-dark-accent' : 'text-ink-muted dark:text-dark-ink-muted'}`}
        />
        <p className="text-sm font-medium text-ink dark:text-dark-ink">
          {isDragging ? t('empty.dropHere') : t('empty.drop')}
        </p>
        <p className="mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">{t('empty.or')}</p>
        <button
          type="button"
          onClick={onOpenFile}
          className="press mt-4 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent"
        >
          <FolderOpen className="h-4 w-4" />
          {t('empty.open')}
        </button>
        <p className="mt-1 text-xs text-ink-muted dark:text-dark-ink-muted">{t('empty.or')}</p>
        <button
          type="button"
          onClick={handlePaste}
          className="press mt-4 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent"
        >
          <ClipboardPaste className="h-4 w-4" />
          {t('empty.paste')}
        </button>
        {hint && (
          <p role="status" className="anim-rise mt-3 text-xs text-accent dark:text-dark-accent">
            {hint}
          </p>
        )}
        <p className="mt-6 text-xs text-ink-muted dark:text-dark-ink-muted">
          {t('empty.supports')}
        </p>
      </div>
      {history.length > 0 && (
        <section className="w-full max-w-md">
          <div className="mb-2 flex items-center justify-between gap-2 px-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
              {t('history.title')}
            </h2>
            <ClearHistory count={history.length} onClear={onClearHistory} />
          </div>
          {history.length > 5 && (
            <div className="mb-1.5 px-1">
              <HistorySearch value={query} onChange={setQuery} />
            </div>
          )}
          {matches.length === 0 ? (
            <p className="anim-rise px-2.5 py-3 text-center text-xs text-ink-muted dark:text-dark-ink-muted">
              {t('history.noMatches', { q: query.trim() })}
            </p>
          ) : (
            <HistoryList entries={matches} onOpen={onOpenHistory} onRemove={onRemoveHistory} limit={query ? 8 : 5} />
          )}
        </section>
      )}
    </div>
  )
}
