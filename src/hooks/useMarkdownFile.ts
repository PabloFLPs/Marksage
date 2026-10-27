import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isMarkdownFile, readFileAsText } from '../lib/file'
import { loadDocument, saveDocument } from '../lib/storage'
import {
  clearHistory as clearAll,
  findDuplicate,
  loadHistory,
  newDocId,
  removeHistory,
  upsertHistory,
  type HistoryEntry,
} from '../lib/history'

export interface MarkdownDocument {
  id: string
  filename: string | null
  content: string
  savedContent: string
}

const PERSIST_DELAY = 300

function getInitialDocument(): MarkdownDocument | null {
  const stored = loadDocument()
  return stored ? { ...stored, id: stored.id ?? newDocId() } : null
}

export function useMarkdownFile() {
  const [document, setDocument] = useState<MarkdownDocument | null>(getInitialDocument)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef(document)
  docRef.current = document

  /** Write the current doc into history now — called before switching documents. */
  const flushCurrent = useCallback(() => {
    const cur = docRef.current
    if (cur) setHistory((prev) => upsertHistory(prev, { ...cur, updatedAt: Date.now() }))
  }, [])

  // Persist the current doc and mirror it into history (debounced).
  useEffect(() => {
    if (!document) return
    const timer = window.setTimeout(() => {
      saveDocument(document)
      setHistory((prev) => {
        const existing = prev.find((e) => e.id === document.id)
        if (existing && existing.content === document.content && existing.filename === document.filename) return prev
        return upsertHistory(prev, { ...document, updatedAt: Date.now() })
      })
    }, PERSIST_DELAY)
    return () => window.clearTimeout(timer)
  }, [document])

  const isDirty = useMemo(
    () => (document ? document.content !== document.savedContent : false),
    [document],
  )

  /** Reuse the history id when the same file/text comes back, so it doesn't duplicate. */
  const idFor = useCallback(
    (filename: string | null, content: string) => findDuplicate(history, filename, content)?.id ?? newDocId(),
    [history],
  )

  const openFile = useCallback(
    async (file: File): Promise<boolean> => {
      if (!isMarkdownFile(file.name)) {
        setError('error.notMarkdown')
        return false
      }
      try {
        const content = await readFileAsText(file)
        flushCurrent()
        setDocument({ id: idFor(file.name, content), filename: file.name, content, savedContent: content })
        setError(null)
        return true
      } catch (err) {
        setError('error.readFailed')
        return false
      }
    },
    [idFor, flushCurrent],
  )

  /**
   * Open text that isn't a file. `filename` names a document the app offers (the playground), which then
   * starts clean: there is nothing of the user's to lose until they edit it.
   */
  const pasteText = useCallback(
    (text: string, filename: string | null = null) => {
      flushCurrent()
      setDocument({ id: idFor(filename, text), filename, content: text, savedContent: filename ? text : '' })
      setError(null)
    },
    [idFor, flushCurrent],
  )

  const newDocument = useCallback(() => {
    flushCurrent()
    setDocument({ id: newDocId(), filename: null, content: '', savedContent: '' })
    setError(null)
  }, [flushCurrent])

  const openFromHistory = useCallback((entry: HistoryEntry) => {
    flushCurrent()
    setDocument({
      id: entry.id,
      filename: entry.filename,
      content: entry.content,
      savedContent: entry.savedContent,
    })
    setError(null)
  }, [flushCurrent])

  const removeFromHistory = useCallback((id: string) => setHistory((prev) => removeHistory(prev, id)), [])
  const clearHistory = useCallback(() => setHistory(clearAll()), [])

  const updateContent = useCallback((content: string) => {
    setDocument((prev) => (prev ? { ...prev, content } : prev))
  }, [])

  const markSaved = useCallback(() => {
    setDocument((prev) =>
      prev && prev.content !== prev.savedContent ? { ...prev, savedContent: prev.content } : prev,
    )
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    document,
    isDirty,
    openFile,
    pasteText,
    newDocument,
    updateContent,
    markSaved,
    error,
    clearError,
    setError,
    history,
    openFromHistory,
    removeFromHistory,
    clearHistory,
  }
}
