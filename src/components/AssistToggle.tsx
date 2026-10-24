import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, PowerOff, Sparkles, Zap } from 'lucide-react'
import { Presence } from './motion'
import type { AssistMode } from '../assist/types'
import type { EngineStatus } from '../assist/useSmartAssist'
import { useI18n } from '../hooks/useI18n'
import type { MessageKey, Vars } from '../lib/i18n'

interface AssistToggleProps {
  mode: AssistMode
  status: EngineStatus
  onChange: (mode: AssistMode) => void
  /** Icon-only (mobile): the native select sits invisibly on top. */
  compact?: boolean
}

function statusText(mode: AssistMode, status: EngineStatus, t: (k: MessageKey, v?: Vars) => string): string {
  if (mode === 'off') return t('assist.status.off')
  switch (status.state) {
    case 'loading':
      return status.progress != null ? t('assist.status.loadingPct', { pct: Math.round(status.progress * 100) }) : t('assist.status.loading')
    case 'fallback':
      return t('assist.status.fallback', { reason: status.reason })
    case 'ready':
      return status.kind === 'model' ? t('assist.status.model') : t('assist.status.heuristics')
    default:
      return t('assist.label')
  }
}

const OPTIONS: { id: AssistMode; icon: typeof Sparkles; disabled?: boolean }[] = [
  { id: 'off', icon: PowerOff },
  { id: 'heuristics', icon: Zap },
  { id: 'model', icon: Cpu },
]

export function AssistToggle({ mode, status, onChange, compact = false }: AssistToggleProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const active = mode !== 'off'
  const warn = status.state === 'fallback'

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  // Move DOM focus with the roving index while the menu is open.
  useEffect(() => {
    if (open) itemRefs.current[focus]?.focus({ preventScroll: true })
  }, [open, focus])

  const enabledIdx = OPTIONS.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
  const openMenu = () => {
    setFocus(Math.max(0, OPTIONS.findIndex((o) => o.id === mode)))
    setOpen(true)
  }
  const choose = (id: AssistMode) => {
    onChange(id)
    setOpen(false)
  }
  const onMenuKey = (e: React.KeyboardEvent) => {
    const pos = enabledIdx.indexOf(focus)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocus(enabledIdx[(pos + 1) % enabledIdx.length])
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocus(enabledIdx[(pos - 1 + enabledIdx.length) % enabledIdx.length])
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={statusText(mode, status, t)}
        aria-label={t('assist.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openMenu()
          }
        }}
        className={`press group relative inline-flex items-center gap-1.5 rounded-md border ${compact ? 'h-9 w-9 justify-center' : 'h-8 px-2'} text-xs font-medium transition-colors ${
          active || open
            ? 'border-accent text-accent hover:bg-accent/5 dark:border-dark-accent dark:text-dark-accent dark:hover:bg-dark-accent/10'
            : 'border-line text-ink hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent'
        } bg-surface dark:bg-dark-surface-soft`}
      >
        <Sparkles className={`hover-sparkle h-3.5 w-3.5 ${status.state === 'loading' ? 'animate-pulse' : ''}`} />
        {warn && <span className="anim-pop absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
        {!compact && (
          <>
            <span>Assist: {t(`assist.short.${mode}`)}</span>
            <ChevronDown className={`h-3 w-3 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      <Presence
        show={open}
        enter="anim-menu-in"
        exit="anim-menu-out"
        duration={140}
        className={
          compact
            ? 'fixed inset-x-3 top-[3.75rem] z-40 origin-top'
            : 'absolute left-0 top-10 z-40 w-64 origin-top-left'
        }
      >
        <div
          role="menu"
          aria-label={t('assist.label')}
          onKeyDown={onMenuKey}
          className="rounded-lg border border-line bg-surface p-1.5 shadow-lg dark:border-dark-line dark:bg-dark-surface-soft"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
            Smart Assist
          </p>
          <div className="anim-stagger flex flex-col">
            {OPTIONS.map((o, i) => {
              const Icon = o.icon
              const selected = o.id === mode
              return (
                <button
                  key={o.id}
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  disabled={o.disabled}
                  tabIndex={focus === i ? 0 : -1}
                  onClick={() => choose(o.id)}
                  onMouseEnter={() => !o.disabled && setFocus(i)}
                  className={`flex min-h-11 items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors md:min-h-0 ${
                    o.disabled
                      ? 'cursor-not-allowed opacity-50'
                      : focus === i
                        ? 'bg-surface-soft dark:bg-dark-surface-raised'
                        : ''
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      selected
                        ? 'bg-accent text-white dark:bg-dark-accent dark:text-dark-surface'
                        : 'bg-surface-soft text-ink-muted dark:bg-dark-surface-raised dark:text-dark-ink-muted'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink dark:text-dark-ink">{t(`assist.short.${o.id}`)}</span>
                    <span className="block text-[11px] text-ink-muted dark:text-dark-ink-muted">{t(`assist.desc.${o.id}`)}</span>
                  </span>
                  {selected && <Check className="anim-pop h-4 w-4 shrink-0 text-accent dark:text-dark-accent" />}
                </button>
              )
            })}
          </div>
        </div>
      </Presence>
    </div>
  )
}
