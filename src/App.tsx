import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CaseSensitive, ListOrdered, Weight, WholeWord, X } from 'lucide-react'
import { Header } from './components/Header'
import { EmptyState } from './components/EmptyState'
import { useMarkdownFile } from './hooks/useMarkdownFile'
import { useTheme } from './hooks/useTheme'
import { useMediaQuery } from './hooks/useMediaQuery'
import {
  copyTextToClipboard,
  downloadMarkdown,
  openFilePicker,
  suggestFilename,
} from './lib/file'
import { deleteAllLocalData, loadAssistMode, loadRemoteImages, loadSplitRatio, saveAssistMode, saveModelNoticeSeen, saveRemoteImages, saveSplitRatio } from './lib/storage'
import { SAMPLE_DOCUMENT, SAMPLE_DOCUMENT_PT_BR, getSampleDocument, getSampleFilename } from './lib/sampleDocument'
import { useI18n } from './hooks/useI18n'
import { CommandPalette } from './components/CommandPalette'
import { Presence } from './components/motion'
import { useAppIcon } from './hooks/useAppIcon'
import { appIconUrl } from './lib/appIcons'
import type { EngineStatus } from './assist/useSmartAssist'
import type { AssistMode } from './assist/types'
import { documentViewComponent, loadDocumentView } from './lib/documentView'
import { PageLoadBoundary, PageLoading } from './components/PageLoad'
import { countLines, countWords, formatBytes, utf8Bytes } from './lib/docStats'
import { useInfoPages } from './hooks/useInfoPages'
import { installPrintCopy, installPrintShortcut, printWhenRendered } from './lib/printCopy'
import { useViewMode } from './hooks/useViewMode'
import { useOutlinePanel } from './hooks/useOutlinePanel'
import { useGlobalInput } from './hooks/useGlobalInput'
import { usePaletteCommands } from './hooks/usePaletteCommands'

const DESKTOP_QUERY = '(min-width: 768px)'
const COPIED_RESET_MS = 1600

// About loads on demand (pre-launch review: 11 KB gzip off the script every first visit waits for) — fetched while
// the browser is idle after the first paint, so opening it stays instant.
const loadAbout = () => import('./components/AboutPage')
const AboutPage = lazy(() => loadAbout().then((m) => ({ default: m.AboutPage })))

/** The footer counts' icons: decoration only (the words say it), a shade lighter than the text. */
const FOOTER_ICON = 'h-3.5 w-3.5 shrink-0 opacity-70'

export default function App() {
  const { t, lang, setLang } = useI18n()
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
  // Chosen once: switching from the lazy wrapper to the loaded component later would remount the view.
  const [DocumentView] = useState(documentViewComponent)
  const readOnly = !!document?.readOnly
  // After the first paint: the document view at once (Save-Data too: it's what every next click needs), then About
  // once the browser is idle (not on Save-Data), so it opens instantly. In that order: on a slow connection About's
  // download used to share the bandwidth with the document a returning visitor was waiting for.
  useEffect(() => {
    let cancelled = false
    let id = 0
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    loadDocumentView()
      .catch(() => {})
      .then(() => {
        if (!cancelled && !conn?.saveData) id = idle(() => void loadAbout().catch(() => {}))
      })
    return () => {
      cancelled = true
      cancel(id)
    }
  }, [])
  const { viewMode, setViewMode, editorClosing, changeViewMode } = useViewMode({ readOnly, isDesktop, hasDocument })
  const { outlineShown, outlineClosing, closeOutline, toggleOutline, panelTab, setPanelTab, openPanelTab, toggleTab } = useOutlinePanel({ isDesktop, available: hasDocument && !showAbout })
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
  // Smart Assist runs in the document view; the header's Assist menu shows its state.
  const [assistStatus, setAssistStatus] = useState<EngineStatus>({ state: 'off' })
  const assistRetry = useRef<() => void>(() => {})
  const onAssistStatus = useCallback((status: EngineStatus, retry: () => void) => {
    setAssistStatus(status)
    assistRetry.current = retry
  }, [])
  const retryAssist = useCallback(() => assistRetry.current(), [])

  const { icon: appIcon, setIcon: setAppIcon } = useAppIcon(theme)
  const handleAssistModeChange = useCallback((mode: AssistMode) => {
    setAssistMode(mode)
    saveAssistMode(mode)
  }, [])

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
      // The current document, from About or a docs page: just go back to it, as it was left.
      if (entry.id === document?.id) {
        goHome()
        return
      }
      openFromHistory(entry)
      goHome()
      setViewMode(isDesktop ? 'preview' : 'edit')
    },
    [openFromHistory, goHome, isDesktop, setViewMode, document?.id],
  )

  const handleRemoveModel = useCallback(async () => {
    const { deleteDownloadedModel } = await import('./assist/modelEngine')
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

  // ⌘/Ctrl + P and "Save as PDF": the rendered document alone, named after it (lib/printCopy.ts). About and the docs
  // pages keep their own titles.
  const printTitle = infoPage ? null : exportName.replace(/\.[a-z]+$/i, '')
  useEffect(() => installPrintCopy(() => printTitle), [printTitle])
  useEffect(() => installPrintShortcut(() => printTitle), [printTitle])
  // Export → Save as PDF: the print dialog, under the name in the Export panel (which renames the document, like a
  // download). A phone that's editing shows the preview first, so the PDF is the rendered document.
  const handlePrintPdf = useCallback(
    (name: string) => {
      if (!document) return
      if (name !== document.filename) renameDocument(name)
      if (viewMode === 'edit' && !isDesktop) changeViewMode('preview')
      printWhenRendered(name.replace(/\.[a-z]+$/i, ''))
    },
    [document, renameDocument, viewMode, isDesktop, changeViewMode],
  )
  const printPdfFromPalette = useCallback(() => handlePrintPdf(exportName), [handlePrintPdf, exportName])

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

  // The footer's counts follow the text at low priority, like the preview: on a long document a full count every
  // keystroke is noticeable.
  const previewContent = useDeferredValue(document?.content ?? '')
  const wordCount = useMemo(() => countWords(previewContent), [previewContent])
  const lineCount = useMemo(() => countLines(previewContent), [previewContent])
  const byteCount = useMemo(() => utf8Bytes(previewContent), [previewContent])
  // Images from other websites: not loaded unless the reader allows it (About → Privacy & storage, development check #11).
  const [remoteImages, setRemoteImages] = useState(loadRemoteImages)
  const changeRemoteImages = useCallback((on: boolean) => {
    setRemoteImages(on)
    saveRemoteImages(on)
  }, [])
  const editing = hasDocument && viewMode === 'edit'
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
    onPrintPdf: printPdfFromPalette,
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
        onPrintPdf={handlePrintPdf}
        onRename={renameDocument}
        onCloseDocument={handleCloseDocument}
        theme={theme}
        onToggleTheme={toggleTheme}
        isDesktop={isDesktop}
        assistMode={assistMode}
        assistStatus={hasDocument ? assistStatus : { state: 'off' }}
        onAssistRetry={retryAssist}
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
      ) : null}

      {/* Mounted while a document is open — on About and the docs pages too, where it renders nothing — so Smart
          Assist and the Outline keep their state (dismissed suggestions, the loaded model). */}
      {document && (
        <PageLoadBoundary onRetry={retryDocs} onBack={handleCloseDocument} backLabel={t('palette.startScreen')}>
          <Suspense fallback={showAbout ? null : <PageLoading />}>
            <DocumentView
              document={document}
              visible={!showAbout}
              updateContent={updateContent}
              viewMode={viewMode}
              editorClosing={editorClosing}
              changeViewMode={changeViewMode}
              isDesktop={isDesktop}
              isTouch={isTouch}
              assistMode={assistMode}
              onAssistStatus={onAssistStatus}
              outlineShown={outlineShown}
              outlineClosing={outlineClosing}
              closeOutline={closeOutline}
              panelTab={panelTab}
              setPanelTab={setPanelTab}
              openPanelTab={openPanelTab}
              toggleTab={toggleTab}
              splitRatio={splitRatio}
              onSplitRatio={handleChangeSplitRatio}
              remoteImages={remoteImages}
              openPrivacy={openPrivacy}
              copied={copied}
              onCopy={handleCopy}
              pasteHint={pasteHint}
              skipFade={prevView.current === 'edit'}
              docBarRef={watchDocBar}
            />
          </Suspense>
        </PageLoadBoundary>
      )}

      {document && !showAbout && (
        <footer className="anim-fade flex min-h-8 shrink-0 pb-[env(safe-area-inset-bottom)] items-center justify-center gap-4 border-t border-line bg-surface text-xs text-ink-muted dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted">
          <span className="inline-flex items-center gap-1">
            <ListOrdered aria-hidden className={FOOTER_ICON} />
            {t(lineCount === 1 ? 'shell.lines.one' : 'shell.lines', { n: lineCount.toLocaleString(lang) })}
          </span>
          <span className="inline-flex items-center gap-1">
            <WholeWord aria-hidden className={FOOTER_ICON} />
            {t(wordCount === 1 ? 'shell.words.one' : 'shell.words', { n: wordCount.toLocaleString(lang) })}
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <CaseSensitive aria-hidden className={FOOTER_ICON} />
            {t(document.content.length === 1 ? 'shell.characters.one' : 'shell.characters', { n: document.content.length.toLocaleString(lang) })}
          </span>
          <span className="inline-flex items-center gap-1" title={t('shell.sizeTitle')}>
            <Weight aria-hidden className={FOOTER_ICON} />
            {formatBytes(byteCount, lang)}
          </span>
        </footer>
      )}

      {/* Another tab saved this document while this one had its own changes (development check #14). */}
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
