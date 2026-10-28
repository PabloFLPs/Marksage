/**
 * Heuristic `noul` for F3. `state` is the local context (±2 lines),
 * `statement` names the candidate line in quotes and the intended structure.
 */

/** Sentence-ending punctuation, incl. CJK (。！？), Devanagari (।) and Khmer (។). */
const SENTENCE_END = /[.!?。！？।។]$/
/** Admonition / Q&A labels — bold, but a callout, not a section title. EN + PT-BR. */
const ADMONITION =
  /^(note|notes|nb|warning|caution|danger|tip|hint|important|attention|info|q|a|nota|notas|aviso|atenção|atencao|cuidado|dica|importante|obs|observação|observacao|p|r)\b/i

export function structureProbability(state: string, statement: string): number {
  const m = /"(.*)"/.exec(statement)
  if (!m) return 0.5
  const line = m[1]
  const others = state.split('\n').filter((l) => l !== line && l.trim() !== '')
  const words = line.replace(/[*#=\-+\d.)]/g, ' ').trim().split(/\s+/).filter(Boolean).length

  if (/link broken by a space/.test(statement)) return 0.9

  if (/heading/.test(statement)) {
    if (line.startsWith('**')) return clamp(boldHeading(line, words, nextLine(state, line)))
    if (/^={2,}/.test(line)) return /[\p{L}\p{N}]/u.test(line) ? 0.9 : 0.05 // "=== === ===" is a separator
    if (HASH_NOT_HEADING.test(line) || /^#\S+(\s+#\S+)+\s*$/.test(line.trim())) return 0.1 // "#include …", "#123 …", "#CLT #Remoto"
    if (/^#{2,}/.test(line)) return 0.93
    if (line.startsWith('#')) return words >= 2 ? 0.88 : 0.55
  }

  if (/bullet list/.test(statement) && GLYPH.test(line.trim())) {
    const t = line.trim()
    // "• [English] • [Русский] • …" — the glyph separates links on one line; a lone "— Name" under a quote signs it.
    if ((t.match(GLYPH_ALL) ?? []).length > 1) return 0.1
    if (/^[—–]\s*\p{Lu}[\p{L}.'-]*(\s+\p{Lu}[\p{L}.'-]*){0,3}\s*(,.*)?$/u.test(t)) return 0.15
    const items = others.filter((l) => GLYPH.test(l.trim()) || /^\s*[-+*]\s\S/.test(l)).length
    return items === 0 ? 0.55 : clamp(0.8 + items * 0.07)
  }

  if (/bullet list/.test(statement)) {
    const t = line.trim()
    if (/^-\d/.test(t)) return 0.2 // "-5 degrees" — negative number
    if (/^[-dlbcps][rwxsStT-]{9}[@+.]?\s/.test(t)) return 0.05 // "-rw-r--r-- 1 user …" — `ls -l` output
    if (/^\*[^*\s][^*]*\*/.test(t)) return 0.1 // *emphasis*
    if (/^-[a-z](?=[\s,)=]|$)/i.test(t)) return 0.15 // "-p)", "-s, --search": a CLI flag
    if (/^-(webkit|moz|ms|o)-/.test(t) || /^[-+*][\w-]+\s*:\s*[^:]+;$/.test(t)) return 0.05 // CSS declaration
    if (/^[-+]\S+(\s+[-+]\S+)+/.test(t)) return 0.15 // "+SIMD +AVX", "-Wall -Wextra": flags, not items
    // Neighbouring items, written properly or without the space too — but not "**bold**", "--flag" or "-rw-r--r--".
    const listNeighbors = others.filter((l) => LIST_NEIGHBOR.test(l) && !/^\s*[-dl][rwx-]{9}/.test(l)).length
    // A lone `*`/`+` line is more often a footnote or broken emphasis than a list item.
    if (listNeighbors === 0) {
      if (!t.startsWith('-')) return 0.55
      // A lone "-word word word" of plain prose reads as an item someone forgot the space in ("-this should be a
      // list item"); anything code-like ("-su cd: /opt/…: Permission denied") or short stays below the gate.
      const prose = /^-\p{L}{2,}/u.test(t) && words >= 3 && !/[/:=$`{}<>|\\]/.test(t) && !/^\s{4}/.test(line)
      return prose ? 0.82 : 0.72
    }
    return clamp(0.8 + listNeighbors * 0.07)
  }

  if (/numbered list/.test(statement)) {
    const numNeighbors = others.filter((l) => /^\s*\d{1,3}([.)]\s?| ?- +)\S/.test(l)).length
    // "1 - item" is a list only with company: a lone "3 - 2" or "31- zone 2 passed" is a range or output.
    if (/^\s*\d{1,3} ?- /.test(line)) return numNeighbors === 0 ? 0.5 : clamp(0.78 + numNeighbors * 0.08)
    return clamp(0.78 + numNeighbors * 0.08)
  }
  return 0.5
}

/** Typographic bullet at the start of a line (prefilter's `list-glyph`). */
const GLYPH = /^[•◦▪▫▸►▹●○■□·‣⁃–—✓✔☑✅]/u
const GLYPH_ALL = /(^|\s)[•◦▪▫▸►▹●○■□·‣⁃–—](?=\s)/gu
/** `#` lines that are code or references, not headings: preprocessor, shebang, Rust attributes, issue numbers. */
const HASH_NOT_HEADING = /^#(include|define|undef|if|ifdef|ifndef|elif|else|endif|pragma|region|endregion|import|!|\[)|^#\d+\b/

/** A list item, with its space or without: `- item`, `-item`, `*item` — not `**bold**`, `--flag` or `++i`. */
const LIST_NEIGHBOR = /^\s*(?:[-+*]\s+\S|([-+*])(?!\1)[^\s-+*])/

/** The first non-blank line after `line` in the context window. */
function nextLine(state: string, line: string): string {
  const lines = state.split('\n')
  const i = lines.indexOf(line)
  return i < 0 ? '' : (lines.slice(i + 1).find((l) => l.trim() !== '') ?? '')
}

/** `**Title**` alone on a line: a heading, or a bold label / emphasised sentence? */
function boldHeading(line: string, words: number, next = ''): number {
  const inner = line.replace(/^\*\*/, '').replace(/\*\*:?\s*$/, '').trim()
  // Scripts written without spaces (CJK, Thai, Khmer…) — count characters instead of words.
  const long = words > 10 || (words <= 2 && inner.length > 40)
  let p = 0.86
  if (long) p -= 0.35
  if (SENTENCE_END.test(inner)) p -= 0.4
  if (/:\s*$|:\*\*\s*$|\*\*:\s*$/.test(line)) p -= 0.12 // "**Returns:**" introduces something — a label
  if (ADMONITION.test(inner.replace(/^[^\p{L}]+/u, ''))) p -= 0.5
  if (/^\[[^\]]*\]\([^)]*\)$/.test(inner)) p -= 0.6 // "**[⬆ back to top](#toc)**" — a bold link
  if (/^\s*(<img\b|!\[)/i.test(next)) p -= 0.4 // "**Before**" over a screenshot — a caption
  if (/^[\w$]+([._:][\w$]+)+$/.test(inner) && !/\s/.test(inner)) p -= 0.3 // "**android.permission.CAMERA**" — an identifier
  return p
}

function clamp(p: number): number {
  return Math.max(0.01, Math.min(0.97, p))
}
