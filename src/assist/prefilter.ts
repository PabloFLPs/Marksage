import { parseJsonLike } from './json.ts'

/**
 * Deterministic candidate detection. Pure functions, no model involved.
 * The engine only ever runs on what these return — never per keystroke.
 */

export interface Line {
  text: string
  start: number // offset of first char
  end: number // offset after last char (excluding \n)
  inFence: boolean // inside (or delimiting) a fenced code block
  /** Not prose: fenced code, an indented code block, or a raw HTML block (`<pre>`, `<style>`, …). */
  inCode: boolean
}

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/
const LIST_ITEM_RE = /^(\s*)([-+*]|\d{1,9}[.)])( {1,4}|\t)(?=\S)/
const RAW_HTML_OPEN_RE = /^ {0,3}<(pre|script|style|textarea)(?=[\s>]|$)/i
const RAW_HTML_CLOSE_RE = /<\/(pre|script|style|textarea)>/i

/** Leading whitespace width, tabs counting as 4 columns (CommonMark tab stops are close enough here). */
function indentOf(line: string): number {
  let w = 0
  for (const ch of line) {
    if (ch === ' ') w++
    else if (ch === '\t') w += 4 - (w % 4)
    else break
  }
  return w
}

export function splitLines(text: string): Line[] {
  const lines: Line[] = []
  let offset = 0
  let fence: { char: string; len: number } | null = null
  // CommonMark blocks that are code without a fence:
  let inHtml = false // raw HTML block (type 1) until its closing tag
  let inIndented = false // indented code block (≥ 4 columns past the enclosing list item's content)
  let listContent: number | null = null // content column of the list item we are inside, if any
  let prevBlank = true
  for (const raw of text.split('\n')) {
    const m = FENCE_RE.exec(raw)
    let inFence = fence !== null
    if (m) {
      const marker = m[2]
      if (!fence) {
        if (!(marker[0] === '`' && m[3].includes('`'))) {
          fence = { char: marker[0], len: marker.length }
          inFence = true
        }
      } else if (marker[0] === fence.char && marker.length >= fence.len && m[3].trim() === '') {
        fence = null
        inFence = true
      }
    }

    let inCode = inFence
    const blank = raw.trim() === ''
    if (!inFence) {
      if (inHtml) {
        inCode = true
        if (RAW_HTML_CLOSE_RE.test(raw)) inHtml = false
      } else if (RAW_HTML_OPEN_RE.test(raw)) {
        inCode = true
        inHtml = !RAW_HTML_CLOSE_RE.test(raw)
        inIndented = false
      } else if (!blank) {
        const indent = indentOf(raw)
        const item = LIST_ITEM_RE.exec(raw)
        // Leaving the list: an unindented paragraph after a blank line.
        if (!item && listContent !== null && prevBlank && indent < listContent) listContent = null
        const base = listContent ?? 0
        // Indented code can't interrupt a paragraph, so it needs a blank line before it (or to continue).
        inIndented = !item && indent >= base + 4 && (prevBlank || inIndented)
        inCode = inIndented
        if (item && !inIndented) listContent = indentOf(item[1]) + item[2].length + Math.max(1, indentOf(item[3]))
      }
    }
    prevBlank = blank
    lines.push({ text: raw, start: offset, end: offset + raw.length, inFence, inCode })
    offset += raw.length + 1
  }
  return lines
}

/* ---------------- F1: bare code fences ---------------- */

export interface BareFence {
  /** Offset where a language tag would be inserted (right after the opening marker). */
  insertAt: number
  /** Range of the whole block, opening marker line through closing marker line. */
  blockStart: number
  blockEnd: number
  body: string
  marker: string
}

export function findBareFences(text: string): BareFence[] {
  const out: BareFence[] = []
  const lines = text.split('\n')
  let offset = 0
  let open: { line: number; offset: number; marker: string; info: string; indent: number } | null = null
  const offsets: number[] = []
  for (let i = 0; i < lines.length; i++) {
    offsets.push(offset)
    const m = FENCE_RE.exec(lines[i])
    if (m) {
      const [, indent, marker, info] = m
      if (!open) {
        if (!(marker[0] === '`' && info.includes('`'))) {
          open = { line: i, offset, marker, info: info.trim(), indent: indent.length }
        }
      } else if (marker[0] === open.marker[0] && marker.length >= open.marker.length && info.trim() === '') {
        if (open.info === '') {
          const bodyLines = lines.slice(open.line + 1, i)
          out.push({
            insertAt: open.offset + open.indent + open.marker.length,
            blockStart: open.offset,
            blockEnd: offset + lines[i].length,
            body: bodyLines.join('\n'),
            marker: open.marker,
          })
        }
        open = null
      }
    }
    offset += lines[i].length + 1
  }
  return out
}

/* ---------------- F2: smart paste ---------------- */

export function isPasteCandidate(text: string): boolean {
  if (text.length > 50_000) return false
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  // Single-line pastes only qualify when they are JSON (e.g. a minified API response).
  return lines.length >= 2 || (lines.length === 1 && parseJsonLike(text) !== undefined)
}

/* ---------------- F3: structure intent ---------------- */

export type StructureKind =
  | 'heading-bold' // **Title** alone on a line
  | 'heading-nospace' // #Title
  | 'heading-wiki' // == Title ==
  | 'list-nospace' // -item / *item / +item
  | 'ordered-nospace' // 1)item / 1.item

export interface StructureCandidate {
  kind: StructureKind
  lineStart: number
  lineEnd: number
  text: string
  /** Deterministic fix our code would apply if the model agrees. */
  replacement: string
  /** Statement the engine is asked to judge (noul). */
  statement: string
  /** Surrounding context for the engine. */
  context: string
}

export function findStructureCandidates(text: string): StructureCandidate[] {
  const lines = splitLines(text)
  const out: StructureCandidate[] = []
  const blank = (i: number) => i < 0 || i >= lines.length || lines[i].text.trim() === ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.inCode) continue
    const t = line.text
    const ctx = lines
      .slice(Math.max(0, i - 2), i + 3)
      .map((l) => l.text)
      .join('\n')
    const push = (kind: StructureKind, replacement: string, statement: string) =>
      out.push({ kind, lineStart: line.start, lineEnd: line.end, text: t, replacement, statement, context: ctx })

    let m: RegExpExecArray | null
    if ((m = /^\*\*([^*].*?[^*]|[^*])\*\*:?\s*$/.exec(t)) && blank(i - 1) && m[1].length <= 80) {
      push('heading-bold', `## ${m[1].trim()}`, `The line "${t}" is meant to be a section heading.`)
    } else if ((m = /^(#{1,6})([^\s#].*)$/.exec(t)) && !isLikelyHashtag(m[1], m[2])) {
      push('heading-nospace', `${m[1]} ${m[2]}`, `The line "${t}" is meant to be a Markdown heading.`)
    } else if ((m = /^(={2,6})\s*([^=].*?)\s*\1\s*$/.exec(t))) {
      const level = Math.min(6, Math.max(1, 7 - m[1].length))
      push('heading-wiki', `${'#'.repeat(level)} ${m[2]}`, `The line "${t}" is meant to be a heading.`)
    } else if ((m = /^(\s*)([-+*])([^\s\-+*./>=|<)\]}].*)$/.exec(t)) && !/^\s*\*[^*]+\*/.test(t)) {
      // `*/`, `->`, `*...` and the like are code or punctuation, not a missing space.
      push('list-nospace', `${m[1]}${m[2]} ${m[3]}`, `The line "${t}" is meant to be a bullet list item.`)
    } else if ((m = /^(\s*)(\d{1,3})([.)])([^\s\d.)].*)$/.exec(t))) {
      push('ordered-nospace', `${m[1]}${m[2]}${m[3]} ${m[4]}`, `The line "${t}" is meant to be a numbered list item.`)
    }
  }
  return out
}

/** `#tag` (single word) or `#fff` colors are not headings. */
function isLikelyHashtag(hashes: string, rest: string): boolean {
  if (hashes.length > 1) return false
  const first = rest.split(/\s/)[0]
  return /^[0-9a-f]{3,8}$/i.test(first) || /^[\p{L}\p{N}_-]+$/u.test(rest)
}

/* ---------------- F4: sections ---------------- */

export interface Section {
  heading: string
  body: string
}

export function splitSections(text: string): Section[] {
  const sections: Section[] = []
  let current: Section | null = null
  for (const line of splitLines(text)) {
    const m = !line.inFence ? /^##\s+(.+?)\s*#*\s*$/.exec(line.text) : null
    if (m && !line.text.startsWith('###')) {
      current = { heading: m[1], body: '' }
      sections.push(current)
    } else if (current && !line.inFence) {
      current.body += line.text + '\n'
    }
  }
  return sections
}
