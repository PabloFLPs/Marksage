import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Presence } from './motion'
import { useI18n } from '../hooks/useI18n'
import { useKeyStyle } from '../hooks/useKeyStyle'
import { keyLabel, type KeyToken } from '../lib/keyStyle'

export interface Command {
  id: string
  label: string
  /** Group heading ("Document", "Go to", "Recent"…), in display order of first appearance. */
  group: string
  icon: ReactNode
  /** Its own shortcut, when it has one that works in every browser or is worth knowing. */
  keys?: KeyToken[]
  /** Extra words it's found by ("save", "download"…), in both languages. */
  keywords?: string
  /** Shown after the label, quieter (a recent document's time). */
  hint?: string
  run: () => void
}

/** Case- and accent-insensitive, every typed word somewhere in the label, group or keywords. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
function matches(c: Command, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = fold(`${c.label} ${c.group} ${c.keywords ?? ''}`)
  return terms.every((t) => hay.includes(t))
}

/**
 * ⌘/Ctrl + K: every action, searchable — the one shortcut to remember. Browsers keep some keys for themselves
 * (⌘N opens a window in Chrome, Edge and Opera; Opera's ⌘O, Safari's ⌘⇧H…), so this is how everything stays
 * reachable from the keyboard. ↑ ↓ move, Enter runs, Esc closes.
 */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const { t } = useI18n()
  const { keyStyle } = useKeyStyle()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  // Where focus was when it opened: it goes back there when the palette closes without moving it elsewhere.
  const before = useRef<HTMLElement | null>(null)

  const shown = useMemo(() => (open ? commands.filter((c) => matches(c, query)) : []), [commands, query, open])

  useEffect(() => {
    if (!open) return
    before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery('')
    setActive(0)
    const id = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(id)
  }, [open])

  useEffect(() => setActive(0), [query])

  // Keep the active row in view while moving with the arrows.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const close = (ran?: boolean) => {
    onClose()
    // A command that moved focus (a panel, a page) keeps it; otherwise back to where it was.
    window.requestAnimationFrame(() => {
      const now = document.activeElement
      if (!ran || !now || now === document.body || now === inputRef.current) before.current?.focus({ preventScroll: true })
    })
  }
  const run = (c: Command | undefined) => {
    if (!c) return
    close(true)
    c.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (shown.length ? (i + 1) % shown.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(shown[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      e.preventDefault() // focus stays in the palette while it's open
    }
  }

  let lastGroup = ''
  return (
    <Presence show={open} enter="anim-fade" exit="anim-fade-out" duration={140} className="fixed inset-0 z-50">
      <div className="flex h-full justify-center bg-black/20 px-3 pt-[12vh] dark:bg-black/40" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('palette.title')}
          className={`${open ? 'anim-menu-in' : 'anim-menu-out'} flex h-fit max-h-[70vh] w-full max-w-lg origin-top flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl dark:border-dark-line dark:bg-dark-surface-soft`}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 dark:border-dark-line">
            <Search className="h-4 w-4 shrink-0 text-ink-muted dark:text-dark-ink-muted" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('palette.placeholder')}
              spellCheck={false}
              className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted sm:text-sm dark:text-dark-ink dark:placeholder:text-dark-ink-muted"
            />
          </div>
          {shown.length === 0 ? (
            <p className="anim-rise px-4 py-6 text-center text-sm text-ink-muted dark:text-dark-ink-muted">{t('palette.empty', { q: query.trim() })}</p>
          ) : (
            <ul ref={listRef} id={listId} role="listbox" aria-label={t('palette.title')} className="scroll-area overflow-y-auto p-1.5">
              {shown.map((c, i) => {
                const heading = c.group !== lastGroup ? c.group : null
                lastGroup = c.group
                return (
                  <li key={c.id} role="presentation">
                    {heading && (
                      <div role="presentation" className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
                        {heading}
                      </div>
                    )}
                    <div
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      data-index={i}
                      onPointerMove={() => i !== active && setActive(i)}
                      onClick={() => run(c)}
                      className={`tap flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                        i === active ? 'bg-accent/10 text-accent dark:bg-dark-accent/15 dark:text-dark-accent' : 'text-ink dark:text-dark-ink'
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{c.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {c.hint && <span className="shrink-0 text-xs text-ink-muted dark:text-dark-ink-muted">{c.hint}</span>}
                      {c.keys && (
                        <span className="hidden shrink-0 items-center gap-0.5 sm:inline-flex">
                          {c.keys.map((k) => (
                            <kbd key={k} className="rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
                              {keyLabel(k, keyStyle)}
                            </kbd>
                          ))}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="hidden border-t border-line px-3 py-2 text-[11px] text-ink-muted sm:block dark:border-dark-line dark:text-dark-ink-muted">{t('palette.footer')}</p>
        </div>
      </div>
    </Presence>
  )
}
