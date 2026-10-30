import { useEffect, useRef } from 'react'
import { useI18n } from '../hooks/useI18n'
import { editorLineTops } from '../lib/scrollSync'
import type { ClipboardEventHandler, KeyboardEventHandler, ReactEventHandler, ReactNode, RefObject } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
  onSelect?: ReactEventHandler<HTMLTextAreaElement>
  /** Overrides the default placeholder (e.g. how to paste, when the clipboard couldn't be read). */
  placeholder?: string
  /** Overlay UI rendered over the editor (e.g. Smart Assist suggestion bar). */
  children?: ReactNode
  /** The overlay is showing: the text gets room below it, and the caret's line is kept above it. */
  overlayActive?: boolean
}

/** Room for the suggestion bar (phones wrap it to two rows). */
const OVERLAY_ROOM = 112

export function MarkdownEditor({
  value,
  onChange,
  textareaRef,
  onKeyDown,
  onPaste,
  onSelect,
  placeholder,
  children,
  overlayActive = false,
}: MarkdownEditorProps) {
  const { t } = useI18n()
  const localRef = useRef<HTMLTextAreaElement>(null)
  const ref = textareaRef ?? localRef

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [ref])

  // The suggestion bar covered the last lines and took their taps (launch QA #19): when it appears, scroll the
  // caret's line above it if it would sit underneath.
  useEffect(() => {
    const ta = ref.current
    // Measuring wrapped lines mirrors the whole text: skipped on long documents, where it would stall typing.
    if (!overlayActive || !ta || window.document.activeElement !== ta || ta.value.length > 200_000) return
    const line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1
    const top = editorLineTops(ta)[line]
    if (top == null) return
    const lineBottom = top - ta.scrollTop + 28
    const limit = ta.clientHeight - OVERLAY_ROOM
    if (lineBottom > limit) ta.scrollTop += lineBottom - limit
  }, [overlayActive, ref])

  return (
    <div className="relative h-full w-full">
      {/* 16px on phones: iOS Safari auto-zooms into any field whose font is smaller. */}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onSelect={onSelect}
        spellCheck={false}
        placeholder={placeholder ?? t('editor.placeholder')}
        style={overlayActive ? { paddingBottom: OVERLAY_ROOM } : undefined}
        className="h-full w-full resize-none bg-surface px-4 py-6 sm:px-6 sm:py-8 font-mono text-base leading-7 sm:text-sm text-ink caret-accent outline-none placeholder:text-ink-muted dark:bg-dark-surface dark:text-dark-ink dark:caret-dark-accent dark:placeholder:text-dark-ink-muted"
      />
      {children}
    </div>
  )
}
