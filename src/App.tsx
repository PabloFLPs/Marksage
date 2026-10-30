import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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
  openFilePicker,
  suggestFilename,
} from './lib/file'
import { deleteAllLocalData, loadAssistMode, loadOutlineOpen, loadSplitRatio, saveAssistMode, saveModelNoticeSeen, saveOutlineOpen, saveSplitRatio } from './lib/storage'
import { deleteDownloadedModel } from './assist/modelEngine'
import { AboutPage } from './components/AboutPage'
import { getSampleDocument, getSampleFilename } from './lib/sampleDocument'
import { useI18n } from './hooks/useI18n'
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
import type { AssistMode, Suggestion } from './assist/types'
import type { ViewMode } from './lib/viewMode'

import { loadDocsPage } from './lib/docsContent'
import type { TechDocsPageProps } from './components/TechDocsPage'
import { PageLoadBoundary, PageLoading } from './components/PageLoad'

const EXIT_MS = 220

type InfoPage = 'about' | 'docs' | 'models'
function pageFromHash(): InfoPage | null {
  const h = window.location.hash
  return h === '#about' || h === '#privacy' ? 'about' : h === '#smart-assist' ? 'docs' : h === '#models' ? 'models' : null
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
    renameDocument,
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
  const isTouch = useMediaQuery('(pointer: coarse)')
  // "Paste Markdown" when the browser won't let us read the clipboard: a new document whose placeholder
  // says how to paste into it (works everywhere, iOS included). Cleared once there's text, or on a plain New.
  const [pasteHint, setPasteHint] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio)
  const copiedTimer = useRef<number | null>(null)
  const [assistMode, setAssistMode] = useState<AssistMode>(loadAssistMode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null) // split view: the preview pane (scrolls with the editor)
  // Outline panel: docked on desktop (remembered), a bottom sheet on small screens (never auto-opens).
  const [outlineOpen, setOutlineOpen] = useState(() => isDesktop && loadOutlineOpen())
  const [panelTab, setPanelTab] = useState<PanelTab>('outline') // this session only
  const assist = useSmartAssist({
    mode: assistMode,
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
    const onHash = () => {
      // A new entry (a button, a link between the docs, the address bar): remember where it was opened from.
      if (!navState()) window.history.replaceState({ ms: 1, from: infoRef.current ?? 'app' } satisfies NavState, '')
      setCameFrom(navState()?.from ?? null)
      goToInfo(pageFromHash())
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
    setCameFrom(null)
    goToInfo(parent)
  }, [goToInfo])
  // The Back label names where Back goes.
  const backLabel =
    cameFrom === 'docs' ? t('docs.backToDocs') : cameFrom === 'models' ? t('docs.backToModels') : cameFrom === 'app' && infoPage !== 'about' ? t('app.name') : t('docs.backToAbout')

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
      placeholder={pasteHint ? t(isTouch ? 'editor.pasteHereTouch' : 'editor.pasteHere', { keys: 'Ctrl/Cmd + V' }) : undefined}
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

  // The preview follows the text at low priority: keystrokes paint first, the preview catches up when idle
  // (long documents render in pieces React can pause between — see lib/chunks.ts).
  const previewContent = useDeferredValue(document?.content ?? '')
  // Counted on the deferred text too: on a long document a full count every keystroke is noticeable.
  const wordCount = useMemo(() => countWords(previewContent), [previewContent])
  const hasDocument = document !== null
  const editing = hasDocument && viewMode === 'edit'
  // Split view: preview and editor scroll together (desktop only).
  useScrollSync(previewPaneRef, textareaRef, editing && isDesktop && !showAbout)
  const previewScrollRef = useRef<HTMLElement>(null)
  const outlineShown = outlineOpen && hasDocument && !showAbout
  const outline = useOutline(document?.content ?? '', outlineShown, assistMode === 'model')
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
      ) : showAbout ? (
        <AboutPage
          key="about"
          onOpenDocs={openDocs}
          onOpenModelsDocs={openModelsDocs}
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
                      <MarkdownPreview content={previewContent} readability={assist.readability} emptyHint={t('preview.empty')} />
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
                <MarkdownPreview content={previewContent} readability={assist.readability} />
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
          <span>{t('shell.words', { n: wordCount.toLocaleString(lang) })}</span>
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
