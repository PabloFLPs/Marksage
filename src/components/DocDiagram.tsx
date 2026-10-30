import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { useI18n } from '../hooks/useI18n'

interface DocDiagramProps {
  /** The drawn version: our own SVG file (docs/*.svg), inlined so it follows the app theme and accent. */
  svg: string
  /** The same drawing with its lanes stacked, shown on narrow screens. */
  narrowSvg?: string
  /** The same diagram as Mermaid source (also what GitHub shows under "details"). */
  mermaid: string
  alt: string
}

type View = 'drawn' | 'mermaid'

/** A docs diagram with a switch between the drawn SVG and a Mermaid rendering (Mermaid loads on first use). */
export function DocDiagram({ svg, narrowSvg, mermaid, alt }: DocDiagramProps) {
  const { t } = useI18n()
  const [view, setView] = useState<View>('drawn')
  // Never wider than the drawing itself (the single-column diagrams are 440 px wide).
  const width = Number(/<svg[^>]*\swidth="(\d+)"/.exec(svg)?.[1]) || 720
  return (
    <figure className="doc-diagram-figure" style={{ '--diagram-max': `${width}px` } as CSSProperties}>
      <div role="group" aria-label={t('diagram.view')} className="doc-diagram-switch">
        {(['drawn', 'mermaid'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            title={v === 'mermaid' ? t('diagram.mermaidHint') : undefined}
            onClick={() => setView(v)}
          >
            {t(`diagram.${v}`)}
          </button>
        ))}
      </div>
      {view === 'drawn' ? (
        // Our own static files from the repo, not user content. CSS shows one of the two by width.
        <>
          <div className={`doc-diagram${narrowSvg ? ' doc-diagram-wide' : ''}`} role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: svg }} />
          {narrowSvg && <div className="doc-diagram doc-diagram-narrow" role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: narrowSvg }} />}
        </>
      ) : (
        <MermaidView source={mermaid} alt={alt} />
      )}
    </figure>
  )
}

/** Theme colors from the app's CSS variables, so Mermaid matches light/dark and the icon accent. */
function themeVariables() {
  const css = getComputedStyle(document.documentElement)
  const dark = document.documentElement.classList.contains('dark')
  const v = (name: string) => css.getPropertyValue(`--color-${dark ? 'dark-' : ''}${name}`).trim()
  return {
    darkMode: dark,
    background: v('surface'),
    primaryColor: v('surface-soft'),
    primaryBorderColor: v('line'),
    primaryTextColor: v('ink'),
    secondaryColor: v('surface-soft'),
    tertiaryColor: v('surface'),
    lineColor: v('ink-muted'),
    textColor: v('ink'),
    clusterBkg: v('surface'),
    clusterBorder: v('line'),
    titleColor: v('accent'),
    edgeLabelBackground: v('surface'),
    fontFamily: css.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif',
    fontSize: '14px',
  }
}

/**
 * Mermaid's rendering. A failure (the ~650 KB download dropped, an old tab after a deploy, a browser Mermaid
 * can't draw in) says so and offers Try again — it used to switch back to "Drawn" silently, which looked
 * like a dead button.
 */
function MermaidView({ source, alt }: { source: string; alt: string }) {
  const { t } = useI18n()
  const id = 'mmd-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [themeKey, setThemeKey] = useState(0)
  // 'download': Mermaid's code didn't arrive — the browser remembers a failed module import for this page, so
  // only a reload can fetch it again (launch QA #18: Try again never recovered). 'render': it arrived but couldn't draw.
  const [failed, setFailed] = useState<false | 'download' | 'render'>(false)
  const [attempt, setAttempt] = useState(0)

  // Re-render when the theme or accent changes.
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-accent'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    setFailed(false)
    import('mermaid')
      .then(async ({ default: mm }) => {
        mm.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables(), flowchart: { curve: 'basis', wrappingWidth: 280, nodeSpacing: 28, rankSpacing: 36 } })
        const out = await mm.render(`${id}-${themeKey}`, source)
        if (alive) setSvg(out.svg)
      })
      .catch((err) => {
        console.error('[diagram] Mermaid failed:', err)
        const download = /dynamically imported module|importing a module script failed|failed to fetch|error loading dynamically/i.test(String(err))
        if (alive) setFailed(download ? 'download' : 'render')
      })
    return () => {
      alive = false
    }
  }, [source, id, themeKey, attempt])

  if (failed)
    return (
      <p role="alert" className="doc-diagram-loading">
        {t('diagram.failed')}{' '}
        <button
          type="button"
          onClick={() => (failed === 'download' ? window.location.reload() : setAttempt((n) => n + 1))}
          className="tap font-medium text-accent hover:underline dark:text-dark-accent"
        >
          {failed === 'download' ? t('diagram.reload') : t('diagram.retry')}
        </button>
      </p>
    )
  if (!svg) return <p className="doc-diagram-loading">{t('diagram.loading')}</p>
  // Mermaid's own output in strict mode (sanitized), from our docs source.
  return <div className="doc-diagram doc-diagram-mermaid" role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: svg }} />
}
