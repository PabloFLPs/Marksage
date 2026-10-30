import { useEffect, useRef, useState } from 'react'
import { Check, Download, X } from 'lucide-react'
import { Presence } from './motion'
import { baseNameLength, normalizeFilename } from '../lib/file'
import { useI18n } from '../hooks/useI18n'

interface ExportMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefilled name: the document's name, or one suggested from its first heading. */
  defaultName: string
  /** Download under this (normalized) name — which also becomes the document's name. */
  onExport: (name: string) => void
  /** Mobile: bigger button, full-width panel under the header. */
  compact?: boolean
}

/**
 * Export with a name: the button (or ⌘/Ctrl + S) opens a small "Export as" panel with the name selected;
 * Enter, Download, the Export button again or ⌘/Ctrl + S again downloads (and closes it). One deliberate step, so a reflexive ⌘S doesn't pile up
 * "document (3).md" files in Downloads. After a download the button shows "Downloaded" for a moment (like Copy).
 */

/** How long the button says "Downloaded" (same as Copy's "Copied"). */
const DONE_MS = 1600
export function ExportMenu({ open, onOpenChange, defaultName, onExport, compact = false }: ExportMenuProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultName)
  // The name just downloaded — the button says so for DONE_MS, and screen readers hear it.
  const [done, setDone] = useState<string | null>(null)
  const doneTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (doneTimer.current) window.clearTimeout(doneTimer.current)
  }, [])

  // A fresh, selected name every time it opens.
  useEffect(() => {
    if (!open) return
    setValue(defaultName)
    const id = window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus({ preventScroll: true })
      input.setSelectionRange(0, baseNameLength(input.value))
    })
    return () => window.cancelAnimationFrame(id)
    // Only on opening: the name typed so far survives re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  const submit = () => {
    const name = normalizeFilename(value)
    if (!name) {
      inputRef.current?.focus()
      return
    }
    onExport(name)
    onOpenChange(false)
    setDone(name)
    if (doneTimer.current) window.clearTimeout(doneTimer.current)
    doneTimer.current = window.setTimeout(() => setDone(null), DONE_MS)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        // Open → a second click is "yes, export": download under the name in the panel.
        onClick={() => (open ? submit() : onOpenChange(true))}
        title={t('action.exportTitle', { keys: 'Ctrl/Cmd + S' })}
        aria-label={t('action.exportMarkdown')}
        aria-expanded={open}
        className="inline-flex h-9 min-w-9 items-center justify-center md:h-8 md:min-w-0 gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
      >
        {done ? <Check className="anim-pop h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        <span key={done ? 'd' : 'e'} className={`hidden lg:inline ${done ? 'anim-rise' : ''}`}>{done ? t('export.done') : t('action.export')}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{done ? t('export.doneLive', { name: done }) : ''}</span>

      <Presence
        show={open}
        enter="anim-menu-in"
        exit="anim-menu-out"
        duration={140}
        className={compact ? 'fixed inset-x-3 top-[3.75rem] z-40 origin-top' : 'absolute right-0 top-10 z-40 w-80 origin-top-right'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="whitespace-normal rounded-lg border border-line bg-surface p-3 shadow-lg dark:border-dark-line dark:bg-dark-surface-soft"
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="export-name" className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
              {t('export.title')}
            </label>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('export.cancel')}
              title={t('export.cancel')}
              className="-m-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={inputRef}
              id="export-name"
              value={value}
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                // ⌘/Ctrl + S again: download, like confirming a save.
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault()
                  // Stop here: App's window shortcut would see the panel just closed and open it again,
                  // so every ⌘S after the first downloaded another copy (launch QA #2).
                  e.stopPropagation()
                  submit()
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-base text-ink outline-none transition-colors focus:border-accent sm:text-sm dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink dark:focus:border-dark-accent"
            />
            <button
              type="submit"
              className="tap press inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
            >
              <Download className="h-3.5 w-3.5" />
              {t('export.download')}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-ink-muted dark:text-dark-ink-muted">{t('export.hint')}</p>
        </form>
      </Presence>
    </div>
  )
}
