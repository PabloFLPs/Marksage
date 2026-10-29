import { memo, useEffect, useRef, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { Check, Clipboard } from 'lucide-react'
import { copyTextToClipboard } from '../lib/file'
import { useHighlighter } from '../hooks/useHighlighter'
import { useI18n } from '../hooks/useI18n'

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  lang: string
  code: string
  /** What react-markdown rendered inside <pre> — shown until the highlighter loads, or for unknown languages. */
  fallback: ReactNode
}

// Highlighting is the costly part of a code block: keep recent results (same code + language → same nodes).
const highlighted = new Map<string, ReactNode>()
const HIGHLIGHT_CACHE = 400

/** A fenced code block: Prism colors when it has a language tag we know, and a copy button. */
function CodeBlockImpl({ lang, code, fallback, ...rest }: CodeBlockProps) {
  const hl = useHighlighter(!!lang)
  let nodes: ReactNode = null
  if (lang && hl) {
    const key = `${lang}\u0000${code}`
    nodes = highlighted.get(key)
    if (nodes === undefined) {
      nodes = hl.highlight(code, lang)
      if (highlighted.size >= HIGHLIGHT_CACHE) highlighted.delete(highlighted.keys().next().value!)
      highlighted.set(key, nodes)
    }
  }
  return (
    <div {...rest} className="code-block">
      <pre>{nodes ? <code className={`language-${lang}`}>{nodes}</code> : fallback}</pre>
      <CopyButton code={code} />
    </div>
  )
}

/** Re-renders only when its code, language or line changes (`fallback` is derived from the code). */
export const CodeBlock = memo(CodeBlockImpl, (a, b) => {
  const keys = (p: CodeBlockProps) => Object.keys(p).filter((k) => k !== 'fallback') as (keyof CodeBlockProps)[]
  const ka = keys(a)
  return ka.length === keys(b).length && ka.every((k) => a[k] === b[k])
})

function CopyButton({ code }: { code: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), [])
  const label = copied ? t('code.copied') : t('code.copy')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        if (!(await copyTextToClipboard(code))) return
        setCopied(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), 1600)
      }}
      className={`code-copy inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-muted transition-colors hover:text-accent dark:border-dark-line dark:bg-dark-surface dark:text-dark-ink-muted dark:hover:text-dark-accent ${copied ? 'is-copied text-accent dark:text-dark-accent' : ''}`}
    >
      {copied ? <Check className="anim-pop h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
    </button>
  )
}
