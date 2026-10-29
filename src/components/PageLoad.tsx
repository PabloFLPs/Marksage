import { Component, type ReactNode } from 'react'
import { ArrowLeft, Loader2, RotateCw, WifiOff } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

/** Shown while a lazily loaded page downloads — visible, so a slow connection doesn't look like a dead click. */
export function PageLoading() {
  const { t } = useI18n()
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center">
      <p role="status" className="anim-fade inline-flex items-center gap-2 text-sm text-ink-muted dark:text-dark-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        {t('page.loading')}
      </p>
    </main>
  )
}

function PageLoadFailed({ onRetry, onBack, backLabel }: { onRetry: () => void; onBack: () => void; backLabel: string }) {
  const { t } = useI18n()
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center px-6">
      <div role="alert" className="anim-pop flex max-w-sm flex-col items-center gap-3 text-center">
        <WifiOff className="h-6 w-6 text-ink-muted dark:text-dark-ink-muted" />
        <p className="text-sm text-ink dark:text-dark-ink">{t('page.loadFailed')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="press inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:text-dark-ink dark:hover:border-dark-accent dark:hover:text-dark-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="press inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong dark:bg-dark-accent dark:text-dark-surface dark:hover:bg-dark-accent-strong"
          >
            <RotateCw className="h-4 w-4" /> {t('page.retry')}
          </button>
        </div>
      </div>
    </main>
  )
}

interface PageLoadBoundaryProps {
  children: ReactNode
  /** Try again (the app reloads the page — see App.tsx). */
  onRetry: () => void
  onBack: () => void
  backLabel: string
}

/**
 * Catches a page chunk that failed to download (slow or dropped connection, or an old tab after a deploy) —
 * without it the whole app unmounts to a blank screen. Shows Back + Try again instead.
 */
export class PageLoadBoundary extends Component<PageLoadBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <PageLoadFailed onRetry={this.props.onRetry} onBack={this.props.onBack} backLabel={this.props.backLabel} />
  }
}
