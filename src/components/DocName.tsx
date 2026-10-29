import { useRef, useState } from 'react'
import { baseNameLength, normalizeFilename } from '../lib/file'
import { useI18n } from '../hooks/useI18n'

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
          size={Math.max(10, value.length + 1)}
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
          className="anim-pop min-w-0 max-w-[40vw] rounded border border-accent bg-surface px-1 font-mono text-sm text-ink outline-none dark:border-dark-accent dark:bg-dark-surface-soft dark:text-dark-ink"
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
