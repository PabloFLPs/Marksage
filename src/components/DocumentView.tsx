import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Gauge, ImageOff, Lock, X } from 'lucide-react'
import { MarkdownPreview } from './MarkdownPreview'
import { MarkdownEditor } from './MarkdownEditor'
import { SplitPanes } from './SplitPanes'
import { SuggestionBar } from './SuggestionBar'
import { ScrollJump } from './ScrollJump'
import { OutlinePanel, type PanelTab } from './OutlinePanel'
import { DocBar } from './DocBar'
import { Presence } from './motion'
import { useI18n } from '../hooks/useI18n'
import { useKeyStyle } from '../hooks/useKeyStyle'
import { useScrollSync } from '../hooks/useScrollSync'
import { elementForLine, useOutlineNav } from '../hooks/useOutlineNav'
import { useDocKind } from '../hooks/useDocKind'
import { useTypeToEdit } from '../hooks/useTypeToEdit'
import { useSmartAssist, type EngineStatus } from '../assist/useSmartAssist'
import { useOutline } from '../assist/useOutline'
import type { AssistMode, Suggestion } from '../assist/types'
import type { MarkdownDocument } from '../hooks/useMarkdownFile'
import type { ViewMode } from '../lib/viewMode'
import { LARGE_DOC_CHARS } from '../lib/file'
import { shortcut } from '../lib/keyStyle'
import { countRemoteImages } from '../lib/remoteImages'
import { editorLineTops } from '../lib/scrollSync'

const PANEL_TABS: PanelTab[] = ['outline', 'document', 'suggestions']
const nullRef = { current: null }

export interface DocumentViewProps {
  document: MarkdownDocument
  /** False on About and the docs pages: nothing rendered, but Smart Assist and the Outline keep their state. */
  visible: boolean
  updateContent: (content: string) => void
  viewMode: ViewMode
  editorClosing: boolean
  changeViewMode: (mode: ViewMode) => void
  isDesktop: boolean
  isTouch: boolean
  assistMode: AssistMode
  /** Smart Assist's state for the header's Assist menu. */
  onAssistStatus: (status: EngineStatus, retry: () => void) => void
  outlineOpen: boolean
  outlineShown: boolean
  outlineClosing: boolean
  closeOutline: () => void
  panelTab: PanelTab
  setPanelTab: (tab: PanelTab) => void
  openPanelTab: PanelTab | null
  toggleTab: (tab: PanelTab) => void
  splitRatio: number
  onSplitRatio: (ratio: number) => void
  remoteImages: boolean
  openPrivacy: () => void
  copied: boolean
  onCopy: () => void
  pasteHint: boolean
  /** The editor just closed: the preview shows without its fade. */
  skipFade: boolean
  /** The document bar's element, watched by App (while on screen, the header's Outline button steps aside). */
  docBarRef: (el: HTMLDivElement | null) => void
}

/**
 * Everything on screen while a document is open: the preview, the editor (split view on desktop), Smart Assist,
 * the Outline panel and the document bar. Its own chunk (pre-launch review, first load): the start screen doesn't
 * load the Markdown pipeline, the editor or Smart Assist — App prefetches this once the start screen is up, and an
 * inline script in index.html preloads it at once when a document is stored (vite.config.ts).
 */
export function DocumentView(p: DocumentViewProps) {
  const { document, visible, updateContent, viewMode, editorClosing, changeViewMode, isDesktop, isTouch, assistMode, onAssistStatus } = p
  const { outlineOpen, outlineShown, outlineClosing, closeOutline, panelTab, setPanelTab, openPanelTab, toggleTab } = p
  const { t, lang } = useI18n()
  const { keyStyle } = useKeyStyle()
  const readOnly = !!document.readOnly
  const editing = viewMode === 'edit'
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null) // split view: the preview pane (scrolls with the editor)
  const previewScrollRef = useRef<HTMLElement>(null)
  const assist = useSmartAssist({
    mode: readOnly ? 'off' : assistMode, // a read-only giant isn't scanned
    text: document.content,
    textareaRef,
    onChange: updateContent,
    listAll: outlineOpen, // the Suggestions tab and its count
  })
  useEffect(() => onAssistStatus(assist.status, assist.retry), [assist.status, assist.retry, onAssistStatus])

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

  const pasteHere = t(isTouch ? 'editor.pasteHereTouch' : 'editor.pasteHere', { keys: shortcut(['mod', 'v'], keyStyle) })
  const editor = (
    <MarkdownEditor
      value={document.content}
      onChange={updateContent}
      textareaRef={textareaRef}
      placeholder={p.pasteHint ? pasteHere : undefined}
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

  // The preview follows the text at low priority: keystrokes paint first, the preview catches up when idle
  // (long documents render in pieces React can pause between — see lib/chunks.ts).
  const previewContent = useDeferredValue(document.content)
  // Images from other websites: not loaded unless the reader allows it (About → Privacy & storage, launch QA #11).
  const blockedImages = useMemo(() => (p.remoteImages ? 0 : countRemoteImages(previewContent)), [p.remoteImages, previewContent])
  const remoteBar =
    blockedImages > 0 ? (
      <div role="note" className="anim-fade mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-[868px] flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface-soft px-3 py-2 text-xs text-ink-muted sm:w-[calc(100%-3rem)] dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted">
        <ImageOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{blockedImages === 1 ? t('remote.bar.one') : t('remote.bar.many', { n: blockedImages })}</span>
        <button type="button" onClick={p.openPrivacy} className="font-medium text-accent hover:underline dark:text-dark-accent">
          {t('remote.bar.settings')}
        </button>
      </div>
    ) : null
  // Big documents: over 5 M characters read-only, from 1 M a note that editing may be slow (dismissible per document).
  const [slowNoteHidden, setSlowNoteHidden] = useState<string | null>(null)
  const docChars = document.content.length
  const sizeLabel = `${(docChars / 1_000_000).toLocaleString(lang, { maximumFractionDigits: 1 })} MB`
  const sizeName = document.filename ?? t('doc.untitled')
  const sizeBar = readOnly ? (
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

  // Split view: preview and editor scroll together (desktop only).
  useScrollSync(previewPaneRef, textareaRef, editing && isDesktop && visible)
  // Built with the panel closed too — the document bar shows the type the Document tab gives. The section model is
  // still fetched only once the panel opens.
  const outline = useOutline(document.content, visible, assistMode === 'model', outlineShown)
  const docKind = useDocKind(outline.text, outline.items, document.filename ?? null, document.id)
  // The preview on screen: the left pane in split view, the page in preview mode, none in the mobile editor.
  const visiblePreview = editing ? (isDesktop ? previewPaneRef : nullRef) : previewScrollRef
  const outlineNav = useOutlineNav(
    visiblePreview,
    textareaRef,
    outline.items.map((i) => i.line),
    outlineShown,
    `${editing ? 'edit' : 'preview'}|${isDesktop}|${document.id}`,
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

  useTypeToEdit({ document, viewMode, showAbout: !visible, previewRef: previewScrollRef, textareaRef, changeViewMode, updateContent })
  const suggestionsTab = {
    items: assist.all,
    capped: assist.allCapped,
    enabled: assist.enabled,
    text: document.content,
    onPick: pickSuggestion,
  }
  const selectSection = useCallback(
    (line: number) => {
      outlineNav.goTo(line)
      if (!isDesktop) closeOutline()
    },
    [outlineNav, isDesktop, closeOutline],
  )
  const docBar = (
    <div ref={p.docBarRef}>
      <DocBar
        className="pt-5 sm:pt-6"
        kind={docKind}
        name={document.filename ?? t('doc.untitled')}
        copied={p.copied}
        onCopy={p.onCopy}
        copyTitle={t('action.copyTitle', { keys: shortcut(['mod', 'shift', 'c'], keyStyle) })}
        tabs={PANEL_TABS}
        openTab={openPanelTab}
        onTab={toggleTab}
        pending={assist.enabled ? assist.all.length : 0}
      />
    </div>
  )

  if (!visible) return null
  const panel = (variant: 'side' | 'sheet') => (
    <OutlinePanel
      variant={variant}
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
  )
  return (
    <>
      <div className="flex min-h-0 flex-1">
        {outlineShown && isDesktop && panel('side')}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {editing ? (
            isDesktop ? (
              <SplitPanes
                closing={editorClosing}
                leftRef={previewPaneRef}
                animateWidth={document.content.length < 40_000}
                ratio={p.splitRatio}
                onRatioChange={p.onSplitRatio}
                left={
                  <main>
                    {docBar}
                    {sizeBar}
                    {remoteBar}
                    <MarkdownPreview content={previewContent} readability={assist.readability} emptyHint={p.pasteHint ? pasteHere : t('preview.empty')} remoteImages={p.remoteImages} />
                    <ScrollJump />
                  </main>
                }
                right={<main className="h-full">{editor}</main>}
              />
            ) : (
              <>
                <main className={`min-h-0 flex-1 ${editorClosing ? 'anim-slide-out-right' : 'anim-slide-in-right'}`}>{editor}</main>
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
            <main ref={previewScrollRef} key="preview" className={`scroll-area flex min-h-0 flex-1 flex-col overflow-y-auto ${p.skipFade ? '' : 'anim-fade'}`}>
              {docBar}
              {sizeBar}
              {remoteBar}
              <MarkdownPreview content={previewContent} readability={assist.readability} remoteImages={p.remoteImages} emptyHint={readOnly ? undefined : t('preview.emptyDoc')} />
              <ScrollJump />
            </main>
          )}
        </div>
      </div>
      {outlineShown && !isDesktop && panel('sheet')}
    </>
  )
}
