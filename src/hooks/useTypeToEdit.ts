import { useEffect, useRef, type RefObject } from 'react'
import { editorLineTops } from '../lib/scrollSync'
import type { ViewMode } from '../lib/viewMode'
import type { MarkdownDocument } from './useMarkdownFile'

interface TypeToEditOptions {
  document: MarkdownDocument | null
  viewMode: ViewMode
  showAbout: boolean
  /** The preview page (preview mode's scrolling `<main>`). */
  previewRef: RefObject<HTMLElement | null>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  changeViewMode: (mode: ViewMode) => void
  updateContent: (content: string) => void
}

/**
 * Read-first: opened and pasted files show the preview. Typing there switches to the editor and keeps the
 * keystroke — at the end of the block last clicked in the preview, else of the first block in view (launch QA
 * #8: testers typed into the preview and nothing happened). Space still scrolls; shortcuts and menus are untouched.
 */
export function useTypeToEdit({ document, viewMode, showAbout, previewRef, textareaRef, changeViewMode, updateContent }: TypeToEditOptions) {
  const lastPreviewLine = useRef<number | null>(null)
  useEffect(() => {
    if (!document || document.readOnly || viewMode !== 'preview' || showAbout) return
    lastPreviewLine.current = null
    const main = previewRef.current
    const onClick = (e: MouseEvent) => {
      const block = (e.target as Element | null)?.closest?.('[data-line]')
      if (block) lastPreviewLine.current = Number(block.getAttribute('data-line')) - 1
    }
    const firstVisibleLine = () => {
      if (!main) return 0
      const top = main.getBoundingClientRect().top
      for (const el of main.querySelectorAll('[data-line]')) {
        if (el.getBoundingClientRect().bottom > top + 1) return Number(el.getAttribute('data-line')) - 1
      }
      return 0
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (e.key.length !== 1 || e.key === ' ') return
      const target = e.target as HTMLElement
      if (target !== window.document.body && !main?.contains(target)) return
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      const line = Math.max(0, lastPreviewLine.current ?? firstVisibleLine())
      const key = e.key
      changeViewMode('edit')
      let tries = 0
      const go = () => {
        const ta = textareaRef.current
        if (!ta) {
          if (++tries < 30) requestAnimationFrame(go)
          return
        }
        const lines = ta.value.split('\n')
        const l = Math.min(line, lines.length - 1)
        const caret = lines.slice(0, l + 1).join('\n').length
        const tops = editorLineTops(ta)
        ta.scrollTo({ top: Math.max(0, (tops[l] ?? 0) - ta.clientHeight / 3) })
        ta.focus({ preventScroll: true })
        ta.setSelectionRange(caret, caret)
        // execCommand keeps the browser's undo stack (⌘Z takes the keystroke back).
        const ok = typeof window.document.execCommand === 'function' && window.document.execCommand('insertText', false, key)
        if (!ok) {
          updateContent(ta.value.slice(0, caret) + key + ta.value.slice(caret))
          requestAnimationFrame(() => ta.setSelectionRange(caret + 1, caret + 1))
        }
      }
      requestAnimationFrame(go)
    }
    main?.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      main?.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [document, viewMode, showAbout, changeViewMode, updateContent, previewRef, textareaRef])
}
