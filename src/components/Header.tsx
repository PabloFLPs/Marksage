import { useI18n } from '../hooks/useI18n'
import {
  ArrowLeft,
  Check,
  Clipboard,
  FilePlus2,
  FolderOpen,
  PenLine,
  Info,
  Eye,
  ListTree,
} from 'lucide-react'
import type { ViewMode } from '../lib/viewMode'
import { ThemeToggle } from './ThemeToggle'
import { DocName } from './DocName'
import { ExportMenu } from './ExportMenu'
import type { Theme } from '../hooks/useTheme'
import { AssistToggle } from './AssistToggle'
import { CollapseX } from './motion'
import { HistoryMenu } from './HistoryMenu'
import { MoreMenu } from './MoreMenu'
import type { HistoryEntry } from '../lib/history'
import type { AssistMode } from '../assist/types'
import type { EngineStatus } from '../assist/useSmartAssist'

interface HeaderProps {
  hasDocument: boolean
  filename: string | null
  isDirty: boolean
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onNew: () => void
  onOpen: () => void
  onCopy: () => void
  copied: boolean
  /** The Export panel (also opened by ⌘/Ctrl + S, so its state lives in App). */
  exportOpen: boolean
  onExportOpenChange: (open: boolean) => void
  exportName: string
  onExport: (name: string) => void
  onRename: (name: string) => void
  theme: Theme
  onToggleTheme: () => void
  isDesktop: boolean
  assistMode: AssistMode
  assistStatus: EngineStatus
  onAssistModeChange: (mode: AssistMode) => void
  onAbout: () => void
  /** Logo / app name → back to the app (open document or start screen). */
  onHome: () => void
  appIconSrc: string
  history: HistoryEntry[]
  currentDocId?: string
  onOpenHistory: (entry: HistoryEntry) => void
  onRemoveHistory: (id: string) => void
  onClearHistory: () => void
  showingAbout?: boolean
  outlineOpen: boolean
  onToggleOutline: () => void
}

const actionButton =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent'

// Same button, highlighted (Outline open, just copied) — its own classes so the base border/text colors don't win.
const actionButtonOn =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-accent bg-surface px-2.5 text-xs font-medium text-accent transition-colors dark:border-dark-accent dark:bg-dark-surface-soft dark:text-dark-accent'

export function Header({
  hasDocument,
  filename,
  isDirty,
  viewMode,
  onViewModeChange,
  onNew,
  onOpen,
  onCopy,
  copied,
  exportOpen,
  onExportOpenChange,
  exportName,
  onExport,
  onRename,
  theme,
  onToggleTheme,
  isDesktop,
  assistMode,
  assistStatus,
  onAssistModeChange,
  onAbout,
  onHome,
  appIconSrc,
  history,
  currentDocId,
  onOpenHistory,
  onRemoveHistory,
  onClearHistory,
  showingAbout = false,
  outlineOpen,
  onToggleOutline,
}: HeaderProps) {
  const { t } = useI18n()
  const compact = !isDesktop
  const showBackToEditor = compact && hasDocument && viewMode === 'preview' && !showingAbout
  const editing = viewMode === 'edit'

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:gap-3 border-line bg-surface px-4 dark:border-dark-line dark:bg-dark-surface">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {showBackToEditor ? (
          <button
            key="back"
            type="button"
            onClick={() => onViewModeChange('edit')}
            className="anim-slide-in-left -ml-2 inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-ink transition-colors hover:text-accent dark:text-dark-ink dark:hover:text-dark-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('action.edit')}
          </button>
        ) : (
          <>
            <button
              type="button"
              data-brand
              onClick={onHome}
              aria-label={t('app.home')}
              title={showingAbout ? t('app.home') : undefined}
              className="group -ml-1 inline-flex min-w-0 shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-1 py-0.5"
            >
              <img src={appIconSrc} alt="" className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
              <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-ink transition-colors group-hover:text-accent dark:text-dark-ink dark:group-hover:text-dark-accent">
                {t('app.name')}
              </span>
            </button>
            {hasDocument && <DocName filename={filename} isDirty={isDirty} onRename={onRename} />}
          </>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <CollapseX show={hasDocument && editing} gap={compact ? 6 : 8}>
          <AssistToggle mode={assistMode} status={assistStatus} onChange={onAssistModeChange} compact={compact} />
        </CollapseX>

        <CollapseX show={hasDocument && !compact && !showingAbout}>
          <button
            type="button"
            onClick={onToggleOutline}
            aria-pressed={outlineOpen}
            title={t('outline.toggleTitle')}
            className={outlineOpen ? actionButtonOn : actionButton}
          >
            <ListTree className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t('outline.toggle')}</span>
          </button>
        </CollapseX>

        <CollapseX show={hasDocument && isDesktop}>
          <button
            type="button"
            onClick={() => onViewModeChange(editing ? 'preview' : 'edit')}
            title={editing ? t('action.previewTitle') : t('action.editTitle')}
            className={actionButton}
          >
            <span key={editing ? 'p' : 'e'} className="anim-spin-in inline-flex">
              {editing ? <Eye className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
            </span>
            <span key={editing ? 'pt' : 'et'} className="anim-rise">{editing ? t('action.preview') : t('action.edit')}</span>
          </button>
        </CollapseX>

        <CollapseX show={hasDocument && !compact}>
          <button
            type="button"
            onClick={onCopy}
            title={t('action.copyTitle', { keys: 'Ctrl/Cmd + Shift + C' })}
            className={copied ? actionButtonOn : actionButton}
          >
            {copied ? <Check className="anim-pop h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            <span key={copied ? 'c' : 'n'} className={copied ? 'anim-rise' : 'hidden md:inline'}>{copied ? t('action.copied') : t('action.copy')}</span>
          </button>
        </CollapseX>

        {!compact && (
          <>
            <button type="button" onClick={onNew} title={t('action.newTitle', { keys: 'Ctrl/Cmd + N' })} className={actionButton}>
              <FilePlus2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('action.new')}</span>
            </button>

            <button type="button" onClick={onOpen} title={t('action.openTitle', { keys: 'Ctrl/Cmd + O' })} className={actionButton}>
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t('action.open')}</span>
            </button>
          </>
        )}

        <CollapseX show={hasDocument} gap={compact ? 6 : 8}>
          <ExportMenu open={exportOpen} onOpenChange={onExportOpenChange} defaultName={exportName} onExport={onExport} compact={compact} />
        </CollapseX>

        <HistoryMenu
          entries={history}
          currentId={currentDocId}
          onOpen={onOpenHistory}
          onRemove={onRemoveHistory}
          onClear={onClearHistory}
          compact={compact}
        />

        {compact ? (
          <MoreMenu
            hasDocument={hasDocument}
            copied={copied}
            theme={theme}
            onNew={onNew}
            onOpen={onOpen}
            onCopy={onCopy}
            onAbout={onAbout}
            onToggleTheme={onToggleTheme}
            onOutline={showingAbout ? undefined : onToggleOutline}
          />
        ) : (
          <>
        <button
          type="button"
          onClick={onAbout}
          aria-label={t('action.about')}
          title={t('action.about')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted dark:hover:border-dark-accent dark:hover:text-dark-accent"
        >
          <Info className="h-4 w-4" />
        </button>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </>
        )}
      </div>
    </header>
  )
}
