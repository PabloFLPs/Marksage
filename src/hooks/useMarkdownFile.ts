import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isMarkdownFile, looksBinary, readFileAsText } from '../lib/file'
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

  // Leaving the page (reload, closing the tab, switching apps on a phone) skips the debounce above, so save
  // right away — otherwise the last ~300 ms of typing, or a document created just before, would be lost.
  const historyRef = useRef(history)
  historyRef.current = history
  useEffect(() => {
    const flushNow = () => {
      const cur = docRef.current
      if (!cur) return
      saveDocument(cur)
      const existing = historyRef.current.find((e) => e.id === cur.id)
      if (!existing || existing.content !== cur.content || existing.filename !== cur.filename)
        historyRef.current = upsertHistory(historyRef.current, { ...cur, updatedAt: Date.now() })
    }
    const onHidden = () => {
      if (window.document.visibilityState === 'hidden') flushNow()
    }
    window.addEventListener('pagehide', flushNow)
    window.document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flushNow)
      window.document.removeEventListener('visibilitychange', onHidden)
    }
  }, [])

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
        if (looksBinary(content)) {
          setError('error.notText')
          return false
        }
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

  /** A new name (already normalized, see lib/file.ts) — the text is untouched. */
  const renameDocument = useCallback((filename: string) => {
    setDocument((d) => (d ? { ...d, filename } : d))
  }, [])

  const newDocument = useCallback(() => {
    flushCurrent()
    const fresh = { id: newDocId(), filename: null, content: '', savedContent: '' }
    saveDocument(fresh) // stored at once, so a reload right after New doesn't bring the previous document back
    setDocument(fresh)
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
    renameDocument,
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
