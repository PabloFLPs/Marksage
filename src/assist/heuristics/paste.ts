import type { PasteKind } from '../questions.ts'
import { classifyLanguage } from './language.ts'
import { parseJsonLike } from '../json.ts'

export function nonEmptyLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '')
}

/**
 * Consistent delimiter count across lines → strong tabular evidence. Measured against the most
 * common count, not the first line: real exports often have a header with one column more or less.
 */
function delimiterConsistency(lines: string[], split: (l: string) => number): number {
  const counts = lines.map(split)
  const freq = new Map<number, number>()
  for (const c of counts) if (c >= 1) freq.set(c, (freq.get(c) ?? 0) + 1)
  if (!freq.size) return 0
  return Math.max(...freq.values()) / counts.length
}

export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"' && cur.trim() === '') quoted = true
    else if (ch === ',') {
      cells.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  cells.push(cur.trim())
  return cells
}

/**
 * CSV records, honouring quotes: a quoted cell may contain line breaks (RFC 4180), which then
 * become spaces. Blank records are dropped.
 */
export function csvRecords(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    if (ch === '"') quoted = !quoted
    if (ch === '\n' && !quoted) {
      if (cur.trim()) out.push(cur)
      cur = ''
    } else cur += ch === '\n' ? ' ' : ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** A rule line under a header: `-----  ----`, `===`, `+---+` — not a data row. */
export const SEPARATOR_RE = /^[\s\-=+|:]+$/

/**
 * Column boundaries shared by every line: 2+ space gutters, or — with 3+ data lines and 3+ columns —
 * 1-space gutters, which is what right-aligned columns (`rails routes`, `wc -l`) leave behind.
 * Separator rows are ignored.
 */
export function alignedColumns(lines: string[]): number[] | null {
  const all = lines.filter((l) => !SEPARATOR_RE.test(l))
  if (all.length < 2) return null
  // Indentation shared by every row isn't a column (right-aligned numbers start with spaces).
  const lead = Math.min(...all.map((l) => /^ */.exec(l)![0].length))
  const rows = all.map((l) => l.slice(lead))
  const width = Math.max(...rows.map((l) => l.length))
  const blankAt = (l: string, c: number) => c >= l.length || l[c] === ' '
  const find = (gutter: 1 | 2) => {
    const isGap = (c: number) => c >= gutter - 1 && rows.every((l) => blankAt(l, c) && (gutter === 1 || blankAt(l, c - 1)))
    const starts = [0]
    for (let c = 1; c < width; c++) if (isGap(c - 1) && !rows.every((l) => blankAt(l, c))) starts.push(c)
    return starts
  }
  const wide = find(2)
  if (wide.length >= 2) return wide.map((c) => c + lead)
  // 1-space gutters are only trusted when every row also has a real 2+ space gap somewhere
  // (prose almost never does), and each gutter is an actual space — not past the end of short rows.
  if (all.length < 3 || !all.every((l) => /\S {2,}\S|^ {2,}\S/.test(l))) return null
  const narrow = find(1).filter((c, i) => i === 0 || rows.filter((l) => l[c - 1] === ' ').length >= rows.length * 0.8)
  return narrow.length >= 3 ? narrow.map((c) => c + lead) : null
}

const BULLET_RE = /^\s*([•·▪◦‣–—*+-]|\d{1,3}[.)]|[a-z][.)])\s+\S/

export function classifyPaste(text: string): Record<PasteKind, number> {
  const lines = nonEmptyLines(text)
  const s: Record<PasteKind, number> = { prose: 1.5, table: 0, csv: 0, tsv: 0, list: 0, code: 0, json: 0 }
  // JSON first — a minified single-line payload is still JSON.
  const json = parseJsonLike(text)
  if (json) return { ...s, json: json.strict ? 9 : 8, prose: 0 }
  if (lines.length < 2) return { ...s, prose: 5 }

  // TSV — runs of tabs count as one delimiter (files padded with tabs, e.g. /etc/services).
  // Prose never has a tab on every line, so that alone is strong evidence; consistent counts add to it.
  const tabC = lines.every((l) => l.includes('\t')) ? delimiterConsistency(lines, (l) => l.trim().split(/\t+/).length - 1) : 0
  if (tabC > 0) s.tsv = tabC >= 0.99 ? 7 : 5 + tabC * 2

  // CSV — consistent comma cells and short cells (prose also has commas). Records, not lines:
  // a quoted cell can span lines.
  const records = csvRecords(text)
  const cells = records.map((l) => splitCsvLine(l))
  const commaC = records.length >= 2 ? delimiterConsistency(records, (l) => splitCsvLine(l).length - 1) : 0
  if (commaC > 0 && !s.tsv) {
    const avgCell = cells.flat().reduce((a, c) => a + c.length, 0) / Math.max(1, cells.flat().length)
    const sentences = records.filter((l) => /[a-zà-ÿ]{3,}[.!?]\s+[A-ZÀ-Ý]/.test(l)).length
    const wordyCells = cells.flat().filter((c) => c.split(/\s+/).length > 5).length
    s.csv = (commaC >= 0.99 ? 5 : commaC * 2) + (avgCell < 25 ? 1.5 : -2) - sentences * 1.5 - wordyCells * 2
  }

  // Whitespace-aligned table
  const cols = alignedColumns(lines)
  if (cols && !s.tsv) s.table = 3 + Math.min(3, cols.length - 1) * 0.8 + (lines.length >= 3 ? 1 : 0)

  // List — explicit bullets, or many short lines without sentence punctuation.
  const bulleted = lines.filter((l) => BULLET_RE.test(l)).length / lines.length
  const short = lines.filter((l) => l.trim().length <= 60 && !/[.;:{}()=]\s*$/.test(l.trim())).length / lines.length
  s.list = bulleted * 6 + (lines.length >= 3 ? short * 2 : 0) - (cols ? 2 : 0)
  // A list copied from a web page loses its bullets but keeps one item per line, with no blank lines
  // in between. Prose differs: paragraphs come separated by blank lines, and hard-wrapped prose
  // continues mid-sentence on the next line.
  if (lines.length >= 3 && !/\n\s*\n/.test(text.trim()) && !cols && !s.tsv && s.csv < 3) {
    const wrapped = lines.slice(1).some((l, i) => {
      const prev = lines[i].trim()
      return prev.length >= 50 && !/[.!?:;)"'”»…]$/.test(prev) && /^[a-zà-ÿ(]/.test(l.trim())
    })
    const avg = lines.reduce((a, l) => a + l.trim().length, 0) / lines.length
    const codey = lines.filter((l) => /[{};=<>]|^\s{2,}\S/.test(l)).length / lines.length
    if (!wrapped && avg <= 240 && codey < 0.3) s.list += 4.5
  }

  // Code — reuse language evidence.
  const lang = classifyLanguage(text)
  const { plaintext, markdown, ...codeLangs } = lang
  void markdown
  const bestCode = Math.max(...Object.values(codeLangs))
  s.code = Math.max(0, bestCode) * 0.9 - Math.max(0, plaintext) * 0.5
  const structural = lines.filter((l) => /[{};]\s*$|^\s*[})\]]/.test(l) || /^(\t| {2,})\S/.test(l)).length / lines.length
  s.code += structural * 3
  if (s.json >= 8) s.code = Math.min(s.code, 4)

  // Prose — long lines with sentences.
  const sentenceLines = lines.filter((l) => /[a-zà-ÿ]{2,}[.!?]["')]?(\s|$)/.test(l) && l.split(/\s+/).length >= 8).length
  s.prose += (sentenceLines / lines.length) * 5
  return s
}
