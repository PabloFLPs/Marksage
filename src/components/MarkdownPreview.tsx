import { Children, isValidElement, useMemo } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { ReadabilityMark } from '../assist/types'
import { rehypeSourceLines } from '../lib/scrollSync'
import { useI18n } from '../hooks/useI18n'
import { CodeBlock } from './CodeBlock'
import { codeOf } from '../lib/codeOf'

interface MarkdownPreviewProps {
  content: string
  /** Smart Assist readability — per-`##` marks. */
  readability?: ReadabilityMark[]
  /** Replace a fenced block with something else (the docs page renders its diagrams this way). */
  renderBlock?: (lang: string, code: string) => ReactNode | null
  /** Relative links that stay in the app: href → in-app hash (the docs link to each other this way). */
  internalLinks?: Record<string, string>
}

const DOT_COLORS = ['bg-emerald-500/70', 'bg-emerald-500/70', 'bg-amber-500/70', 'bg-orange-500/80', 'bg-red-500/80']

export function MarkdownPreview({ content, readability, renderBlock, internalLinks }: MarkdownPreviewProps) {
  const { t } = useI18n()
  const components = useMemo<Components>(() => {
    const base: Components = {
      a: ({ href, children }) => {
        const internal = href ? internalLinks?.[href.replace(/^\.\//, '')] : undefined
        return internal ? (
          <a href={internal}>{children}</a>
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
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
  }, [readability, t, renderBlock, internalLinks])

  return (
    <div className="markdown-body mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6 sm:py-10">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSourceLines]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}


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
