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
  downloadMarkdown,
  openFilePicker,
  suggestFilename,
} from './lib/file'
import { deleteAllLocalData, loadAssistMode, loadRemoteImages, loadSplitRatio, saveAssistMode, saveModelNoticeSeen, saveRemoteImages, saveSplitRatio } from './lib/storage'
import { deleteDownloadedModel } from './assist/modelEngine'
import { SAMPLE_DOCUMENT, SAMPLE_DOCUMENT_PT_BR, getSampleDocument, getSampleFilename } from './lib/sampleDocument'
import { useI18n } from './hooks/useI18n'
import { CommandPalette } from './components/CommandPalette'
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
import { PageLoadBoundary, PageLoading } from './components/PageLoad'
import { countLines, countWords, formatBytes, utf8Bytes } from './lib/docStats'
import { useInfoPages } from './hooks/useInfoPages'
import { useViewMode } from './hooks/useViewMode'
import { useOutlinePanel } from './hooks/useOutlinePanel'
import { useGlobalInput } from './hooks/useGlobalInput'
import { useTypeToEdit } from './hooks/useTypeToEdit'
import { usePaletteCommands } from './hooks/usePaletteCommands'

const DESKTOP_QUERY = '(min-width: 768px)'
const nullRef = { current: null }
const COPIED_RESET_MS = 1600

// About loads on demand (pre-launch review: 11 KB gzip off the script every first visit waits for) — fetched while
// the browser is idle after the first paint, so opening it stays instant.
const loadAbout = () => import('./components/AboutPage')
const AboutPage = lazy(() => loadAbout().then((m) => ({ default: m.AboutPage })))

const PANEL_TABS: PanelTab[] = ['outline', 'document', 'suggestions']

export default function App() {
  const { t, lang, setLang } = useI18n()
  const { keyStyle } = useKeyStyle()
  const {
    document,
    isDirty,
    openFile,
    pasteText,
    newDocument,
    renameDocument,
    updateContent,
    replaceUntouched,
    closeDocument,
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
  const { infoPage, showAbout, aboutClosing, backLabel, openAbout, openPrivacy, openDocs, openModelsDocs, openStory, closeAbout, goHome, TechDocs, Story, retryDocs } = useInfoPages()
  const hasDocument = document !== null
  const readOnly = !!document?.readOnly
  // About: fetched once the app has painted and the browser is idle (not on Save-Data), so it opens instantly.
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = idle(() => void loadAbout().catch(() => {}))
    return () => cancel(id)
  }, [])
  const { viewMode, setViewMode, editorClosing, changeViewMode } = useViewMode({ readOnly, isDesktop, hasDocument })
  const { outlineOpen, outlineShown, outlineClosing, closeOutline, toggleOutline, panelTab, setPanelTab, openPanelTab, toggleTab } = useOutlinePanel({ isDesktop, available: hasDocument && !showAbout })
  // "Paste Markdown" when the browser won't let us read the clipboard: a new document whose placeholder
  // says how to paste into it (works everywhere, iOS included). Cleared once there's text, or on a plain New.
  const [pasteHint, setPasteHint] = useState(false)
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
  const assist = useSmartAssist({
    mode: document?.readOnly ? 'off' : assistMode, // a read-only giant isn't scanned
    text: document?.content ?? '',
    textareaRef,
    onChange: updateContent,
    listAll: outlineOpen, // the Suggestions tab and its count
  })

  const { icon: appIcon, setIcon: setAppIcon } = useAppIcon(theme)
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
    [isDesktop, goHome, setViewMode],
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
  }, [newDocument, goHome, setViewMode])

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
    [openFromHistory, goHome, isDesktop, setViewMode],
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

  // Marksage's own document follows the app's language: the sample, while untouched, is swapped for the current
  // language's version — on a language switch and when it's opened from Recent. An edited sample stays as it is.
  const docId = document?.id
  const docRef = useRef(document)
  docRef.current = document
  useEffect(() => {
    const d = docRef.current
    if (!d || d.filename !== getSampleFilename()) return
    const want = getSampleDocument(lang)
    if (d.content !== want && (d.content === SAMPLE_DOCUMENT || d.content === SAMPLE_DOCUMENT_PT_BR)) replaceUntouched(want)
  }, [lang, docId, replaceUntouched])

  // Close document (✕ next to its name, the phone menu, ⌘K "Start screen"): back to the start screen; it stays in
  // Recent. From About or a docs page, the start screen too.
  const handleCloseDocument = useCallback(() => {
    setExportOpen(false)
    closeDocument()
    goHome()
  }, [closeDocument, goHome])

  const handleTrySmartAssist = useCallback(() => {
    pasteText(getSampleDocument(lang), getSampleFilename())
    handleAssistModeChange(assistMode === 'off' ? 'heuristics' : assistMode)
    goHome()
    setViewMode('edit')
  }, [lang, pasteText, handleAssistModeChange, assistMode, goHome, setViewMode])

  // Export: a named download (the Export panel, or ⌘/Ctrl + S); the name also becomes the document's name.
  const [exportOpen, setExportOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The palette's "Rules + AI" before the download notice was seen: the Assist menu opens on the notice instead.
  const [assistNoticeRequest, setAssistNoticeRequest] = useState(0)
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

  const openExport = useCallback(() => setExportOpen(true), [])
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), [])
  const pasteFromPalette = useCallback(() => void handlePasteFromClipboard(), [handlePasteFromClipboard])
  const requestAssistNotice = useCallback(() => setAssistNoticeRequest((n) => n + 1), [])
  const { isDragging } = useGlobalInput({
    hasDocument,
    showAbout,
    exportOpen,
    openExport,
    togglePalette,
    onImport: handleImport,
    onCopy: handleCopy,
    closeAbout,
    openFile,
    pasteText,
    showResult,
    showNotice,
    t,
  })

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
  const editing = hasDocument && viewMode === 'edit'
  // Split view: preview and editor scroll together (desktop only).
  useScrollSync(previewPaneRef, textareaRef, editing && isDesktop && !showAbout)
  const previewScrollRef = useRef<HTMLElement>(null)
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

  useTypeToEdit({ document, viewMode, showAbout, previewRef: previewScrollRef, textareaRef, changeViewMode, updateContent })
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
  // While the document bar is on screen (the top of the preview), the header's Outline button would repeat its tab
  // icons, so it steps aside; scrolled past the bar, it comes back.
  const [docBarInView, setDocBarInView] = useState(false)
  const docBarObserver = useRef<IntersectionObserver | null>(null)
  const watchDocBar = useCallback((el: HTMLDivElement | null) => {
    docBarObserver.current?.disconnect()
    docBarObserver.current = null
    if (!el) return setDocBarInView(false)
    const io = new IntersectionObserver(([entry]) => setDocBarInView(entry.isIntersecting))
    io.observe(el)
    docBarObserver.current = io
  }, [])
  const docBar = document && (
    <div ref={watchDocBar}>
      <DocBar
        className="pt-5 sm:pt-6"
        kind={docKind}
        name={document.filename ?? t('doc.untitled')}
        copied={copied}
        onCopy={handleCopy}
        copyTitle={t('action.copyTitle', { keys: shortcut(['mod', 'shift', 'c'], keyStyle) })}
        tabs={PANEL_TABS}
        openTab={openPanelTab}
        onTab={toggleTab}
        pending={assist.enabled ? assist.all.length : 0}
      />
    </div>
  )
  const commands = usePaletteCommands({
    hasDocument,
    showAbout,
    readOnly,
    editing,
    isDesktop,
    outlineShown,
    theme,
    assistMode,
    recent,
    currentDocId: document?.id,
    onNew: handleNew,
    onImport: handleImport,
    onPaste: pasteFromPalette,
    onTrySample: handleTrySmartAssist,
    onExport: openExport,
    onCopy: handleCopy,
    changeViewMode,
    toggleOutline,
    toggleTheme,
    setLang,
    onAssistModeChange: handleAssistModeChange,
    requestAssistNotice,
    onCloseDocument: handleCloseDocument,
    openAbout,
    openDocs,
    openModelsDocs,
    openStory,
    openPrivacy,
    onOpenHistory: handleOpenHistory,
  })

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
        onCloseDocument={handleCloseDocument}
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
        outlineButtonHidden={docBarInView}
        assistNoticeRequest={assistNoticeRequest}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

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
        <PageLoadBoundary key="about" onRetry={retryDocs} onBack={closeAbout} backLabel={t('about.back')}>
          <Suspense fallback={<PageLoading />}>
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
          </Suspense>
        </PageLoadBoundary>
      ) : !document ? (
        <EmptyState
          isDragging={isDragging}
          onOpenFile={handleImport}
          onPaste={handlePasteFromClipboard}
          onNew={handleNew}
          isTouch={isTouch}
          onPrivacy={openPrivacy}
          onTrySample={handleTrySmartAssist}
          onStory={openStory}
          logoSrc={appIconUrl(appIcon, theme)}
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
