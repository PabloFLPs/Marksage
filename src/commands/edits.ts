import { alignedToTable, csvToTable, toCodeBlock, tsvToTable } from '../assist/convert'
import { csvRecords, nonEmptyLines, splitCsvLine } from '../assist/heuristics/paste'
import { NOT_AN_ITEM } from '../assist/heuristics/structure'

/**
 * The palette's Markdown edits, as pure functions: the text and the selection in, one replacement out (or null when
 * there's nothing to change). App applies it as a single `insertText`, so ⌘Z undoes it in one step. Line edits act
 * on every line the selection touches (the caret's line when nothing is selected); the others need a selection.
 */

export interface EditInput {
  text: string
  /** Selection start and end (equal when nothing is selected). */
  start: number
  end: number
}

export interface TextEdit {
  from: number
  to: number
  insert: string
  /** The selection afterwards. */
  select: [number, number]
}

export type EditTransform = (input: EditInput) => TextEdit | null

/** The lines the selection touches: a selection ending at the start of a line doesn't take that line. */
export function touchedLines(text: string, start: number, end: number): { from: number; to: number } {
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end
  const from = text.lastIndexOf('\n', start - 1) + 1
  const next = text.indexOf('\n', last)
  return { from, to: next === -1 ? text.length : next }
}

/** Replace the touched lines; the new block stays selected, or the caret goes to its end when nothing was. */
function onLines(transform: (lines: string[]) => string[] | null): EditTransform {
  return ({ text, start, end }) => {
    const { from, to } = touchedLines(text, start, end)
    const before = text.slice(from, to)
    const lines = transform(before.split('\n'))
    if (!lines) return null
    const insert = lines.join('\n')
    if (insert === before) return null
    return { from, to, insert, select: start === end ? [from + insert.length, from + insert.length] : [from, from + insert.length] }
  }
}

/** Replace the selected text exactly (needs a selection); the result stays selected. */
function onSelection(transform: (selected: string) => string | null): EditTransform {
  return ({ text, start, end }) => {
    if (start === end) return null
    const before = text.slice(start, end)
    const insert = transform(before)
    if (insert === null || insert === before) return null
    return { from: start, to: end, insert, select: [start, start + insert.length] }
  }
}

const blank = (line: string) => line.trim() === ''
const indentOf = (line: string) => /^\s*/.exec(line)?.[0] ?? ''

/** Any list marker: bullets, numbers, task boxes. */
const LIST_MARKER_RE = /^(\s*)(?:[-*+]\s+\[[ xX]\]\s+|[-*+•]\s+|\d{1,3}[.)]\s+)/
const BULLET_RE = /^\s*[-*+]\s+(?!\[[ xX]\]\s)/
const NUMBERED_RE = /^\s*\d{1,3}[.)]\s+/
const TASK_RE = /^\s*[-*+]\s+\[[ xX]\]\s+/
/** A marker missing its space ("-item", "*item", "+item") — not "--flag", "**bold**" or what Smart Assist knows isn't an item. */
const NEAR_MISS_RE = /^(\s*)[-*+](?=[^\s*+-])/
const nearMiss = (line: string) => NEAR_MISS_RE.test(line) && !NOT_AN_ITEM.some(([re]) => re.test(line.trim()))
/** The line without its list marker: a proper one, or one missing its space ("-item" → "item"; "-5 km" keeps its "-"). */
const stripMarker = (line: string) =>
  LIST_MARKER_RE.test(line) ? line.replace(LIST_MARKER_RE, '$1') : nearMiss(line) ? line.replace(NEAR_MISS_RE, '$1') : line

/**
 * Turn the lines into one kind of list — or, when every line already is that kind, back into plain lines. Indentation
 * stays (nested items keep their level); blank lines stay blank.
 */
function listToggle(isKind: RegExp, marker: (index: number) => string): EditTransform {
  return onLines((lines) => {
    const items = lines.filter((l) => !blank(l))
    if (!items.length) return null
    if (items.every((l) => isKind.test(l))) return lines.map((l) => (blank(l) ? l : stripMarker(l)))
    let n = 0
    return lines.map((l) => (blank(l) ? l : `${indentOf(l)}${marker(n++)}${stripMarker(l).trimStart()}`))
  })
}

export const bulletList = listToggle(BULLET_RE, () => '- ')
export const numberedList = listToggle(NUMBERED_RE, (i) => `${i + 1}. `)
export const taskList = listToggle(TASK_RE, () => '- [ ] ')

const HEADING_RE = /^(#{1,6})[ \t]+/

/**
 * A heading one level up (## → #) or down (# → ##). A plain line becomes a level-2 heading either way, the usual
 * section level. # stays # going up, ###### stays going down.
 */
function headingStep(step: -1 | 1): EditTransform {
  return onLines((lines) =>
    lines.map((l) => {
      if (blank(l)) return l
      const m = HEADING_RE.exec(l)
      if (!m) return `## ${l.trim()}`
      const level = Math.min(6, Math.max(1, m[1].length + step))
      return `${'#'.repeat(level)} ${l.slice(m[0].length)}`
    }),
  )
}

export const headingUp = headingStep(-1)
export const headingDown = headingStep(1)

/** Quote the lines — or, when every non-blank line is quoted, take one level of quoting off. */
export const quote = onLines((lines) => {
  const items = lines.filter((l) => !blank(l))
  if (!items.length) return null
  if (items.every((l) => /^\s*>/.test(l))) return lines.map((l) => l.replace(/^(\s*)> ?/, '$1'))
  return lines.map((l) => (blank(l) ? '>' : `> ${l}`))
})

/** A table from the selected lines: tab-separated, columns aligned with spaces, or comma-separated (in that order). */
export const linesToTable = onSelection((selected) => {
  const lines = nonEmptyLines(selected)
  if (lines.length < 2) return null
  if (lines.every((l) => l.includes('\t'))) return tsvToTable(selected)
  const aligned = alignedToTable(selected)
  if (aligned) return aligned
  const records = csvRecords(selected)
  if (records.length >= 2 && records.every((r) => splitCsvLine(r).length >= 2)) return csvToTable(selected)
  return null
})

/** The touched lines in a fenced code block, no language: Smart Assist then suggests one. */
export const codeBlock: EditTransform = (input) => {
  if (input.start === input.end) return null
  return onLines((lines) => toCodeBlock(lines.join('\n'), 'plaintext').split('\n'))(input)
}

/** Bold, italic, strikethrough, inline code, links and images become their plain text. */
export const removeInlineFormatting = onSelection((selected) =>
  selected
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(`+)([^`]+?)\1/g, '$2')
    .replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, '$2')
    .replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '$1')
    .replace(/(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g, '$1')
    .replace(/(?<![\w_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\w_])/g, '$1'),
)

/** The edits by name: the registry refers to them by name only, so they load with the editor, not the first page. */
export const EDITS = {
  linesToTable,
  bulletList,
  numberedList,
  taskList,
  headingUp,
  headingDown,
  quote,
  codeBlock,
  removeInlineFormatting,
} as const satisfies Record<string, EditTransform>

export type EditName = keyof typeof EDITS
