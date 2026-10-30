import { Children, isValidElement, memo, useLayoutEffect, useMemo, useRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components, Options } from 'react-markdown'
import type { ReadabilityMark } from '../assist/types'
import { rehypeSourceLines } from '../lib/scrollSync'
import { useI18n } from '../hooks/useI18n'
import { CodeBlock } from './CodeBlock'
import { codeOf } from '../lib/codeOf'
import { splitMarkdown } from '../lib/chunks'
import { remoteHost } from '../lib/remoteImages'
import { ImageOff } from 'lucide-react'

interface MarkdownPreviewProps {
  content: string
  /** Smart Assist readability — per-`##` marks. */
  readability?: ReadabilityMark[]
  /** Replace a fenced block with something else (the docs page renders its diagrams this way). */
  renderBlock?: (lang: string, code: string) => ReactNode | null
  /** Relative links that stay in the app: href → in-app hash (the docs link to each other this way). */
  internalLinks?: Record<string, string>
  /** Shown in place of an empty document (the split view's preview pane). */
  emptyHint?: string
  /** Load images from other websites (About → Privacy & storage); off shows a placeholder instead. */
  remoteImages?: boolean
}

const DOT_COLORS = ['bg-emerald-500/70', 'bg-emerald-500/70', 'bg-amber-500/70', 'bg-orange-500/80', 'bg-red-500/80']

const REMARK = [remarkGfm]
const REHYPE = [rehypeSourceLines]

/** One piece of a long document; re-renders only when its own text (or the renderers) change. */
const Piece = memo(function Piece({ text, index, components }: { text: string; index: number; components: Components }) {
  const rehype = useMemo<Options['rehypePlugins']>(() => [[rehypeSourceLines, { chunk: index }]], [index])
  return (
    <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={rehype} components={components}>
      {text}
    </ReactMarkdown>
  )
})

/** Memoized: it re-renders only when the (deferred) content or its options change — not on every App render. */
export const MarkdownPreview = memo(function MarkdownPreview({ content, readability, renderBlock, internalLinks, emptyHint, remoteImages = false }: MarkdownPreviewProps) {
  const { t } = useI18n()
  const components = useMemo<Components>(() => {
    const base: Components = {
      a: ({ href, children }) => {
        // In-document links (`[x](#install)`, footnotes) scroll the preview — never a new tab, and never the
        // page's hash, which is the app's own navigation (#about…).
        if (href?.startsWith('#'))
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                scrollToAnchor(e.currentTarget, href.slice(1))
              }}
            >
              {children}
            </a>
          )
        const internal = href ? internalLinks?.[href.replace(/^\.\//, '')] : undefined
        return internal ? (
          <a href={internal}>{children}</a>
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      },
      // Images from other websites load only when the reader allows it; a referrer is never sent.
      img: ({ node: _node, src, alt, ...rest }) => {
        const url = typeof src === 'string' ? src : undefined
        const host = remoteHost(url)
        if (host && !remoteImages) {
          const label = t('remote.placeholder', { host })
          return (
            <span title={url} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-line px-2 py-1 align-middle text-xs text-ink-muted dark:border-dark-line dark:text-dark-ink-muted">
              <ImageOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{alt ? `${alt} — ${label}` : label}</span>
            </span>
          )
        }
        return <img src={url} alt={alt ?? ''} referrerPolicy="no-referrer" loading="lazy" {...rest} />
      },
      // Fenced blocks: highlighted when tagged, always with a copy button. Props (data-line) stay on the
      // outer element, so scroll sync and the Outline still find the block.
      pre: ({ node, children, ref: _ref, ...rest }) => {
        const { lang, code } = codeOf(node)
        const custom = renderBlock?.(lang, code)
        if (custom) return <div {...(rest as HTMLAttributes<HTMLDivElement>)}>{custom}</div>
        return <CodeBlock lang={lang} code={code} fallback={children} {...(rest as HTMLAttributes<HTMLDivElement>)} />
      },
    }
    if (!readability?.length) return base
    const byHeading = new Map(readability.map((m) => [normalize(m.heading), m]))
    return {
      ...base,
      h2: ({ node: _node, children, ...rest }) => {
        const mark = byHeading.get(normalize(textOf(children)))
        return (
          <h2 {...rest} className="relative">
            {mark && (
              <span
                title={t('readability.title', { label: t(`readability.${mark.value}`) })}
                aria-label={t('readability.title', { label: t(`readability.${mark.value}`) })}
                className={`anim-pop absolute -left-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${DOT_COLORS[mark.value]}`}
              />
            )}
            {children}
          </h2>
        )
      },
    }
  }, [readability, t, renderBlock, internalLinks, remoteImages])

  // Long documents render in pieces (lib/chunks.ts); afterwards each block gets the document's line back.
  const chunks = useMemo(() => splitMarkdown(content), [content])
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!chunks || !rootRef.current) return
    rootRef.current.querySelectorAll<HTMLElement>('[data-rel-line]').forEach((el) => {
      const start = chunks[Number(el.dataset.chunk)]?.line ?? 0
      el.dataset.line = String(start + Number(el.dataset.relLine))
    })
  })

  return (
    <div ref={rootRef} className="markdown-body mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6 sm:py-10">
      {emptyHint && !content.trim() ? (
        <p className="anim-fade text-sm text-ink-muted dark:text-dark-ink-muted">{emptyHint}</p>
      ) : chunks ? (
        chunks.map((c, i) => <Piece key={i} index={i} text={c.text} components={components} />)
      ) : (
        <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={components}>
          {content}
        </ReactMarkdown>
      )}
    </div>
  )
})


function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? textOf(c.props.children) : ''))
    .join('')
}

/** Match raw Markdown heading text against rendered text (strip inline syntax). */
function normalize(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** GitHub-style heading anchor: lowercase, punctuation dropped, spaces → "-". */
function slugOf(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

/**
 * Scroll the preview to `#id`: an element with that id (footnotes), else the heading whose GitHub-style slug
 * matches — repeated headings get `-1`, `-2`… as on GitHub.
 */
function scrollToAnchor(from: HTMLElement, raw: string) {
  const root = from.closest('.markdown-body')
  if (!root || !raw) return
  let id = raw
  try {
    id = decodeURIComponent(raw)
  } catch {
    // Keep it as written.
  }
  let target: Element | null = root.querySelector(`[id="${CSS.escape(id)}"]`)
  if (!target) {
    const seen = new Map<string, number>()
    const want = id.toLowerCase()
    for (const h of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const base = slugOf(h.textContent ?? '')
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      if ((n ? `${base}-${n}` : base) === want) {
        target = h
        break
      }
    }
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
}
