import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Eye, X } from 'lucide-react'
import { Header } from './components/Header'
import { EmptyState } from './components/EmptyState'
import { MarkdownPreview } from './components/MarkdownPreview'
import { MarkdownEditor } from './components/MarkdownEditor'
import { SplitPanes } from './components/SplitPanes'
import { useMarkdownFile } from './hooks/useMarkdownFile'
import { useTheme } from './hooks/useTheme'
import { useMediaQuery } from './hooks/useMediaQuery'
import {
  copyTextToClipboard,
  downloadMarkdown,
  fallbackFilename,
  openFilePicker,
} from './lib/file'
import { deleteAllLocalData, loadAssistMode, loadSplitRatio, saveAssistMode, saveModelNoticeSeen, saveSplitRatio } from './lib/storage'
import { deleteDownloadedModel } from './assist/modelEngine'
import { AboutPage } from './components/AboutPage'
import { TechDocsPage } from './components/TechDocsPage'
import { getSampleDocument } from './lib/sampleDocument'
import { useI18n } from './hooks/useI18n'
import { Presence } from './components/motion'
import { SuggestionBar } from './components/SuggestionBar'
import { useAppIcon } from './hooks/useAppIcon'
import { appIconUrl } from './lib/appIcons'
import { useScrollSync } from './hooks/useScrollSync'
import { useSmartAssist } from './assist/useSmartAssist'
import type { AssistMode } from './assist/types'
import type { ViewMode } from './lib/viewMode'

const EXIT_MS = 220

type InfoPage = 'about' | 'docs'
function pageFromHash(): InfoPage | null {
  const h = window.location.hash
  return h === '#about' ? 'about' : h === '#smart-assist' ? 'docs' : null
}
const DESKTOP_QUERY = '(min-width: 768px)'
const COPIED_RESET_MS = 1600

function countWords(content: string): number {
  const match = content.trim().match(/\S+/g)
  return match ? match.length : 0
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export default function App() {
  const { t, lang } = useI18n()
  const {
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
    history: recent,
    openFromHistory,
    removeFromHistory,
    clearHistory,
  } = useMarkdownFile()
  const { theme, toggleTheme } = useTheme()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio)
  const copiedTimer = useRef<number | null>(null)
  const [assistMode, setAssistMode] = useState<AssistMode>(loadAssistMode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const assist = useSmartAssist({
    mode: assistMode,
    text: document?.content ?? '',
    textareaRef,
    onChange: updateContent,
  })

  const { icon: appIcon, setIcon: setAppIcon } = useAppIcon(theme)
  // Info pages: About (#about) and the Smart Assist technical docs (#smart-assist).
  const [infoPage, setInfoPage] = useState<InfoPage | null>(pageFromHash)
  const [aboutClosing, setAboutClosing] = useState(false)
  const infoRef = useRef(infoPage)
  infoRef.current = infoPage
  const aboutTimer = useRef<number | null>(null)
  const showAbout = infoPage !== null
  // Play the current page's exit animation, then show `next` (or nothing).
  const goToInfo = useCallback((next: InfoPage | null) => {
    if (infoRef.current === next) return
    if (infoRef.current === null) {
      setInfoPage(next)
      return
    }
    if (aboutTimer.current) window.clearTimeout(aboutTimer.current)
    setAboutClosing(true)
    aboutTimer.current = window.setTimeout(() => {
      aboutTimer.current = null
      setAboutClosing(false)
      setInfoPage(next)
    }, EXIT_MS)
  }, [])
  useEffect(() => {
    const onHash = () => goToInfo(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [goToInfo])
  const openAbout = useCallback(() => {
    window.location.hash = 'about'
  }, [])
  const openDocs = useCallback(() => {
    window.location.hash = 'smart-assist'
  }, [])
  const closeAbout = useCallback(() => {
    // Docs → back to About; About → back to the app.
    if (infoRef.current === 'docs') {
      window.location.hash = 'about'
      return
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    goToInfo(null)
  }, [goToInfo])
  // Logo / app name: leave About or the docs straight back to the app — the open document,
  // or the start screen when there is none. Already there → nothing to do.
  const goHome = useCallback(() => {
    if (infoRef.current === null) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    goToInfo(null)
  }, [goToInfo])

  // Editor enter/exit: the pane slides in from the right, and back out on close.
  const [editorClosing, setEditorClosing] = useState(false)
  const editorTimer = useRef<number | null>(null)
  const changeViewMode = useCallback(
    (mode: ViewMode) => {
      if (mode === 'edit') {
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

  const handleAssistModeChange = useCallback((mode: AssistMode) => {
    setAssistMode(mode)
    saveAssistMode(mode)
  }, [])

  const editor = document && (
    <MarkdownEditor
      value={document.content}
      onChange={updateContent}
      textareaRef={textareaRef}
      {...(assist.enabled ? assist.handlers : {})}
    >
      <Presence
        show={assist.enabled && !!assist.suggestion}
        enter=""
        exit="anim-slide-down"
        duration={160}
        className="pointer-events-none absolute inset-x-3 bottom-3 z-10"
      >
        {assist.enabled && assist.suggestion && (
          <SuggestionBar key={assist.suggestion.key} suggestion={assist.suggestion} onAccept={assist.accept} onDismiss={assist.dismiss} />
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

  const handlePasteFromClipboard = useCallback(async (): Promise<boolean> => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) return false
      pasteText(text)
      showResult(true)
      return true
    } catch {
      return false
    }
  }, [pasteText, showResult])

  // No "discard?" prompts: the current document is kept in Recent before switching.
  const handleOpenHistory = useCallback(
    (entry: Parameters<typeof openFromHistory>[0]) => {
      openFromHistory(entry)
      goHome()
      setViewMode(isDesktop ? 'preview' : 'edit')
    },
    [openFromHistory, goHome, isDesktop],
  )

  const handleNew = useCallback(() => {
    newDocument()
    goHome()
    setViewMode('edit')
  }, [newDocument, goHome])

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
    pasteText(getSampleDocument(lang))
    handleAssistModeChange(assistMode === 'off' ? 'heuristics' : assistMode)
    goHome()
    setViewMode('edit')
  }, [lang, pasteText, handleAssistModeChange, assistMode, goHome])

  const handleExport = useCallback(() => {
    if (!document) return
    downloadMarkdown(fallbackFilename(document.filename), document.content)
    markSaved()
  }, [document, markSaved])

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
        handleExport()
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        handleNew()
      } else if (key === 'c' && e.shiftKey) {
        e.preventDefault()
        handleCopy()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleImport, handleExport, handleNew, handleCopy])

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

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) {
        openFile(file).then(showResult)
      }
    }

    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [openFile, showResult])

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

  const hasDocument = document !== null
  const editing = hasDocument && viewMode === 'edit'
  // Split view: preview and editor scroll together (desktop only).
  const previewPaneRef = useRef<HTMLDivElement>(null)
  useScrollSync(previewPaneRef, textareaRef, editing && isDesktop && !showAbout)
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
        onExport={handleExport}
        theme={theme}
        onToggleTheme={toggleTheme}
        isDesktop={isDesktop}
        assistMode={assistMode}
        assistStatus={assist.status}
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
      />

      <Presence show={isDragging} duration={160} className="pointer-events-none fixed inset-0 z-50">
        <div className="flex h-full items-center justify-center bg-accent/10 backdrop-blur-[1px] dark:bg-dark-accent/10">
          <div className="anim-pop rounded-xl border-2 border-dashed border-accent bg-surface px-10 py-6 text-sm font-medium text-accent dark:border-dark-accent dark:bg-dark-surface dark:text-dark-accent">
            {t('shell.dropToOpen')}
          </div>
        </div>
      </Presence>

      {infoPage === 'docs' ? (
        <TechDocsPage key="docs" closing={aboutClosing} onBack={closeAbout} />
      ) : showAbout ? (
        <AboutPage
          key="about"
          onOpenDocs={openDocs}
          closing={aboutClosing}
          onBack={closeAbout}
          onTrySmartAssist={handleTrySmartAssist}
          appIcon={appIcon}
          onAppIconChange={setAppIcon}
          onRemoveModel={handleRemoveModel}
          onDeleteAllData={handleDeleteAllData}
          theme={theme}
        />
      ) : !document ? (
        <EmptyState
          isDragging={isDragging}
          onOpenFile={handleImport}
          onPaste={handlePasteFromClipboard}
          history={recent}
          onOpenHistory={handleOpenHistory}
          onRemoveHistory={removeFromHistory}
          onClearHistory={clearHistory}
        />
      ) : editing ? (
        isDesktop ? (
          <SplitPanes
            closing={editorClosing}
            leftRef={previewPaneRef}
            animateWidth={document.content.length < 40_000}
            ratio={splitRatio}
            onRatioChange={handleChangeSplitRatio}
            left={
              <main>
                <MarkdownPreview content={document.content} readability={assist.readability} />
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
        <main key="preview" className={`scroll-area flex min-h-0 flex-1 flex-col overflow-y-auto ${prevView.current === 'edit' ? '' : 'anim-fade'}`}>
          <MarkdownPreview content={document.content} readability={assist.readability} />
        </main>
      )}

      {document && !showAbout && (
        <footer className="anim-fade flex min-h-8 shrink-0 pb-[env(safe-area-inset-bottom)] items-center justify-center gap-4 border-t border-line bg-surface text-xs text-ink-muted dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted">
          <span>{t('shell.words', { n: countWords(document.content).toLocaleString(lang) })}</span>
          <span>{t('shell.characters', { n: document.content.length.toLocaleString(lang) })}</span>
        </footer>
      )}

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
