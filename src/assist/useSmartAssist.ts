import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent, RefObject } from 'react'
import type { AssistMode, DecisionEngine, ReadabilityMark, Suggestion } from './types.ts'
import { HeuristicEngine } from './heuristicEngine.ts'
import { ModelEngine } from './modelEngine.ts'
import { listFenceSuggestions, suggestFenceLanguage } from './features/codeFence.ts'
import { suggestPasteConversion } from './features/smartPaste.ts'
import { listStructureSuggestions, suggestStructure } from './features/structure.ts'
import { scoreReadability } from './features/readability.ts'

const DEBOUNCE_MS = 400
const IDLE_MS = 2000
const LIST_MS = 600

export type EngineStatus =
  | { state: 'off' }
  | { state: 'ready'; kind: DecisionEngine['kind'] }
  | { state: 'loading'; progress?: number }
  | { state: 'fallback'; reason: string }

interface Options {
  mode: AssistMode
  text: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  /** Also list every suggestion in the document (the panel's Suggestions tab is open). */
  listAll?: boolean
}

export function useSmartAssist({ mode, text, textareaRef, onChange, listAll = false }: Options) {
  const heuristic = useMemo(() => new HeuristicEngine(), [])
  const [engine, setEngine] = useState<DecisionEngine | null>(null)
  const [status, setStatus] = useState<EngineStatus>({ state: 'off' })
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [readability, setReadability] = useState<ReadabilityMark[]>([])
  const [cursor, setCursor] = useState(0)
  const dismissed = useRef(new Set<string>())
  const [dismissedCount, setDismissedCount] = useState(0)
  const pasteSticky = useRef(false)
  // A suggestion opened from the Suggestions tab stays up while the caret stays where the jump put it.
  const pinnedAt = useRef<number | null>(null)
  const [all, setAll] = useState<Suggestion[]>([])

  // Engine lifecycle.
  useEffect(() => {
    setSuggestion(null)
    setReadability([])
    setAll([])
    if (mode === 'off') {
      setEngine(null)
      setStatus({ state: 'off' })
      return
    }
    if (mode === 'heuristics') {
      setEngine(heuristic)
      setStatus({ state: 'ready', kind: 'heuristic' })
      return
    }
    // Local model: Marksage's own code-language model (F1) on top of the heuristics.
    // Heuristics serve while it loads — and if it can't.
    let alive = true
    setEngine(heuristic)
    const model = new ModelEngine(heuristic)
    model.onProgress = (loaded, total) => alive && setStatus({ state: 'loading', progress: total ? loaded / total : undefined })
    setStatus({ state: 'loading' })
    model.ready().then(
      () => {
        if (!alive) return
        setEngine(model)
        setStatus({ state: 'ready', kind: 'model' })
      },
      (err: Error) => alive && setStatus({ state: 'fallback', reason: err.message }),
    )
    return () => {
      alive = false
    }
  }, [mode, heuristic])

  const isDismissed = useCallback((key: string) => dismissed.current.has(key), [])

  // F1 + F3 — debounced on text / cursor changes.
  useEffect(() => {
    if (!engine) return
    if (pasteSticky.current) {
      // Keep the paste offer while its range is intact.
      if (suggestion && text.slice(suggestion.edit.from, suggestion.edit.to) === suggestion.expected) return
      pasteSticky.current = false
    }
    if (pinnedAt.current !== null) {
      if (cursor === pinnedAt.current && suggestion && text.slice(suggestion.edit.from, suggestion.edit.to) === suggestion.expected) return
      pinnedAt.current = null
    }
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const next =
          (await suggestFenceLanguage(text, cursor, engine, isDismissed, ctrl.signal)) ??
          (await suggestStructure(text, cursor, engine, isDismissed, ctrl.signal))
        if (!ctrl.signal.aborted) setSuggestion(next)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.warn('[smart-assist]', err)
      }
    }, DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
    // `suggestion` intentionally omitted: only input changes should re-run analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, text, cursor, isDismissed])

  // F4 — on idle.
  useEffect(() => {
    if (!engine) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const marks = await scoreReadability(text, engine, ctrl.signal)
        // Keep the same array when nothing changed, so dots don't re-mount (and re-pop) every idle.
        if (!ctrl.signal.aborted)
          setReadability((prev) => (JSON.stringify(prev) === JSON.stringify(marks) ? prev : marks))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.warn('[smart-assist]', err)
      }
    }, IDLE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [engine, text])

  // The Suggestions tab: every fixable spot in the document, in document order.
  useEffect(() => {
    if (!engine || !listAll) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const [fences, lines] = await Promise.all([
          listFenceSuggestions(text, engine, isDismissed, ctrl.signal),
          listStructureSuggestions(text, engine, isDismissed, ctrl.signal),
        ])
        if (!ctrl.signal.aborted) setAll([...fences, ...lines].sort((a, b) => a.edit.from - b.edit.from))
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.warn('[smart-assist]', err)
      }
    }, LIST_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [engine, text, listAll, isDismissed, dismissedCount])

  /** Show a suggestion picked in the Suggestions tab; the caller has put the caret at `caret`. */
  const show = useCallback((s: Suggestion, caret: number) => {
    if (dismissed.current.has(s.key) || text.slice(s.edit.from, s.edit.to) !== s.expected) return false
    pasteSticky.current = false
    pinnedAt.current = caret
    setCursor(caret)
    setSuggestion(s)
    return true
  }, [text])

  const syncCursor = useCallback(() => {
    const el = textareaRef.current
    if (el) setCursor(el.selectionStart)
  }, [textareaRef])

  const dismiss = useCallback(() => {
    if (suggestion) {
      dismissed.current.add(suggestion.key)
      setDismissedCount((n) => n + 1)
    }
    pasteSticky.current = false
    pinnedAt.current = null
    setSuggestion(null)
  }, [suggestion])

  /** Apply the suggestion — or, for a choice, the `index`-th option (0 = first). */
  const accept = useCallback((index = 0) => {
    const el = textareaRef.current
    const s = suggestion
    if (!s || !el) return
    setSuggestion(null)
    pasteSticky.current = false
    pinnedAt.current = null
    const { from, to, insert } = s.choices?.[index]?.edit ?? s.edit
    if (el.value.slice(from, to) !== s.expected) return // text moved on — stale suggestion
    el.focus({ preventScroll: true })
    el.setSelectionRange(from, to)
    // execCommand keeps native undo (Cmd+Z) working; fall back to a controlled update.
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, insert)
    if (!ok) {
      const next = el.value.slice(0, from) + insert + el.value.slice(to)
      onChange(next)
      requestAnimationFrame(() => el.setSelectionRange(from + insert.length, from + insert.length))
    }
  }, [suggestion, textareaRef, onChange])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!suggestion) return
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        accept()
      } else if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'Digit2' && (suggestion.choices?.length ?? 0) > 1) {
        // Alt+2 picks the second option (e.code: on macOS ⌥2 would otherwise type "™").
        e.preventDefault()
        accept(1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        dismiss()
      }
    },
    [suggestion, accept, dismiss],
  )

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!engine) return
      const pasted = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
      const from = e.currentTarget.selectionStart
      // Let the default paste happen untouched, then offer a conversion.
      queueMicrotask(async () => {
        const s = await suggestPasteConversion(pasted, from, engine).catch(() => null)
        if (s && !dismissed.current.has(s.key)) {
          pasteSticky.current = true
          setSuggestion(s)
        }
      })
    },
    [engine],
  )

  if (mode === 'off') {
    return { enabled: false as const, status, suggestion: null, readability: [] as ReadabilityMark[], all: [] as Suggestion[] }
  }
  return {
    enabled: true as const,
    status,
    suggestion,
    readability,
    all: listAll ? all : [],
    show,
    accept,
    dismiss,
    handlers: { onKeyDown, onPaste, onSelect: syncCursor },
  }
}
