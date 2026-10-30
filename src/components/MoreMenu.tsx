import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Clipboard, FilePlus2, FolderOpen, Info, ListTree, Moon, MoreHorizontal, PenLine, Sun } from 'lucide-react'
import type { Theme } from '../hooks/useTheme'
import { Presence } from './motion'
import { RenameSheet } from './DocName'
import { useI18n } from '../hooks/useI18n'

interface MoreMenuProps {
  hasDocument: boolean
  copied: boolean
  theme: Theme
  onNew: () => void
  onOpen: () => void
  onCopy: () => void
  onAbout: () => void
  onToggleTheme: () => void
  /** Open the Outline sheet (only with a document, outside About). */
  onOutline?: () => void
  /** The document's name — phones have no room for it in the header, so the menu shows it and renames it. */
  filename?: string | null
  isDirty?: boolean
  onRename?: (name: string) => void
}

/** Compact (mobile) overflow menu for secondary header actions. */
export function MoreMenu(props: MoreMenuProps) {
  const { hasDocument, copied, theme, onNew, onOpen, onCopy, onAbout, onToggleTheme, onOutline, filename = null, isDirty = false, onRename } = props
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  const run = (fn: () => void, close = true) => () => {
    if (close) setOpen(false)
    fn()
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('action.more')}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-md border bg-surface transition-colors dark:bg-dark-surface-soft ${
          open
            ? 'border-accent text-accent dark:border-dark-accent dark:text-dark-accent'
            : 'border-line text-ink-muted dark:border-dark-line dark:text-dark-ink-muted'
        }`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      <Presence
        show={open}
        enter="anim-menu-in"
        exit="anim-menu-out"
        duration={140}
        className="fixed right-3 top-[3.75rem] z-40 w-56 origin-top-right"
      >
        <div role="menu" className="anim-stagger flex flex-col whitespace-normal rounded-lg border border-line bg-surface p-1.5 shadow-lg dark:border-dark-line dark:bg-dark-surface-soft">
          {hasDocument && onRename && (
            <Item
              icon={<PenLine />}
              label={t('doc.renameItem')}
              detail={`${filename ?? t('doc.untitled')}${isDirty ? ' *' : ''}`}
              onClick={run(() => setRenaming(true))}
            />
          )}
          <Item icon={<FilePlus2 />} label={t('action.newDocument')} onClick={run(onNew)} />
          <Item icon={<FolderOpen />} label={t('action.openFile')} onClick={run(onOpen)} />
          {hasDocument && (
            <Item
              icon={copied ? <Check className="anim-pop" /> : <Clipboard />}
              label={copied ? t('action.copied') : t('action.copyMarkdown')}
              onClick={run(onCopy, false)}
            />
          )}
          {hasDocument && onOutline && <Item icon={<ListTree />} label={t('outline.title')} onClick={run(onOutline)} />}
          <Item
            icon={theme === 'dark' ? <Sun /> : <Moon />}
            label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            onClick={run(onToggleTheme, false)}
          />
          <div className="my-1 h-px bg-line dark:bg-dark-line" />
          <Item icon={<Info />} label={t('action.about')} onClick={run(onAbout)} />
        </div>
      </Presence>
      {onRename && <RenameSheet open={renaming && hasDocument} filename={filename} onClose={() => setRenaming(false)} onRename={onRename} />}
    </div>
  )
}

function Item({ icon, label, detail, onClick }: { icon: ReactNode; label: string; detail?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-11 items-center gap-3 rounded-md px-3 text-left text-sm text-ink active:bg-surface-soft dark:text-dark-ink dark:active:bg-dark-surface-raised [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-ink-muted dark:[&_svg]:text-dark-ink-muted"
    >
      {icon}
      {detail ? (
        <span className="min-w-0 flex-1 py-1.5">
          <span className="block">{label}</span>
          <span className="block truncate font-mono text-[11px] text-ink-muted dark:text-dark-ink-muted">{detail}</span>
        </span>
      ) : (
        label
      )}
    </button>
  )
}
