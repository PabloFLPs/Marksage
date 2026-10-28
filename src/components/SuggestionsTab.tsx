import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import type { Suggestion } from '../assist/types'
import { useI18n } from '../hooks/useI18n'
import { decidedByKey, suggestionIcon } from './suggestionIcons'

export interface SuggestionsTabProps {
  items: Suggestion[]
  /** Smart Assist is on (Heuristics or Hybrid). */
  enabled: boolean
  /** The document the items were computed on — for line numbers and snippets. */
  text: string
  onPick: (s: Suggestion) => void
}

/**
 * Every fixable spot of the document — untagged code blocks and near-miss headings or lists — with the same
 * suggestion the editor would show there. The panel never edits: a click jumps the editor to the spot and opens
 * the normal suggestion bar, where Tab accepts.
 */
export function SuggestionsTab({ items, enabled, text, onPick }: SuggestionsTabProps) {
  const { t } = useI18n()
  const rows = useMemo(
    () =>
      items.map((s) => {
        const line = text.slice(0, s.edit.from).split('\n').length
        // Code blocks: the first line of code; lines: what changes into what.
        const snippet =
          s.feature === 'codeFence'
            ? (text.slice(s.edit.from).split('\n').slice(1).find((l) => l.trim()) ?? '').trim()
            : (s.detail ?? '')
        return { s, line, snippet }
      }),
    [items, text],
  )

  if (!enabled) return <p className="px-4 py-6 text-sm text-ink-muted dark:text-dark-ink-muted">{t('suggestions.off')}</p>

  return (
    <>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-muted dark:text-dark-ink-muted">{t('suggestions.empty')}</p>
      ) : (
        <ol className="scroll-area flex min-h-0 flex-1 flex-col gap-px overflow-y-auto p-1.5">
          {rows.map(({ s, line, snippet }) => {
            const Icon = suggestionIcon(s)
            const label = s.message ? t(s.message.key, s.message.vars) : s.label
            const byKey = decidedByKey(s)
            return (
              <li key={s.key + s.edit.from}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-soft dark:hover:bg-dark-surface-soft"
                >
                  <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent dark:text-dark-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-snug text-ink dark:text-dark-ink">
                      {label}
                      {byKey && (
                        <span title={t(byKey)} className="ml-1 inline-flex align-baseline text-accent dark:text-dark-accent">
                          <Sparkles aria-hidden className="h-2.5 w-2.5" />
                          <span className="sr-only">{t(byKey)}</span>
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex gap-2 text-xs text-ink-muted dark:text-dark-ink-muted">
                      <span className="shrink-0 tabular-nums">{t('doc.line', { n: line })}</span>
                      {snippet && <span className="truncate font-mono text-[11px]">{snippet}</span>}
                    </span>
                  </span>
                  <span title={t('suggest.confidence')} className="mt-0.5 shrink-0 text-[11px] tabular-nums text-ink-muted dark:text-dark-ink-muted">
                    {Math.round(s.confidence * 100)}%
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="mt-auto shrink-0 border-t border-line px-3 py-2 text-[11px] leading-snug text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
        {t('suggestions.footer')}
      </p>
    </>
  )
}
