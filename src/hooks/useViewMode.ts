import { useCallback, useEffect, useRef, useState } from 'react'
import type { ViewMode } from '../lib/viewMode'
import { EXIT_MS } from './useInfoPages'

/**
 * Preview or editor. The editor slides in, and out on close (`editorClosing` while it plays); a read-only document
 * never shows it; small screens start in it when the app opens on a document.
 */
export function useViewMode({ readOnly, isDesktop, hasDocument }: { readOnly: boolean; isDesktop: boolean; hasDocument: boolean }) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [editorClosing, setEditorClosing] = useState(false)
  const editorTimer = useRef<number | null>(null)
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  // A read-only document never shows the editor — not even on phones, where opened files start in it.
  useEffect(() => {
    if (readOnly && viewMode === 'edit') setViewMode('preview')
  }, [readOnly, viewMode])
  const changeViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode === 'edit') {
        if (readOnlyRef.current) return // over 5 MB: the preview only (launch QA #15)
        if (editorTimer.current) window.clearTimeout(editorTimer.current)
        editorTimer.current = null
        setEditorClosing(false)
        setViewMode('edit')
        return
      }
      if (viewMode !== 'edit' || editorTimer.current) return
      setEditorClosing(true)
      editorTimer.current = window.setTimeout(() => {
        editorTimer.current = null
        setEditorClosing(false)
        setViewMode('preview')
      }, EXIT_MS)
    },
    [viewMode],
  )

  // Small screens start in the editor.
  const checkedInitialMode = useRef(false)
  useEffect(() => {
    if (checkedInitialMode.current) return
    checkedInitialMode.current = true
    if (!isDesktop && hasDocument) setViewMode('edit')
  }, [isDesktop, hasDocument])

  return { viewMode, setViewMode, editorClosing, changeViewMode }
}
