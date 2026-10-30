import type { ComponentType, ReactNode } from 'react'
import { BookMarked, BookOpen, BookOpenText, Check, Clipboard, Compass, FileText, History, ListTree, Newspaper, NotebookPen } from 'lucide-react'
import type { DocKind, DocStats } from '../assist/docStats'
import { useI18n } from '../hooks/useI18n'
import { kindReason } from '../lib/docKind'

const KIND_ICONS: Record<DocKind, ComponentType<{ className?: string }>> = {
  readme: BookMarked,
  changelog: History,
  guide: Compass,
  reference: BookOpenText,
  docs: BookOpen,
  article: Newspaper,
  notes: NotebookPen,
}

const button = 'tap inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition-colors'
const buttonOff =
  'border-line text-ink hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent'
const buttonOn = 'border-accent text-accent dark:border-dark-accent dark:text-dark-accent'

export interface DocBarProps {
  /** What the document looks like (the Document tab's answer); null → the name is shown instead. */
  kind: DocStats['kind']
  /** Shown when there's no clear type: the file name, or "Untitled". */
  name: string
  /** When nothing is detected, show this instead of the name (the docs pages: "Technical docs"). */
  fallbackLabel?: string
  /** The type was clicked: open the panel on its Document tab. */
  onShowDocument: () => void
  copied: boolean
  onCopy: () => void
  copyTitle: string
  outlineOpen: boolean
  onToggleOutline: () => void
  /** Left of the bar (the docs pages' Back); the type then moves next to the buttons. */
  leading?: ReactNode
  /** Before the buttons (the docs pages' "Read-only" on phones). */
  extra?: ReactNode
  className?: string
}

/**
 * The bar above a rendered document — documents and Marksage's own docs pages alike: what the document is (type
 * from the Document tab, else its name), Copy Markdown and the Outline. Sized by its own width (container
 * queries), so it fits the split view's preview pane as well as a full page.
 */
export function DocBar({ kind, name, fallbackLabel, onShowDocument, copied, onCopy, copyTitle, outlineOpen, onToggleOutline, leading, extra, className = '' }: DocBarProps) {
  const { t } = useI18n()
  const Icon = kind ? KIND_ICONS[kind.id] : fallbackLabel ? BookOpen : FileText
  const label = kind ? t(`doc.kindShort.${kind.id}`) : (fallbackLabel ?? name)
  const title = kind ? `${t('doc.kind.title')}: ${t(`doc.kindShort.${kind.id}`)} — ${kindReason(kind, t)}` : t('docbar.noKind')
  const chip = (
    <button
      type="button"
      onClick={onShowDocument}
      title={title}
      className={`tap group min-w-0 items-center gap-1.5 rounded-md py-1 text-xs text-ink-muted transition-colors hover:text-accent dark:text-dark-ink-muted dark:hover:text-dark-accent ${
        kind || fallbackLabel ? 'uppercase tracking-wider' : ''
      } ${leading ? 'hidden @lg:inline-flex' : 'inline-flex'}`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${kind ? 'text-accent dark:text-dark-accent' : ''}`} />
      <span key={label} className="anim-rise min-w-0 truncate">
        {label}
      </span>
    </button>
  )
  return (
    <div className={`@container mx-auto w-full max-w-[900px] px-4 sm:px-6 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        {leading ?? chip}
        <span className="flex min-w-0 shrink-0 items-center gap-2 @sm:gap-3">
          {leading && chip}
          {extra}
          <button type="button" onClick={onCopy} title={copyTitle} aria-label={copied ? t('action.copied') : t('action.copyMarkdown')} className={`${button} ${copied ? buttonOn : buttonOff}`}>
            {copied ? <Check className="anim-pop h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            <span key={copied ? 'c' : 'n'} className="anim-rise hidden @3xs:inline">
              {copied ? t('action.copied') : <><span className="@lg:hidden">{t('action.copy')}</span><span className="hidden @lg:inline">{t('action.copyMarkdown')}</span></>}
            </span>
          </button>
          <button type="button" onClick={onToggleOutline} aria-pressed={outlineOpen} title={t('outline.toggleTitle')} className={`${button} ${outlineOpen ? buttonOn : buttonOff}`}>
            <ListTree className="h-3.5 w-3.5" />
            <span className="hidden @3xs:inline">{t('outline.toggle')}</span>
          </button>
        </span>
      </div>
    </div>
  )
}

