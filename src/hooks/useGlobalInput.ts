import { useEffect, useState } from 'react'
import { isMarkdownFile } from '../lib/file'
import type { I18n } from './useI18n'

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

interface GlobalInputOptions {
  hasDocument: boolean
  showAbout: boolean
  exportOpen: boolean
  openExport: () => void
  togglePalette: () => void
  onImport: () => void
  onCopy: () => void
  closeAbout: () => void
  openFile: (file: File) => Promise<boolean>
  pasteText: (text: string) => void
  /** A document was opened or created (or not): land in the app. */
  showResult: (created: boolean) => void
  showNotice: (text: string) => void
  t: I18n['t']
}

/**
 * What the whole window listens for: the shortcuts (⌘/Ctrl O, S, K, ⇧C), files and text dropped anywhere (the
 * `isDragging` overlay), Markdown pasted outside the editor, and Esc leaving About and the docs pages.
 */
export function useGlobalInput(o: GlobalInputOptions) {
  const { hasDocument, showAbout, exportOpen, openExport, togglePalette, onImport, onCopy, closeAbout, openFile, pasteText, showResult, showNotice, t } = o
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const key = e.key.toLowerCase()
      if (key === 'o') {
        e.preventDefault()
        onImport()
      } else if (key === 's') {
        e.preventDefault()
        // Opens the Export panel; inside it, ⌘/Ctrl + S again downloads (ExportMenu). Not on About / the docs.
        if (hasDocument && !exportOpen && !showAbout) openExport()
      } else if (key === 'k' && !e.shiftKey && !e.altKey) {
        // The command palette: every action, whatever the browser keeps for itself (⌘N never reaches a page in
        // Chrome, Edge or Opera, so Marksage doesn't use it).
        e.preventDefault()
        togglePalette()
      } else if (key === 'c' && e.shiftKey && !showAbout) {
        e.preventDefault()
        onCopy()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onImport, hasDocument, exportOpen, showAbout, onCopy, openExport, togglePalette])

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')

    const handleDragOver = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault()
        setIsDragging(true)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setIsDragging(false)
    }

    // One file at a time: the first Markdown file among those dropped (else the first, which gets the usual
    // refusal), and a note when others were left out. Dropped text (no files) outside the editor opens like a
    // paste; on the editor the browser inserts it as usual (launch QA #30).
    const handleDrop = (e: DragEvent) => {
      setIsDragging(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (!files.length) {
        if (isEditableTarget(e.target)) return
        e.preventDefault()
        const text = e.dataTransfer?.getData('text/plain')
        if (text?.trim()) {
          pasteText(text)
          showResult(true)
        }
        return
      }
      e.preventDefault()
      const file = files.find((f) => isMarkdownFile(f.name)) ?? files[0]
      openFile(file).then((ok) => {
        showResult(ok)
        if (ok && files.length > 1) showNotice(t(files.length === 2 ? 'drop.oneAtATime.one' : 'drop.oneAtATime.many', { name: file.name, n: files.length - 1 }))
      })
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [openFile, showResult, pasteText, showNotice, t])

  // Esc leaves About and the docs pages, like their Back — unless a menu, panel or field has it (launch QA #36).
  useEffect(() => {
    if (!showAbout) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isEditableTarget(e.target)) return
      if (window.document.querySelector('[role="menu"], [role="dialog"], [aria-expanded="true"]')) return
      closeAbout()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAbout, closeAbout])

  // Paste Markdown anywhere outside the editor.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return
      const text = e.clipboardData?.getData('text/plain')
      if (!text?.trim()) return
      e.preventDefault()
      pasteText(text)
      showResult(true)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [pasteText, showResult])

  return { isDragging }
}
