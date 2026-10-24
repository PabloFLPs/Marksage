type HastLike = { type?: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastLike[] }

/** Language tag and text of a `<pre><code class="language-x">` node from react-markdown. */
export function codeOf(node: unknown): { lang: string; code: string } {
  const pre = node as HastLike | undefined
  const code = pre?.children?.find((c) => c.tagName === 'code')
  const classes = code?.properties?.className
  const cls = Array.isArray(classes) ? classes.map(String) : typeof classes === 'string' ? classes.split(' ') : []
  const lang = cls.find((c) => c.startsWith('language-'))?.slice(9) ?? ''
  const text = (n?: HastLike): string => (n?.type === 'text' ? (n.value ?? '') : (n?.children ?? []).map(text).join(''))
  return { lang, code: text(code).replace(/\n$/, '') }
}
