import type { MouseEvent } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { Suggestion } from '../assist/types'
import { useI18n } from '../hooks/useI18n'
import { useKeyStyle } from '../hooks/useKeyStyle'
import { keyLabel } from '../lib/keyStyle'
import { decidedByKey, suggestionIcon } from './suggestionIcons'

interface SuggestionBarProps {
  suggestion: Suggestion
  /** `index` picks an option of a two-way choice (0 = first). */
  onAccept: (index?: number) => void
  onDismiss: () => void
  /** Bring the suggestion's spot into view. */
  onLocate?: (s: Suggestion) => void
}

const kbd =
  'rounded border border-line px-1 font-mono text-[10px] text-ink-muted dark:border-dark-line dark:text-dark-ink-muted'

export function SuggestionBar({ suggestion, onAccept, onDismiss, onLocate }: SuggestionBarProps) {
  const { t } = useI18n()
  const label = suggestion.message ? t(suggestion.message.key, suggestion.message.vars) : suggestion.label
  const detail = suggestion.detailKey ? t(suggestion.detailKey) : suggestion.detail
  const { keyStyle } = useKeyStyle()
  const Icon = suggestionIcon(suggestion)
  const byKey = decidedByKey(suggestion)
  // The whole card is the "show where" target (its buttons keep their own action).
  const card = onLocate
    ? {
        onMouseDown: (e: MouseEvent) => e.preventDefault(), // keep the caret (and the suggestion) in the editor
        onClick: () => onLocate(suggestion),
        title: t('suggest.locate'),
      }
    : {}
  const cardHover = onLocate ? 'cursor-pointer transition-colors hover:border-accent dark:hover:border-dark-accent' : ''
  const stop = (e: MouseEvent) => e.stopPropagation()
  const icon = <Icon aria-hidden className="anim-pop h-3.5 w-3.5 shrink-0 text-accent dark:text-dark-accent" />
  // ✦ — the local model made (or confirmed) this call, as in the Outline.
  const byModel = byKey && (
    <span title={t(byKey)} className="inline-flex shrink-0 text-accent dark:text-dark-accent">
      <Sparkles aria-hidden className="h-3 w-3" />
      <span className="sr-only">{t(byKey)}</span>
    </span>
  )
  if (suggestion.choices?.length) {
    const hints = [keyLabel('tab', keyStyle), `${keyLabel('alt', keyStyle)}${keyStyle === 'mac' ? '' : '+'}2`]
    return (
      <div
        role="status"
        aria-live="polite"
        {...card}
        className={`anim-slide-up pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-dark-line dark:bg-dark-surface-soft/95 ${cardHover}`}
      >
        {icon}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-ink dark:text-dark-ink">
          <span className="truncate">{label}</span>
          {byModel}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {suggestion.choices.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                stop(e)
                onAccept(i)
              }}
              aria-label={t('suggest.choose', { name: c.label })}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors ${
                i === 0
                  ? 'bg-accent text-white hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong'
                  : 'border border-line text-ink hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent'
              }`}
            >
              {c.label}
              <span className="tabular-nums opacity-75">{Math.round(c.confidence * 100)}%</span>
              <span className={`hidden rounded px-1 font-mono text-[10px] sm:inline ${i === 0 ? 'bg-white/20' : 'border border-line dark:border-dark-line'}`}>{hints[i]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
          stop(e)
          onDismiss()
        }}
          aria-label={t('suggest.dismiss', { key: 'Esc' })}
          title={t('suggest.dismiss', { key: 'Esc' })}
          className="inline-flex shrink-0 items-center gap-1 text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
        >
          <span className={`hidden sm:inline ${kbd}`}>Esc</span>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }
  return (
    <div
      role="status"
      aria-live="polite"
      {...card}
      className={`anim-slide-up pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-sm backdrop-blur dark:border-dark-line dark:bg-dark-surface-soft/95 ${cardHover}`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-medium text-ink dark:text-dark-ink">
          <span className="truncate">{label}</span>
          {byModel}
        </div>
        {detail && (
          <div className="truncate font-mono text-[11px] text-ink-muted dark:text-dark-ink-muted">
            {detail}
          </div>
        )}
      </div>
      <span
        title={t('suggest.confidence')}
        className="hidden shrink-0 tabular-nums text-ink-muted sm:inline dark:text-dark-ink-muted"
      >
        {Math.round(suggestion.confidence * 100)}%
      </span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          stop(e)
          onAccept()
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-2 py-1 font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
      >
        {t('suggest.accept')} <span className="hidden rounded bg-white/20 px-1 font-mono text-[10px] sm:inline">Tab</span>
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          stop(e)
          onDismiss()
        }}
        aria-label={t('suggest.dismiss', { key: 'Esc' })}
        title={t('suggest.dismiss', { key: 'Esc' })}
        className="inline-flex shrink-0 items-center gap-1 text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
      >
        <span className={`hidden sm:inline ${kbd}`}>Esc</span>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
