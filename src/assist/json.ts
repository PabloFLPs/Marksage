/**
 * Tolerant JSON detection: strict JSON, plus the "JSON with comments / trailing
 * commas" dialect that config files (tsconfig, VS Code settings…) actually use.
 */

/** Remove // and /* *\/ comments outside strings, then trailing commas. */
export function stripJsonc(text: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      out += ch
      if (ch === '\\') out += text[++i] ?? ''
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') {
      inStr = true
      out += ch
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else out += ch
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

/** Parsed value if `text` is a JSON object/array (strict or JSONC), else undefined. */
export function parseJsonLike(text: string): { value: unknown; strict: boolean } | undefined {
  const t = text.trim()
  // Config files often open with comment lines ("// For format details, see …") before the object.
  const shape = /^\/[/*]/.test(t) ? stripJsonc(t).trim() : t
  if (!/^[{[]/.test(shape) || !/[}\]]$/.test(shape)) return undefined
  try {
    return { value: JSON.parse(t), strict: true }
  } catch {
    try {
      return { value: JSON.parse(stripJsonc(t)), strict: false }
    } catch {
      return undefined
    }
  }
}

/** Minified (single line) strict JSON → pretty-printed with 2 spaces; otherwise unchanged. */
export function prettyJson(text: string): string {
  const parsed = parseJsonLike(text)
  if (!parsed?.strict || text.trim().includes('\n')) return text.trim()
  return JSON.stringify(parsed.value, null, 2)
}
