import { memo, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { editorLineTops } from '../lib/scrollSync'
import type { ClipboardEventHandler, CSSProperties, KeyboardEventHandler, ReactEventHandler, ReactNode, RefObject } from 'react'

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
/** Lines per memoized piece of the line-number mirror: typing re-renders one piece, not every line. */
const PIECE = 200

/**
 * Text metrics shared by the textarea and the line-number mirror — they must wrap identically.
 * 16px on phones: iOS Safari auto-zooms into any field whose font is smaller.
 */
/**
 * Browsers that link an animation to a scroll position (scroll-driven animations): the line numbers then move on
 * the compositor, in the same frame as the text. A scroll listener runs a frame behind it — the numbers visibly
 * trailed the text while scrolling — so it's only the fallback.
 */
const SCROLL_LINKED = typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'scroll()')

const TEXT = 'font-mono text-base leading-7 sm:text-sm pl-3 pr-4 py-6 sm:pl-4 sm:pr-6 sm:py-8'

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

  const lineCount = countLines(value)
  // Gutter width follows the digits of the last line number (never under two), in the editor's own font.
  const digits = Math.max(2, String(lineCount).length)
  const gutter = { '--gutter': `${digits * 0.6 + 1.5}em` } as CSSProperties

  return (
    <div className="editor-lines relative flex h-full w-full overflow-hidden bg-surface dark:bg-dark-surface" style={gutter}>
      <div aria-hidden className="w-(--gutter) shrink-0 font-mono text-base sm:text-sm" />
      <div className="relative min-w-0 flex-1">
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
          className={`relative block h-full w-full resize-none overscroll-none bg-transparent ${TEXT} text-ink caret-accent outline-none placeholder:text-ink-muted dark:text-dark-ink dark:caret-dark-accent dark:placeholder:text-dark-ink-muted`}
        />
        {/* After the textarea: its layout effects read the textarea's ref, which React attaches in tree order. */}
        <LineNumbers value={value} textareaRef={ref} overlayActive={overlayActive} />
      </div>
      {children}
    </div>
  )
}

function countLines(s: string): number {
  let n = 1
  for (let i = s.indexOf('\n'); i !== -1; i = s.indexOf('\n', i + 1)) n++
  return n
}

/**
 * Line numbers that follow soft wrapping: a hidden copy of the text, laid out at the textarea's width with the
 * same font and padding, puts each number at the first row of its line. Only the numbers are visible (they sit
 * in the gutter, left of the text). It follows the textarea's scroll with a transform, never a re-render: a
 * scroll-driven animation (`.editor-lines` in index.css, over `--scroll-max`) where supported, else a listener.
 * The textarea doesn't rubber-band (`overscroll-none`): the bounce moved the text but not its scroll position.
 */
function LineNumbers({ value, textareaRef, overlayActive }: { value: string; textareaRef: RefObject<HTMLTextAreaElement | null>; overlayActive: boolean }) {
  const text = useDeferredValue(value)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [caretLine, setCaretLine] = useState(0)

  // Same width as the textarea's text box (clientWidth leaves out a classic scrollbar).
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const measure = () => setWidth(ta.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ta)
    return () => ro.disconnect()
  }, [textareaRef])
  // A scrollbar appears or goes away as the text grows or shrinks.
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (ta && ta.clientWidth !== width) setWidth(ta.clientWidth)
  }, [text, width, textareaRef])
  // The scroll-driven animation maps 0–100 % of the scroll to 0…-max px: keep max current before each paint
  // (typing changes the height; the suggestion bar adds bottom padding; resizing changes both).
  useLayoutEffect(() => {
    const ta = textareaRef.current
    const mirror = mirrorRef.current
    if (!SCROLL_LINKED || !ta || !mirror) return
    const update = () => mirror.style.setProperty('--scroll-max', String(Math.max(0, ta.scrollHeight - ta.clientHeight)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(ta)
    ta.addEventListener('input', update)
    return () => {
      ro.disconnect()
      ta.removeEventListener('input', update)
    }
  }, [textareaRef, value, overlayActive, width])

  useEffect(() => {
    const ta = textareaRef.current
    const mirror = mirrorRef.current
    if (!ta || !mirror) return
    const follow = () => {
      if (!SCROLL_LINKED) mirror.style.transform = `translate3d(0, ${-ta.scrollTop}px, 0)`
    }
    // The caret's line number is drawn brighter — where you are at a glance.
    const caret = () => {
      const v = ta.value
      let n = 0
      for (let i = v.indexOf('\n'); i !== -1 && i < ta.selectionStart; i = v.indexOf('\n', i + 1)) n++
      setCaretLine(n)
    }
    follow()
    caret()
    ta.addEventListener('scroll', follow, { passive: true })
    const CARET = ['select', 'keyup', 'pointerup', 'input', 'focus'] as const
    for (const ev of CARET) ta.addEventListener(ev, caret)
    // Arrow keys held down move the caret with no keyup until released.
    const onSelection = () => window.document.activeElement === ta && caret()
    window.document.addEventListener('selectionchange', onSelection)
    return () => {
      ta.removeEventListener('scroll', follow)
      for (const ev of CARET) ta.removeEventListener(ev, caret)
      window.document.removeEventListener('selectionchange', onSelection)
    }
  }, [textareaRef])

  const pieces: string[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += PIECE) pieces.push(lines.slice(i, i + PIECE).join('\n'))

  return (
    <div
      ref={mirrorRef}
      aria-hidden
      className={`line-mirror pointer-events-none absolute left-0 top-0 select-none ${TEXT}`}
      style={{ width: width ?? '100%' }}
    >
      {pieces.map((p, i) => (
        <Piece key={i} text={p} first={i * PIECE} caret={caretLine >= i * PIECE && caretLine < (i + 1) * PIECE ? caretLine : -1} />
      ))}
    </div>
  )
}

const Piece = memo(function Piece({ text, first, caret }: { text: string; first: number; caret: number }) {
  return text.split('\n').map((line, i) => (
    <div key={i} data-n={first + i + 1} data-caret={first + i === caret ? '' : undefined}>
      {line || '​'}
    </div>
  ))
})
