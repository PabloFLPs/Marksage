import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { READ_ONLY_DOC_CHARS, isMarkdownFile, looksBinary, readFileAsText } from '../lib/file'
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
  /** Over READ_ONLY_DOC_CHARS: shown in the preview only, never edited, kept in the browser or put in Recent. */
  readOnly?: boolean
}

const PERSIST_DELAY = 300
const DOC_KEY = 'marksage:doc' // lib/storage.ts — watched for other tabs' saves

/** What a stored document is, for "did this tab change anything since it last wrote or read it?". */
const sig = (d: MarkdownDocument | null) => (d ? JSON.stringify([d.id, d.filename, d.content, d.savedContent]) : '')

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
  // What storage holds, as far as this tab knows: it writes only when its document differs, so an idle tab never
  // overwrites another tab's newer save (launch QA #14: reloading a stale tab used to do exactly that).
  const persisted = useRef(sig(document))
  // Another Marksage tab saved this same document while this one had changes of its own: the user picks.
  const [conflict, setConflict] = useState<MarkdownDocument | null>(null)
  const conflictRef = useRef(conflict)
  conflictRef.current = conflict
  // The browser refused to keep the document (too large, or storage full): say so once, until a save works again.
  const saveFailed = useRef(false)
  const save = useCallback((doc: MarkdownDocument) => {
    const ok = saveDocument(doc)
    if (ok) {
      saveFailed.current = false
      persisted.current = sig(doc)
    } else if (!saveFailed.current) {
      saveFailed.current = true
      setError('error.notSaved')
    }
  }, [])

  /** Write the current doc into history now — called before switching documents. */
  const flushCurrent = useCallback(() => {
    const cur = docRef.current
    if (cur && !cur.readOnly) setHistory((prev) => upsertHistory(prev, { ...cur, updatedAt: Date.now() }))
  }, [])

  // Persist the current doc and mirror it into history (debounced).
  useEffect(() => {
    if (!document || document.readOnly || sig(document) === persisted.current || conflict) return
    const timer = window.setTimeout(() => {
      save(document)
      setHistory((prev) => {
        const existing = prev.find((e) => e.id === document.id)
        if (existing && existing.content === document.content && existing.filename === document.filename) return prev
        return upsertHistory(prev, { ...document, updatedAt: Date.now() })
      })
    }, PERSIST_DELAY)
    return () => window.clearTimeout(timer)
  }, [document, save, conflict])

  // Leaving the page (reload, closing the tab, switching apps on a phone) skips the debounce above, so save
  // right away — otherwise the last ~300 ms of typing, or a document created just before, would be lost.
  const historyRef = useRef(history)
  historyRef.current = history
  useEffect(() => {
    const flushNow = () => {
      const cur = docRef.current
      if (!cur || cur.readOnly) return
      // Only this tab's own changes, and not over another tab's version while the user hasn't picked (this one
      // still lands in Recent just below).
      if (sig(cur) !== persisted.current && !conflictRef.current && saveDocument(cur)) persisted.current = sig(cur)
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

  // Another tab saved: follow it when this tab has nothing of its own, or ask when both changed the document.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DOC_KEY || !e.newValue) return
      const stored = loadDocument()
      const cur = docRef.current
      if (!stored?.id || !cur || cur.readOnly || stored.id !== cur.id) return // another document there: ours stays (and is in Recent)
      const theirs: MarkdownDocument = { ...stored, id: stored.id }
      if (sig(theirs) === sig(cur)) {
        persisted.current = sig(theirs)
      } else if (sig(cur) === persisted.current) {
        persisted.current = sig(theirs)
        setDocument(theirs)
      } else {
        setConflict(theirs)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /** The conflict bar's answer: take the other tab's version, or keep this one (saved over it now). */
  const resolveConflict = useCallback(
    (keepMine: boolean) => {
      const theirs = conflictRef.current
      setConflict(null)
      if (!theirs) return
      if (keepMine) {
        if (docRef.current) save(docRef.current)
      } else {
        // This tab's version stays in Recent, as its own entry (same id would be replaced by theirs).
        const mine = docRef.current
        if (mine) setHistory((prev) => upsertHistory(prev, { ...mine, id: newDocId(), updatedAt: Date.now() }))
        persisted.current = sig(theirs)
        setDocument(theirs)
      }
    },
    [save],
  )

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
        const readOnly = content.length > READ_ONLY_DOC_CHARS
        setDocument({ id: idFor(file.name, content), filename: file.name, content, savedContent: content, ...(readOnly && { readOnly }) })
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
      const readOnly = text.length > READ_ONLY_DOC_CHARS
      setDocument({ id: idFor(filename, text), filename, content: text, savedContent: readOnly || filename ? text : '', ...(readOnly && { readOnly }) })
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
    save(fresh) // stored at once, so a reload right after New doesn't bring the previous document back
    setDocument(fresh)
    setError(null)
  }, [flushCurrent, save])

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
    setDocument((prev) => (prev && !prev.readOnly ? { ...prev, content } : prev))
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
    conflict: conflict !== null,
    resolveConflict,
    openFromHistory,
    removeFromHistory,
    clearHistory,
  }
}
