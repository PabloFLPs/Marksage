/**
 * Long documents render in pieces: the preview splits the Markdown at top-level ATX headings, and each
 * piece is a memoized component — a keystroke re-parses only the piece it's in, and React can pause between
 * pieces so typing stays responsive. A heading always ends whatever block came before it (a paragraph, a
 * list, a quote), so cutting there renders the same as one parse, with two exceptions handled here:
 *  - reference links (`[x]: url`) may be defined in another piece → every piece gets all the definitions
 *    (they render nothing);
 *  - footnotes render as one list at the end of the document → a document with footnotes isn't split.
 */
export interface Chunk {
  text: string
  /** 0-based source line where the piece starts. */
  line: number
}

/** Below this size one parse is fast enough — and identical to before. */
export const CHUNK_MIN_CHARS = 20_000

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^#{1,6}(?:[ \t]|$)/ // column 0 only: an indented `#` may be inside a list item's code
// Raw HTML blocks that run until their closing tag, blank lines included (CommonMark type 1).
const HTML_OPEN = /^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)/i
const REF_DEF = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*\S/
const FOOTNOTE_DEF = /^ {0,3}\[\^[^\]]+\]:/

export function splitMarkdown(md: string): Chunk[] | null {
  if (md.length < CHUNK_MIN_CHARS) return null
  const lines = md.split('\n')
  const starts: number[] = [0]
  const defs: string[] = []
  let fence: string | null = null
  let html: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (html) {
      if (l.toLowerCase().includes(`</${html}>`)) html = null
      continue
    }
    const f = FENCE.exec(l)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !l.slice(f[0].length).trim()) fence = null
      continue
    }
    if (f) {
      fence = f[1]
      continue
    }
    const h = HTML_OPEN.exec(l)
    if (h) {
      if (!l.toLowerCase().includes(`</${h[1].toLowerCase()}>`)) html = h[1].toLowerCase()
      continue
    }
    if (FOOTNOTE_DEF.test(l)) return null
    if (REF_DEF.test(l)) defs.push(l)
    else if (i > 0 && HEADING.test(l)) starts.push(i)
  }
  if (starts.length < 3) return null
  const suffix = defs.length ? '\n\n' + defs.join('\n') + '\n' : ''
  return starts.map((start, k) => ({
    line: start,
    text: lines.slice(start, starts[k + 1] ?? lines.length).join('\n') + suffix,
  }))
}
