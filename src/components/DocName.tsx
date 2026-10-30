import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { baseNameLength, normalizeFilename } from '../lib/file'
import { useI18n } from '../hooks/useI18n'
import { Presence } from './motion'

interface DocNameProps {
  filename: string | null
  isDirty: boolean
  onRename: (name: string) => void
}

/**
 * The document's name in the header. Click it to rename in place: Enter or clicking away keeps the new name
 * (`.md` is added when there's no Markdown extension), Esc cancels. The name part is selected, not the extension.
 */
export function DocName({ filename, isDirty, onRename }: DocNameProps) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const cancelled = useRef(false)
  const shown = filename ?? t('doc.untitled')

  const start = () => {
    cancelled.current = false
    setValue(filename ?? '')
    setEditing(true)
  }
  const finish = () => {
    setEditing(false)
    if (cancelled.current) return
    const name = normalizeFilename(value)
    if (name && name !== filename) onRename(name)
  }

  return (
    <span className="anim-rise hidden min-w-0 items-baseline gap-1 text-sm text-ink-muted sm:flex dark:text-dark-ink-muted">
      <span className="text-line dark:text-dark-line">/</span>
      {editing ? (
        <input
          autoFocus
          value={value}
          placeholder={t('doc.untitled')}
          aria-label={t('doc.nameLabel')}
          spellCheck={false}
          // Monospace: one `ch` per character, so the box ends right after the text (+ room for the caret).
          style={{ width: `calc(${Math.max(value.length, t('doc.untitled').length)}ch + 0.5rem + 4px)` }}
          onFocus={(e) => e.currentTarget.setSelectionRange(0, baseNameLength(e.currentTarget.value))}
          onChange={(e) => setValue(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              cancelled.current = true
              e.currentTarget.blur()
            }
          }}
          className="anim-pop min-w-0 max-w-[40vw] box-border rounded border border-accent bg-surface px-1 font-mono text-sm text-ink outline-none dark:border-dark-accent dark:bg-dark-surface-soft dark:text-dark-ink"
        />
      ) : (
        <button
          type="button"
          onClick={start}
          title={t('doc.renameTitle')}
          className="min-w-0 truncate rounded px-0.5 font-mono transition-colors hover:bg-surface-soft hover:text-ink dark:hover:bg-dark-surface-soft dark:hover:text-dark-ink"
        >
          {shown}
        </button>
      )}
      {isDirty && !editing && (
        <span aria-label={t('doc.unsaved')} title={t('doc.unsaved')} className="anim-pop text-accent dark:text-dark-accent">
          *
        </span>
      )}
    </span>
  )
}

interface RenameSheetProps {
  open: boolean
  filename: string | null
  onClose: () => void
  onRename: (name: string) => void
}

/**
 * Phones: the header has no room for the name, so the ⋯ menu's "Rename…" opens this panel under the header (same
 * place as the Export panel). Same rules as the header box: Enter or Save keeps the name (`.md` added when there's
 * no Markdown extension), Esc, × or tapping outside cancels.
 */
export function RenameSheet({ open, filename, onClose, onRename }: RenameSheetProps) {
  const { t } = useI18n()
  const [value, setValue] = useState(filename ?? '')
  const rootRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // A fresh, selected name every time it opens.
  useEffect(() => {
    if (!open) return
    setValue(filename ?? '')
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
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const save = () => {
    const name = normalizeFilename(value)
    if (!name) {
      inputRef.current?.focus()
      return
    }
    if (name !== filename) onRename(name)
    onClose()
  }

  return (
    <Presence show={open} enter="anim-menu-in" exit="anim-menu-out" duration={140} className="fixed inset-x-3 top-[3.75rem] z-40 origin-top">
      <form
        ref={rootRef}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="whitespace-normal rounded-lg border border-line bg-surface p-3 shadow-lg dark:border-dark-line dark:bg-dark-surface-soft"
      >
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="rename-name" className="text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-dark-ink-muted">
            {t('doc.rename')}
          </label>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('doc.renameCancel')}
            title={t('doc.renameCancel')}
            className="-m-1.5 inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            id="rename-name"
            value={value}
            placeholder={t('doc.untitled')}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => setValue(e.target.value)}
            // text-base: iOS zooms into inputs under 16 px.
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-2 font-mono text-base text-ink outline-none transition-colors focus:border-accent dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink dark:focus:border-dark-accent"
          />
          <button
            type="submit"
            className="press inline-flex h-10 shrink-0 items-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
          >
            {t('doc.renameSave')}
          </button>
        </div>
      </form>
    </Presence>
  )
}
