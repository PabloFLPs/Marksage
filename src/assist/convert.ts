import { SEPARATOR_RE, alignedColumns, csvRecords, nonEmptyLines, splitCsvLine } from './heuristics/paste.ts'

const escapeCell = (c: string) => c.replace(/\|/g, '\\|').trim()

export function rowsToTable(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length))
  const norm = rows.map((r) => [...r, ...Array(width - r.length).fill('')].map(escapeCell))
  const [head, ...body] = norm
  const line = (r: string[]) => `| ${r.join(' | ')} |`
  return [line(head), line(head.map(() => '---')), ...body.map(line)].join('\n')
}

export function csvToTable(text: string): string {
  return rowsToTable(csvRecords(text).map(splitCsvLine))
}

/** Spreadsheet TSV keeps empty cells (`a\t\tc`); files padded with tab runs (/etc/services) don't. */
export function tsvToTable(text: string): string {
  const lines = nonEmptyLines(text)
  const exact = lines.map((l) => l.split('\t'))
  const consistent = exact.every((r) => r.length === exact[0].length)
  return rowsToTable(consistent ? exact : lines.map((l) => l.trim().split(/\t+/)))
}

export function alignedToTable(text: string): string | null {
  const lines = nonEmptyLines(text).filter((l) => !SEPARATOR_RE.test(l))
  const starts = alignedColumns(lines)
  if (!starts) return null
  return rowsToTable(
    lines.map((l) => starts.map((s, i) => l.slice(s, starts[i + 1] ?? undefined).trim())),
  )
}

export function toList(text: string): string {
  return nonEmptyLines(text)
    .map((l) => `- ${l.trim().replace(/^([•·▪◦‣–—*+-]|\d{1,3}[.)]|[a-z][.)])\s+/, '')}`)
    .join('\n')
}

export function toCodeBlock(text: string, lang: string): string {
  const body = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  const fence = body.includes('```') ? '````' : '```'
  return `${fence}${lang === 'plaintext' ? '' : lang}\n${body}\n${fence}`
}
