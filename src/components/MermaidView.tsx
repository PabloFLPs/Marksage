import { memo, useEffect, useId, useRef, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { useI18n } from '../hooks/useI18n'
import { CodeBlock } from './CodeBlock'

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
    // Sequence diagrams.
    actorBkg: v('surface-soft'),
    actorBorder: v('line'),
    actorTextColor: v('ink'),
    signalColor: v('ink-muted'),
    signalTextColor: v('ink'),
    noteBkgColor: v('surface-soft'),
    noteBorderColor: v('line'),
    noteTextColor: v('ink'),
    fontFamily: css.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif',
    fontSize: '14px',
  }
}

/** Mermaid's first word: the diagram type ("flowchart", "sequenceDiagram"…), for the figure's accessible name. */
function mermaidKind(source: string): string {
  for (const line of source.split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('%%') || s === '---') continue
    return /^[\w-]+/.exec(s)?.[0] ?? ''
  }
  return ''
}

/** Renders run one at a time (Mermaid keeps global settings, and every view sets them before drawing). */
let queue: Promise<unknown> = Promise.resolve()
let renders = 0

/**
 * Drawings by theme and source. Opening or closing the editor mounts the preview again: without this, every diagram
 * near the screen was drawn again during the editor's slide (Mermaid takes 50–300 ms per diagram).
 */
const drawn = new Map<string, string>()
const DRAWN_CACHE = 60
const themeOf = () => `${document.documentElement.className}|${document.documentElement.dataset.accent ?? ''}`
const drawnKey = (source: string) => `${themeOf()}\u0000${source}`

/**
 * Mermaid's rendering. A failure (the ~650 KB download dropped, an old tab after a deploy, a browser Mermaid
 * can't draw in) says so and offers Try again — it used to switch back to "Drawn" silently, which looked
 * like a dead button. With `onSyntaxError`, a diagram Mermaid can't parse is the caller's to show (a document's
 * diagram shows its code and the reason); without it, the same message as any other failure.
 */
export function MermaidView({ source, alt, onSyntaxError }: { source: string; alt: string; onSyntaxError?: (message: string | null) => void }) {
  const { t } = useI18n()
  const id = 'mmd-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState<string | null>(() => drawn.get(drawnKey(source)) ?? null)
  const [themeKey, setThemeKey] = useState(0)
  // 'download': Mermaid's code didn't arrive — the browser remembers a failed module import for this page, so
  // only a reload can fetch it again (development check #18: Try again never recovered). 'render': it arrived but couldn't draw.
  const [failed, setFailed] = useState<false | 'download' | 'render'>(false)
  const [attempt, setAttempt] = useState(0)
  const syntaxRef = useRef(onSyntaxError)
  syntaxRef.current = onSyntaxError

  // Re-render when the theme or accent changes.
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-accent'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    setFailed(false)
    const key = drawnKey(source)
    const cached = drawn.get(key)
    if (cached) {
      setSvg(cached)
      syntaxRef.current?.(null)
      return
    }
    const run = () =>
      import('mermaid').then(async ({ default: mm }) => {
        if (!alive) return
        mm.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: themeVariables(), flowchart: { curve: 'basis', wrappingWidth: 280, nodeSpacing: 28, rankSpacing: 36 } })
        // Parsed first: a diagram with a mistake never reaches render(), which leaves its error drawing in the page.
        if (syntaxRef.current) {
          try {
            await mm.parse(source)
          } catch (err) {
            if (alive) syntaxRef.current?.(firstLine(err))
            return
          }
        }
        const out = await mm.render(`${id}-${++renders}`, source)
        if (drawn.size >= DRAWN_CACHE) drawn.delete(drawn.keys().next().value!)
        drawn.set(key, out.svg)
        if (!alive) return
        setSvg(out.svg)
        syntaxRef.current?.(null)
      })
    const job = queue.then(run)
    queue = job.catch(() => {})
    job.catch((err) => {
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
  // Mermaid's own output in strict mode (its labels sanitized, no scripts or links that run code).
  return <div className="doc-diagram doc-diagram-mermaid" role="img" aria-label={alt} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** "Parse error on line 3:" — Mermaid's message is several lines, with the code and a caret under it. */
function firstLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.split('\n')[0].trim().replace(/:$/, '') || text
}

interface MermaidBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string
  /** What react-markdown rendered inside <pre>, for the Code view. */
  fallback: ReactNode
}

/** How long the source must stay still while typing before the diagram is drawn again. */
const REDRAW_MS = 400

/**
 * A ```mermaid block in a document: the diagram, drawn the first time it comes near the screen (Mermaid is a
 * separate ~650 KB download, made only when a document has one), with a Diagram / Code switch. A diagram Mermaid
 * can't parse shows its code and the reason. Typing in the block redraws it once the text rests.
 */
function MermaidBlockImpl({ code, fallback, ...rest }: MermaidBlockProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'diagram' | 'code'>('diagram')
  const [near, setNear] = useState(false)
  const [source, setSource] = useState(code)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') return setNear(true)
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    if (code === source) return
    const timer = window.setTimeout(() => setSource(code), REDRAW_MS)
    return () => window.clearTimeout(timer)
  }, [code, source])

  const kind = mermaidKind(source)
  const alt = kind ? t('mermaid.altKind', { kind }) : t('mermaid.alt')
  const showDiagram = view === 'diagram' && !error
  return (
    <div {...rest} ref={ref} className="mermaid-block">
      <div role="group" aria-label={t('mermaid.view')} className="doc-diagram-switch">
        {(['diagram', 'code'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className="tap">
            {t(`mermaid.${v}`)}
          </button>
        ))}
      </div>
      {error && view === 'diagram' && (
        <p role="note" className="mermaid-error">
          {t('mermaid.error', { detail: error })}
        </p>
      )}
      {/* Kept mounted while the code shows, so switching back doesn't draw it again. */}
      {near && (
        <div hidden={!showDiagram}>
          <MermaidView source={source} alt={alt} onSyntaxError={setError} />
        </div>
      )}
      {!near && showDiagram && <p className="doc-diagram-loading">{t('diagram.loading')}</p>}
      {!showDiagram && <CodeBlock lang="mermaid" code={code} fallback={fallback} />}
    </div>
  )
}

/** Re-renders only when its code or line changes (`fallback` is derived from the code). */
export const MermaidBlock = memo(MermaidBlockImpl, (a, b) => {
  const keys = (p: MermaidBlockProps) => Object.keys(p).filter((k) => k !== 'fallback') as (keyof MermaidBlockProps)[]
  const ka = keys(a)
  return ka.length === keys(b).length && ka.every((k) => a[k] === b[k])
})
