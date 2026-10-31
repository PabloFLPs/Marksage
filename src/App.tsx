import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Eye, Gauge, ImageOff, Lock, X } from 'lucide-react'
import { Header } from './components/Header'
import { EmptyState } from './components/EmptyState'
import { MarkdownPreview } from './components/MarkdownPreview'
import { countRemoteImages } from './lib/remoteImages'
import { MarkdownEditor } from './components/MarkdownEditor'
import { SplitPanes } from './components/SplitPanes'
import { useMarkdownFile } from './hooks/useMarkdownFile'
import { useTheme } from './hooks/useTheme'
import { useMediaQuery } from './hooks/useMediaQuery'
import {
  LARGE_DOC_CHARS,
  copyTextToClipboard,
  isMarkdownFile,
  downloadMarkdown,
  openFilePicker,
  suggestFilename,
} from './lib/file'
import { deleteAllLocalData, loadAssistMode, loadOutlineOpen, loadRemoteImages, loadSplitRatio, saveAssistMode, saveModelNoticeSeen, saveOutlineOpen, saveRemoteImages, saveSplitRatio } from './lib/storage'
import { deleteDownloadedModel } from './assist/modelEngine'
import { AboutPage } from './components/AboutPage'
import { getSampleDocument, getSampleFilename } from './lib/sampleDocument'
import { useI18n } from './hooks/useI18n'
import { useKeyStyle } from './hooks/useKeyStyle'
import { shortcut } from './lib/keyStyle'
import { Presence } from './components/motion'
import { SuggestionBar } from './components/SuggestionBar'
import { useAppIcon } from './hooks/useAppIcon'
import { appIconUrl } from './lib/appIcons'
import { useScrollSync } from './hooks/useScrollSync'
import { useSmartAssist } from './assist/useSmartAssist'
import { useOutline } from './assist/useOutline'
import { elementForLine, useOutlineNav } from './hooks/useOutlineNav'
import { ScrollJump } from './components/ScrollJump'
import { editorLineTops } from './lib/scrollSync'
import { OutlinePanel, type PanelTab } from './components/OutlinePanel'
import { DocBar } from './components/DocBar'
import { useDocKind } from './hooks/useDocKind'
import type { AssistMode, Suggestion } from './assist/types'
import type { ViewMode } from './lib/viewMode'

import { loadDocsPage } from './lib/docsContent'
import { loadStoryPage } from './lib/storyContent'
import type { TechDocsPageProps } from './components/TechDocsPage'
import type { StoryPageProps } from './components/StoryPage'
import { PageLoadBoundary, PageLoading } from './components/PageLoad'

const EXIT_MS = 220

type InfoPage = 'about' | 'docs' | 'models' | 'story'
function pageFromHash(): InfoPage | null {
  const h = window.location.hash.toLowerCase() // "#ABOUT" works too (launch QA #36)
  return h === '#about' || h === '#privacy' ? 'about' : h === '#smart-assist' ? 'docs' : h === '#models' ? 'models' : h === '#story' ? 'story' : null
}

/**
 * Each history entry Marksage has seen carries `{ ms: 1, from }`: the screen it was opened from ('app', a page),
 * or null when it was the first one (a direct link). The in-app Back goes back in history when there is an
 * in-app previous screen — so it always agrees with the browser's Back — and otherwise to the parent page.
 */
type CameFrom = InfoPage | 'app' | null
interface NavState {
  ms: 1
  from: CameFrom
}
function navState(): NavState | null {
  const s = window.history.state as Partial<NavState> | null
  return s?.ms === 1 ? (s as NavState) : null
}
const DESKTOP_QUERY = '(min-width: 768px)'
const nullRef = { current: null }
const COPIED_RESET_MS = 1600

function countWords(content: string): number {
  const match = content.trim().match(/\S+/g)
  return match ? match.length : 0
}

function countLines(content: string): number {
  let n = 1
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) n++
  return n
}

/** UTF-8 size of the text — what Export saves — counted without encoding a copy. */
function utf8Bytes(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4 // surrogate pair: one 4-byte character
      i++
    } else n += 3
  }
  return n
}

function formatBytes(bytes: number, lang: string): string {
  if (bytes < 1000) return `${bytes.toLocaleString(lang)} B`
  const [v, unit] = bytes < 1_000_000 ? [bytes / 1000, 'KB'] : [bytes / 1_000_000, 'MB']
  return `${v.toLocaleString(lang, { maximumFractionDigits: v < 100 ? 1 : 0 })} ${unit}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export default function App() {
  const { t, lang } = useI18n()
  const { keyStyle } = useKeyStyle()
  const {
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
    history: recent,
    conflict,
    resolveConflict,
    openFromHistory,
    removeFromHistory,
    clearHistory,
  } = useMarkdownFile()
  const { theme, toggleTheme } = useTheme()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const isTouch = useMediaQuery('(pointer: coarse)')
  // "Paste Markdown" when the browser won't let us read the clipboard: a new document whose placeholder
  // says how to paste into it (works everywhere, iOS included). Cleared once there's text, or on a plain New.
  const [pasteHint, setPasteHint] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  // A short, neutral message (not an error) that goes away by itself.
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const showNotice = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }, [])
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio)
  const copiedTimer = useRef<number | null>(null)
  const [assistMode, setAssistMode] = useState<AssistMode>(loadAssistMode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null) // split view: the preview pane (scrolls with the editor)
  // Outline panel: docked on desktop (remembered), a bottom sheet on small screens (never auto-opens).
  const [outlineOpen, setOutlineOpen] = useState(() => isDesktop && loadOutlineOpen())
  const [panelTab, setPanelTab] = useState<PanelTab>('outline') // this session only
  const assist = useSmartAssist({
    mode: document?.readOnly ? 'off' : assistMode, // a read-only giant isn't scanned
    text: document?.content ?? '',
    textareaRef,
    onChange: updateContent,
    listAll: outlineOpen, // the Suggestions tab and its count
  })

  const { icon: appIcon, setIcon: setAppIcon } = useAppIcon(theme)
  // Info pages: About (#about) and the Smart Assist technical docs (#smart-assist).
  const [infoPage, setInfoPage] = useState<InfoPage | null>(pageFromHash)
  const [cameFrom, setCameFrom] = useState<CameFrom>(() => {
    const st = navState()
    if (st) return st.from // a reload keeps history.state, so Back still knows where it goes
    window.history.replaceState({ ms: 1, from: null } satisfies NavState, '')
    return null
  })
  const [aboutClosing, setAboutClosing] = useState(false)
  const infoRef = useRef(infoPage)
  infoRef.current = infoPage
  const aboutTimer = useRef<number | null>(null)
  const showAbout = infoPage !== null
  // Play the current page's exit animation, then show `next` (or nothing) with where it was opened from. The
  // Back label changes with the page, not before: the leaving page used to flash the next one's label ("Marksage")
  // during its exit.
  const goToInfo = useCallback((next: InfoPage | null, from: CameFrom) => {
    if (infoRef.current === next) return setCameFrom(from)
    if (infoRef.current === null) {
      setCameFrom(from)
      setInfoPage(next)
      return
    }
    if (aboutTimer.current) window.clearTimeout(aboutTimer.current)
    setAboutClosing(true)
    aboutTimer.current = window.setTimeout(() => {
      aboutTimer.current = null
      setAboutClosing(false)
      setCameFrom(from)
      setInfoPage(next)
    }, EXIT_MS)
  }, [])
  useEffect(() => {
    const onHash = () => {
      // A new entry (a button, a link between the docs, the address bar): remember where it was opened from.
      if (!navState()) window.history.replaceState({ ms: 1, from: infoRef.current ?? 'app' } satisfies NavState, '')
      goToInfo(pageFromHash(), navState()?.from ?? null)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [goToInfo])
  const openAbout = useCallback(() => {
    window.location.hash = 'about'
  }, [])
  const openPrivacy = useCallback(() => {
    window.location.hash = 'privacy' // About, scrolled to "Privacy & storage"
  }, [])
  const openDocs = useCallback(() => {
    window.location.hash = 'smart-assist'
  }, [])
  const openModelsDocs = useCallback(() => {
    window.location.hash = 'models'
  }, [])
  const openStory = useCallback(() => {
    window.location.hash = 'story'
  }, [])
  const closeAbout = useCallback(() => {
    // Opened from inside the app → the previous screen, exactly like the browser's Back.
    if (navState()?.from) {
      window.history.back()
      return
    }
    // A direct link: the docs pages → About, About → the app (replacing this entry, not adding one).
    const parent: InfoPage | null = infoRef.current === 'about' ? null : 'about'
    const url = window.location.pathname + window.location.search + (parent ? '#about' : '')
    window.history.replaceState({ ms: 1, from: null } satisfies NavState, '', url)
    goToInfo(parent, null)
  }, [goToInfo])
  // The Back label names where Back goes.
  const backLabel =
    cameFrom === 'docs' ? t('docs.backToDocs') : cameFrom === 'models' ? t('docs.backToModels') : cameFrom === 'story' ? t('story.back') : cameFrom === 'app' && infoPage !== 'about' ? t('app.name') : t('docs.backToAbout')

  // The docs page + its language's content, lazily. A failed download (slow or dropped connection, an old tab
  // after a deploy) shows Try again, which reloads the page: browsers remember a failed module download, so
  // importing it again in place would fail again. Nothing is lost — the document is saved on the way out.
  const TechDocs = useMemo(
    () =>
      lazy(async () => {
        const [{ TechDocsPage }, content] = await loadDocsPage(lang)
        const Page = (props: Omit<TechDocsPageProps, 'content'>) => <TechDocsPage {...props} content={content.default} />
        return { default: Page }
      }),
    [lang],
  )
  const retryDocs = useCallback(() => window.location.reload(), [])
  // The story page (#story) + its language's content, lazily, the same way.
  const Story = useMemo(
    () =>
      lazy(async () => {
        const [{ StoryPage }, content] = await loadStoryPage(lang)
        const Page = (props: Omit<StoryPageProps, 'content'>) => <StoryPage {...props} content={content.default} />
        return { default: Page }
      }),
    [lang],
  )
  // While About is open, fetch the docs page in the background (unless the user asked to save data), so
  // "How it works" is usually ready before the click.
  useEffect(() => {
    if (infoPage !== 'about') return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = idle(() => void loadDocsPage(lang).catch(() => {}))
    return () => cancel(id)
  }, [infoPage, lang])
  // Logo / app name: leave About or the docs straight back to the app — the open document,
  // or the start screen when there is none. Already there → nothing to do.
  const goHome = useCallback(() => {
    if (infoRef.current === null) return
    window.history.replaceState({ ms: 1, from: null } satisfies NavState, '', window.location.pathname + window.location.search)
    goToInfo(null, null)
  }, [goToInfo])

  // Editor enter/exit: the pane slides in from the right, and back out on close.
  const [editorClosing, setEditorClosing] = useState(false)
  const editorTimer = useRef<number | null>(null)
  const readOnly = !!document?.readOnly
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

  const [outlineClosing, setOutlineClosing] = useState(false)
  const outlineTimer = useRef<number | null>(null)
  const closeOutline = useCallback(() => {
    if (outlineTimer.current) return
    setOutlineClosing(true)
    outlineTimer.current = window.setTimeout(() => {
      outlineTimer.current = null
      setOutlineClosing(false)
      setOutlineOpen(false)
    }, EXIT_MS)
    if (isDesktop) saveOutlineOpen(false)
  }, [isDesktop])
  const toggleOutline = useCallback(() => {
    if (outlineOpen && !outlineClosing) return closeOutline()
    if (outlineTimer.current) window.clearTimeout(outlineTimer.current)
    outlineTimer.current = null
    setOutlineClosing(false)
    setOutlineOpen(true)
    if (isDesktop) saveOutlineOpen(true)
  }, [outlineOpen, outlineClosing, closeOutline, isDesktop])

  const handleAssistModeChange = useCallback((mode: AssistMode) => {
    setAssistMode(mode)
    saveAssistMode(mode)
  }, [])

  // "Show where" on the suggestion bar: bring its spot into view (the caret stays, so the suggestion does too)
  // and flash the matching block in the split view's preview.
  const locateSuggestion = useCallback((s: Suggestion) => {
    const ta = textareaRef.current
    if (!ta) return
    const line = ta.value.slice(0, s.edit.from).split('\n').length - 1
    const tops = editorLineTops(ta)
    const y = tops[line] ?? 0
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - 80)
      ta.scrollTo({ top: Math.max(0, y - ta.clientHeight / 3), behavior: smooth ? 'smooth' : 'auto' })
    const block = previewPaneRef.current && elementForLine(previewPaneRef.current, line)
    if (block) {
      block.classList.remove('suggest-flash')
      void block.offsetWidth // restart the animation
      block.classList.add('suggest-flash')
      window.setTimeout(() => block.classList.remove('suggest-flash'), 2200)
    }
  }, [])

  const editor = document && (
    <MarkdownEditor
      value={document.content}
      onChange={updateContent}
      textareaRef={textareaRef}
      placeholder={pasteHint ? t(isTouch ? 'editor.pasteHereTouch' : 'editor.pasteHere', { keys: shortcut(['mod', 'v'], keyStyle) }) : undefined}
      {...(assist.enabled ? assist.handlers : {})}
      overlayActive={assist.enabled && !!assist.suggestion}
    >
      <Presence
        show={assist.enabled && !!assist.suggestion}
        enter=""
        exit="anim-slide-down"
        duration={160}
        className="pointer-events-none absolute inset-x-3 bottom-3 z-10"
      >
        {assist.enabled && assist.suggestion && (
          <SuggestionBar key={assist.suggestion.key} suggestion={assist.suggestion} onAccept={assist.accept} onDismiss={assist.dismiss} onLocate={locateSuggestion} />
        )}
      </Presence>
    </MarkdownEditor>
  )

  // Opening or creating a document always lands in the app — never behind About / the docs.
  const showResult = useCallback(
    (created: boolean) => {
      if (!created) return
      goHome()
      setViewMode(isDesktop ? 'preview' : 'edit')
    },
    [isDesktop, goHome],
  )

  const handleImport = useCallback(() => {
    openFilePicker(async (file) => {
      showResult(await openFile(file))
    })
  }, [openFile, showResult])

  const handleNew = useCallback(() => {
    newDocument()
    goHome()
    setViewMode('edit')
    setPasteHint(false)
  }, [newDocument, goHome])

  // Empty clipboard → the start screen says so. Clipboard not readable (permission, Firefox, some phones) →
  // a new document to paste into, instead of a dead end.
  const handlePasteFromClipboard = useCallback(async (): Promise<'ok' | 'empty' | 'blocked'> => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      handleNew()
      setPasteHint(true)
      return 'blocked'
    }
    if (!text.trim()) return 'empty'
    pasteText(text)
    showResult(true)
    return 'ok'
  }, [pasteText, showResult, handleNew])
  useEffect(() => {
    if (pasteHint && document?.content) setPasteHint(false)
  }, [pasteHint, document?.content])

  // No "discard?" prompts: the current document is kept in Recent before switching.
  const handleOpenHistory = useCallback(
    (entry: Parameters<typeof openFromHistory>[0]) => {
      openFromHistory(entry)
      goHome()
      setViewMode(isDesktop ? 'preview' : 'edit')
    },
    [openFromHistory, goHome, isDesktop],
  )

  const handleRemoveModel = useCallback(async () => {
    await deleteDownloadedModel()
    saveModelNoticeSeen(false) // picking it again shows the download notice again
    if (assistMode === 'model') handleAssistModeChange('heuristics')
  }, [assistMode, handleAssistModeChange])

  const handleDeleteAllData = useCallback(async () => {
    await deleteAllLocalData()
    window.location.replace(window.location.pathname + window.location.search) // fresh start, no #about
  }, [])

  const handleTrySmartAssist = useCallback(() => {
    pasteText(getSampleDocument(lang), getSampleFilename(lang))
    handleAssistModeChange(assistMode === 'off' ? 'heuristics' : assistMode)
    goHome()
    setViewMode('edit')
  }, [lang, pasteText, handleAssistModeChange, assistMode, goHome])

  // Export: a named download (the Export panel, or ⌘/Ctrl + S); the name also becomes the document's name.
  const [exportOpen, setExportOpen] = useState(false)
  const handleExport = useCallback(
    (name: string) => {
      if (!document) return
      if (name !== document.filename) renameDocument(name)
      downloadMarkdown(name, document.content)
      markSaved()
    },
    [document, renameDocument, markSaved],
  )
  const exportName = document ? (document.filename ?? suggestFilename(document.content)) : 'document.md'

  const handleCopy = useCallback(async () => {
    if (!document) return
    const ok = await copyTextToClipboard(document.content)
    if (ok) {
      setCopied(true)
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } else {
      setError('error.copyFailed')
    }
  }, [document, setError])

  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current)
    },
    [],
  )

  // Small screens start in the editor.
  const checkedInitialMode = useRef(false)
  useEffect(() => {
    if (checkedInitialMode.current) return
    checkedInitialMode.current = true
    if (!isDesktop && document) setViewMode('edit')
  }, [isDesktop, document])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const key = e.key.toLowerCase()
      if (key === 'o') {
        e.preventDefault()
        handleImport()
      } else if (key === 's') {
        e.preventDefault()
        // Opens the Export panel; inside it, ⌘/Ctrl + S again downloads (ExportMenu). Not on About / the docs.
        if (document && !exportOpen && !showAbout) setExportOpen(true)
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        handleNew()
      } else if (key === 'c' && e.shiftKey && !showAbout) {
        e.preventDefault()
        handleCopy()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleImport, document, exportOpen, showAbout, handleNew, handleCopy])

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

  const handleChangeSplitRatio = useCallback((ratio: number) => {
    setSplitRatio(ratio)
    saveSplitRatio(ratio)
  }, [])

  // The preview follows the text at low priority: keystrokes paint first, the preview catches up when idle
  // (long documents render in pieces React can pause between — see lib/chunks.ts).
  const previewContent = useDeferredValue(document?.content ?? '')
  // Counted on the deferred text too: on a long document a full count every keystroke is noticeable.
  const wordCount = useMemo(() => countWords(previewContent), [previewContent])
  const lineCount = useMemo(() => countLines(previewContent), [previewContent])
  const byteCount = useMemo(() => utf8Bytes(previewContent), [previewContent])
  // Images from other websites: not loaded unless the reader allows it (About → Privacy & storage, launch QA #11).
  const [remoteImages, setRemoteImages] = useState(loadRemoteImages)
  const changeRemoteImages = useCallback((on: boolean) => {
    setRemoteImages(on)
    saveRemoteImages(on)
  }, [])
  const blockedImages = useMemo(() => (remoteImages ? 0 : countRemoteImages(previewContent)), [remoteImages, previewContent])
  const remoteBar =
    blockedImages > 0 ? (
      <div role="note" className="anim-fade mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-[868px] flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface-soft px-3 py-2 text-xs text-ink-muted sm:w-[calc(100%-3rem)] dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted">
        <ImageOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{blockedImages === 1 ? t('remote.bar.one') : t('remote.bar.many', { n: blockedImages })}</span>
        <button type="button" onClick={openPrivacy} className="font-medium text-accent hover:underline dark:text-dark-accent">
          {t('remote.bar.settings')}
        </button>
      </div>
    ) : null
  // Big documents: over 5 M characters read-only, from 1 M a note that editing may be slow (dismissible per document).
  const [slowNoteHidden, setSlowNoteHidden] = useState<string | null>(null)
  const docChars = document?.content.length ?? 0
  const sizeLabel = `${(docChars / 1_000_000).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`
  const sizeName = document?.filename ?? t('doc.untitled')
  const sizeBar = !document ? null : readOnly ? (
    <div role="note" className="anim-fade mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-[868px] items-center gap-2 rounded-md border border-line bg-surface-soft px-3 py-2 text-xs text-ink-muted sm:w-[calc(100%-3rem)] dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted">
      <Lock aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{t('large.readOnly', { name: sizeName, size: sizeLabel })}</span>
    </div>
  ) : docChars > LARGE_DOC_CHARS && slowNoteHidden !== document.id ? (
    <div role="note" className="anim-fade mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-[868px] items-center gap-2 rounded-md border border-line bg-surface-soft px-3 py-2 text-xs text-ink-muted sm:w-[calc(100%-3rem)] dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted">
      <Gauge aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{t('large.slow', { name: sizeName, size: sizeLabel })}</span>
      <button type="button" onClick={() => setSlowNoteHidden(document.id)} aria-label={t('large.dismiss')} title={t('large.dismiss')} className="-m-1 inline-flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null
  const hasDocument = document !== null
  const editing = hasDocument && viewMode === 'edit'
  // Split view: preview and editor scroll together (desktop only).
  useScrollSync(previewPaneRef, textareaRef, editing && isDesktop && !showAbout)
  const previewScrollRef = useRef<HTMLElement>(null)
  const outlineShown = outlineOpen && hasDocument && !showAbout
  // Built with the panel closed too — the document bar shows the type the Document tab gives. The section model is
  // still fetched only once the panel opens.
  const outline = useOutline(document?.content ?? '', hasDocument && !showAbout, assistMode === 'model', outlineShown)
  const docKind = useDocKind(outline.text, outline.items, document?.filename ?? null, document?.id ?? '')
  // The preview on screen: the left pane in split view, the page in preview mode, none in the mobile editor.
  const visiblePreview = editing ? (isDesktop ? previewPaneRef : nullRef) : previewScrollRef
  const outlineNav = useOutlineNav(
    visiblePreview,
    textareaRef,
    outline.items.map((i) => i.line),
    outlineShown,
    `${editing ? 'edit' : 'preview'}|${isDesktop}|${document?.id ?? ''}`,
  )
  // Suggestions tab → the editor: open it if needed, put the caret on the spot, and show that suggestion there.
  const pickSuggestion = useCallback(
    (s: Suggestion) => {
      if (!isDesktop) closeOutline()
      if (viewMode !== 'edit') changeViewMode('edit')
      let tries = 0
      const go = () => {
        const ta = textareaRef.current
        if (!ta) {
          if (++tries < 30) requestAnimationFrame(go)
          return
        }
        const caret = s.edit.from
        const line = ta.value.slice(0, caret).split('\n').length - 1
        const top = editorLineTops(ta)[line] ?? 0
        ta.scrollTo({ top: Math.max(0, top - ta.clientHeight / 3) })
        ta.focus({ preventScroll: true })
        ta.setSelectionRange(caret, caret)
        if (assist.enabled) assist.show(s, caret)
      }
      requestAnimationFrame(go)
    },
    [isDesktop, closeOutline, viewMode, changeViewMode, assist],
  )

  // Read-first: opened and pasted files show the preview. Typing there switches to the editor and keeps the
  // keystroke — at the end of the block last clicked in the preview, else of the first block in view (launch QA
  // #8: testers typed into the preview and nothing happened). Space still scrolls; shortcuts and menus are untouched.
  const lastPreviewLine = useRef<number | null>(null)
  useEffect(() => {
    if (!document || document.readOnly || viewMode !== 'preview' || showAbout) return
    lastPreviewLine.current = null
    const main = previewScrollRef.current
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
  }, [document, viewMode, showAbout, changeViewMode, updateContent])
  const suggestionsTab = {
    items: assist.all,
    capped: assist.allCapped,
    enabled: assist.enabled,
    text: document?.content ?? '',
    onPick: pickSuggestion,
  }
  const selectSection = useCallback(
    (line: number) => {
      outlineNav.goTo(line)
      if (!isDesktop) closeOutline()
    },
    [outlineNav, isDesktop, closeOutline],
  )
  // The type in the document bar → the panel's Document tab, which says why.
  const showDocumentTab = useCallback(() => {
    setPanelTab('document')
    if (!outlineOpen || outlineClosing) toggleOutline()
  }, [outlineOpen, outlineClosing, toggleOutline])
  const docBar = document && (
    <DocBar
      className="pt-5 sm:pt-6"
      kind={docKind}
      name={document.filename ?? t('doc.untitled')}
      onShowDocument={showDocumentTab}
      copied={copied}
      onCopy={handleCopy}
      copyTitle={t('action.copyTitle', { keys: shortcut(['mod', 'shift', 'c'], keyStyle) })}
      outlineOpen={outlineShown && !outlineClosing}
      onToggleOutline={toggleOutline}
    />
  )
  // Previous screen — lets the preview skip its fade when it's revealed by the editor closing.
  const view = showAbout ? 'about' : !hasDocument ? 'empty' : editing ? 'edit' : 'preview'
  const prevView = useRef(view)
  const currentView = useRef(view)
  if (currentView.current !== view) {
    prevView.current = currentView.current
    currentView.current = view
  }

  return (
    <div
      className="flex h-dvh flex-col overflow-clip bg-surface text-ink dark:bg-dark-surface dark:text-dark-ink"
    >
      <Header
        hasDocument={hasDocument}
        filename={document?.filename ?? null}
        isDirty={isDirty}
        viewMode={editorClosing ? 'preview' : viewMode}
        onViewModeChange={changeViewMode}
        onNew={handleNew}
        onOpen={handleImport}
        onCopy={handleCopy}
        copied={copied}
        exportOpen={exportOpen && hasDocument}
        onExportOpenChange={setExportOpen}
        exportName={exportName}
        onExport={handleExport}
        onRename={renameDocument}
        theme={theme}
        onToggleTheme={toggleTheme}
        isDesktop={isDesktop}
        assistMode={assistMode}
        assistStatus={assist.status}
        onAssistRetry={assist.retry}
        onAssistModeChange={handleAssistModeChange}
        onAbout={openAbout}
        onHome={goHome}
        appIconSrc={appIconUrl(appIcon, theme)}
        history={recent}
        currentDocId={document?.id}
        onOpenHistory={handleOpenHistory}
        onRemoveHistory={removeFromHistory}
        onClearHistory={clearHistory}
        showingAbout={showAbout}
        docsPage={infoPage === 'docs' || infoPage === 'models'}
        readOnly={readOnly}
        outlineOpen={outlineShown && !outlineClosing}
        onToggleOutline={toggleOutline}
      />

      <Presence show={isDragging} duration={160} className="pointer-events-none fixed inset-0 z-50">
        <div className="flex h-full items-center justify-center bg-accent/10 backdrop-blur-[1px] dark:bg-dark-accent/10">
          <div className="anim-pop rounded-xl border-2 border-dashed border-accent bg-surface px-10 py-6 text-sm font-medium text-accent dark:border-dark-accent dark:bg-dark-surface dark:text-dark-accent">
            {t('shell.dropToOpen')}
          </div>
        </div>
      </Presence>

      {infoPage === 'docs' || infoPage === 'models' ? (
        <PageLoadBoundary key={infoPage} onRetry={retryDocs} onBack={closeAbout} backLabel={backLabel}>
          <Suspense fallback={<PageLoading />}>
            <TechDocs
              key={infoPage}
              page={infoPage === 'models' ? 'models' : 'smart-assist'}
              closing={aboutClosing}
              onBack={closeAbout}
              backLabel={backLabel}
              isDesktop={isDesktop}
              useModel={assistMode === 'model'}
            />
          </Suspense>
        </PageLoadBoundary>
      ) : infoPage === 'story' ? (
        <PageLoadBoundary key="story" onRetry={retryDocs} onBack={closeAbout} backLabel={backLabel}>
          <Suspense fallback={<PageLoading />}>
            <Story closing={aboutClosing} onBack={closeAbout} backLabel={backLabel} />
          </Suspense>
        </PageLoadBoundary>
      ) : showAbout ? (
        <AboutPage
          key="about"
          onOpenDocs={openDocs}
          onOpenModelsDocs={openModelsDocs}
          onOpenStory={openStory}
          closing={aboutClosing}
          onBack={closeAbout}
          onTrySmartAssist={handleTrySmartAssist}
          appIcon={appIcon}
          onAppIconChange={setAppIcon}
          onRemoveModel={handleRemoveModel}
          onDeleteAllData={handleDeleteAllData}
          remoteImages={remoteImages}
          onRemoteImagesChange={changeRemoteImages}
          theme={theme}
        />
      ) : !document ? (
        <EmptyState
          isDragging={isDragging}
          onOpenFile={handleImport}
          onPaste={handlePasteFromClipboard}
          onNew={handleNew}
          isTouch={isTouch}
          onPrivacy={openPrivacy}
          history={recent}
          onOpenHistory={handleOpenHistory}
          onRemoveHistory={removeFromHistory}
          onClearHistory={clearHistory}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          {outlineShown && isDesktop && (
            <OutlinePanel
              variant="side"
              items={outline.items}
              status={outline.status}
              activeLine={outlineNav.activeLine}
              onSelect={selectSection}
              onHover={outlineNav.hover}
              onClose={closeOutline}
              closing={outlineClosing}
              tab={panelTab}
              onTabChange={setPanelTab}
              text={outline.text}
              filename={document.filename}
              suggestions={suggestionsTab}
            />
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {editing ? (
              isDesktop ? (
                <SplitPanes
                  closing={editorClosing}
                  leftRef={previewPaneRef}
                  animateWidth={document.content.length < 40_000}
                  ratio={splitRatio}
                  onRatioChange={handleChangeSplitRatio}
                  left={
                    <main>
                      {docBar}
                      {sizeBar}
                      {remoteBar}
                      <MarkdownPreview content={previewContent} readability={assist.readability} emptyHint={pasteHint ? t(isTouch ? 'editor.pasteHereTouch' : 'editor.pasteHere', { keys: shortcut(['mod', 'v'], keyStyle) }) : t('preview.empty')} remoteImages={remoteImages} />
                      <ScrollJump />
                    </main>
                  }
                  right={
                    <main className="h-full">
                      {editor}
                    </main>
                  }
                />
              ) : (
                <>
                  <main className={`min-h-0 flex-1 ${editorClosing ? 'anim-slide-out-right' : 'anim-slide-in-right'}`}>
                    {editor}
                  </main>
                  <div className="shrink-0 border-t border-line bg-surface p-3 dark:border-dark-line dark:bg-dark-surface">
                    <button
                      type="button"
                      onClick={() => changeViewMode('preview')}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
                    >
                      <Eye className="h-4 w-4" />
                      {t('action.preview')}
                    </button>
                  </div>
                </>
              )
            ) : (
              <main ref={previewScrollRef} key="preview" className={`scroll-area flex min-h-0 flex-1 flex-col overflow-y-auto ${prevView.current === 'edit' ? '' : 'anim-fade'}`}>
                {docBar}
                {sizeBar}
                {remoteBar}
                <MarkdownPreview content={previewContent} readability={assist.readability} remoteImages={remoteImages} emptyHint={readOnly ? undefined : t('preview.emptyDoc')} />
                <ScrollJump />
              </main>
            )}
          </div>
        </div>
      )}

      {outlineShown && !isDesktop && (
        <OutlinePanel
          variant="sheet"
          items={outline.items}
          status={outline.status}
          activeLine={outlineNav.activeLine}
          onSelect={selectSection}
          onHover={outlineNav.hover}
          onClose={closeOutline}
          closing={outlineClosing}
          tab={panelTab}
          onTabChange={setPanelTab}
          text={outline.text}
          filename={document?.filename ?? null}
          suggestions={suggestionsTab}
        />
      )}

      {document && !showAbout && (
        <footer className="anim-fade flex min-h-8 shrink-0 pb-[env(safe-area-inset-bottom)] items-center justify-center gap-4 border-t border-line bg-surface text-xs text-ink-muted dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted">
          <span>{t(lineCount === 1 ? 'shell.lines.one' : 'shell.lines', { n: lineCount.toLocaleString(lang) })}</span>
          <span>{t(wordCount === 1 ? 'shell.words.one' : 'shell.words', { n: wordCount.toLocaleString(lang) })}</span>
          <span className="hidden sm:inline">{t(document.content.length === 1 ? 'shell.characters.one' : 'shell.characters', { n: document.content.length.toLocaleString(lang) })}</span>
          <span title={t('shell.sizeTitle')}>{formatBytes(byteCount, lang)}</span>
        </footer>
      )}

      {/* Another tab saved this document while this one had its own changes (launch QA #14). */}
      <Presence show={conflict && !showAbout} enter="anim-menu-in" exit="anim-menu-out" duration={140} className="fixed inset-x-3 top-[3.75rem] z-40 mx-auto max-w-md origin-top">
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/50 bg-surface px-3 py-2.5 text-sm shadow-lg dark:bg-dark-surface-soft">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1 text-ink dark:text-dark-ink">{t('conflict.text')}</span>
          <span className="flex shrink-0 gap-2">
            <button type="button" onClick={() => resolveConflict(false)} className="press inline-flex min-h-9 items-center rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong">
              {t('conflict.useOther')}
            </button>
            <button type="button" onClick={() => resolveConflict(true)} className="inline-flex min-h-9 items-center rounded-md border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent">
              {t('conflict.keepMine')}
            </button>
          </span>
        </div>
      </Presence>

      <Presence show={!!notice && !error} enter="" exit="anim-slide-down" duration={160} className="fixed bottom-4 right-4 z-50">
        {notice && (
          <div role="status" className="anim-slide-up flex max-w-sm items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink shadow-lg dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label={t('shell.dismiss')} className="text-ink-muted transition-colors hover:text-ink dark:text-dark-ink-muted dark:hover:text-dark-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </Presence>

      <Presence show={!!error} enter="" exit="anim-slide-down" duration={160} className="fixed bottom-4 right-4 z-50">
        {error && (
        <div
          role="alert"
          className="anim-slide-up flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{t(error)}</span>
          <button
            type="button"
            onClick={clearError}
            aria-label={t('shell.dismissError')}
            className="text-red-500 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        )}
      </Presence>
    </div>
  )
}
