/**
 * Featurizer 4 — for the paste-kind model (training/train-pastes.ts). Shared by the trainer and the app, like
 * features.ts. A pasted text becomes a *set* of hashed features — its shape far more than its words:
 *   J:…        parses as JSON (strict / with comments) or not        N:…  number of non-blank lines
 *   TAB:/TC:   tabs on every line, and how consistent their count is  CC:/CQ:/CL:/CW:  comma cells: consistency,
 *              quoted cells, average cell length, wordy cells          AL:…  columns aligned by 2+ space gutters
 *   BU:/SH:    bullet-marked lines, short lines without end punctuation  BL:  blank lines between lines
 *   WR:        hard-wrapped prose (a line continues the previous one mid-sentence)   SE:  sentence-like lines
 *   ST:        code structure (lines ending in { } ; or indented)     LEN: average line length
 *   F:tok      the first token of each line (first 30 lines)         E:c  the last character of each line
 *   T:tok      tokens of the first lines, for code and keys
 * Bucketed ratios ("…:0", "…:1" … "…:4") so the model can weigh evidence instead of thresholds.
 */
import { hash, tokenize } from '../src/assist/model/features.ts'
import { parseJsonLike } from '../src/assist/json.ts'
import { alignedColumns, csvRecords, nonEmptyLines, splitCsvLine } from '../src/assist/heuristics/paste.ts'

const BULLET = /^\s*([•·▪◦‣–—*+-]|\d{1,3}[.)]|[a-z][.)])\s+\S/
const ratioBucket = (x: number) => (x <= 0 ? 0 : x < 0.34 ? 1 : x < 0.67 ? 2 : x < 0.99 ? 3 : 4)
const sizeBucket = (n: number) => (n <= 2 ? n : n <= 4 ? '3-4' : n <= 8 ? '5-8' : n <= 20 ? '9-20' : '21+')

/** The most common count's share — 1 when every line has the same number of delimiters. */
function consistency(counts: number[]): number {
  const freq = new Map<number, number>()
  for (const c of counts) if (c >= 1) freq.set(c, (freq.get(c) ?? 0) + 1)
  return freq.size ? Math.max(...freq.values()) / counts.length : 0
}

export function pasteFeatureStrings(text: string): Set<string> {
  const out = new Set<string>()
  const src = text.slice(0, 4000).replace(/\r\n?/g, '\n')
  const lines = nonEmptyLines(src)
  const json = parseJsonLike(src)
  out.add('J:' + (json ? (json.strict ? 'strict' : 'loose') : 'none'))
  if (json) for (let i = 0; i < 3; i++) out.add(`J${i}:yes`) // decisive: counts three times among the averaged clues
  out.add('N:' + sizeBucket(lines.length))
  if (!lines.length) return out

  const tabbed = lines.filter((l) => l.includes('\t')).length / lines.length
  out.add('TAB:' + ratioBucket(tabbed))
  if (tabbed > 0.99) out.add('TC:' + ratioBucket(consistency(lines.map((l) => l.trim().split(/\t+/).length - 1))))

  const records = csvRecords(src)
  const cells = records.map((r) => splitCsvLine(r))
  const cc = records.length >= 2 ? consistency(cells.map((c) => c.length - 1)) : 0
  out.add('CC:' + ratioBucket(cc))
  if (cc > 0) {
    const flat = cells.flat()
    const avg = flat.reduce((a, c) => a + c.length, 0) / Math.max(1, flat.length)
    out.add('CL:' + (avg < 8 ? 0 : avg < 16 ? 1 : avg < 25 ? 2 : avg < 40 ? 3 : 4))
    out.add('CW:' + ratioBucket(flat.filter((c) => c.split(/\s+/).length > 5).length / Math.max(1, flat.length)))
    if (/(^|,)\s*"[^"]*"/.test(src)) out.add('CQ:yes')
    if (cc > 0.99 && records.length >= 3) out.add('CC2:all')
  }

  const cols = alignedColumns(lines)
  out.add('AL:' + (cols ? Math.min(cols.length, 5) : 0))
  if (lines.some((l) => /^[\s\-=+|:]+$/.test(l) && /-{3,}|={3,}/.test(l))) out.add('S:rule')

  out.add('BU:' + ratioBucket(lines.filter((l) => BULLET.test(l)).length / lines.length))
  out.add('SH:' + ratioBucket(lines.filter((l) => l.trim().length <= 60 && !/[.;:{}()=]\s*$/.test(l.trim())).length / lines.length))
  out.add('BL:' + (/\n\s*\n/.test(src.trim()) ? 'yes' : 'no'))
  const wrapped = lines.slice(1).filter((l, i) => {
    const prev = lines[i].trim()
    return prev.length >= 50 && !/[.!?:;)"'”»…]$/.test(prev) && /^[a-zà-ÿ(]/.test(l.trim())
  }).length
  out.add('WR:' + ratioBucket(wrapped / Math.max(1, lines.length - 1)))
  out.add('SE:' + ratioBucket(lines.filter((l) => /[a-zà-ÿ]{2,}[.!?]["')]?(\s|$)/.test(l) && l.split(/\s+/).length >= 8).length / lines.length))
  out.add('ST:' + ratioBucket(lines.filter((l) => /[{};]\s*$|^\s*[})\]]/.test(l) || /^(\t| {2,})\S/.test(l)).length / lines.length))
  const avgLen = lines.reduce((a, l) => a + l.trim().length, 0) / lines.length
  out.add('LEN:' + (avgLen < 20 ? 0 : avgLen < 40 ? 1 : avgLen < 80 ? 2 : avgLen < 160 ? 3 : 4))
  const words = lines.map((l) => l.trim().split(/\s+/).length)
  out.add('WPL:' + sizeBucket(Math.round(words.reduce((a, b) => a + b, 0) / words.length)))

  for (const l of lines.slice(0, 30)) {
    const t = l.trim()
    const toks = tokenize(t)
    if (toks[0]) out.add('F:' + toks[0].toLowerCase())
    out.add('E:' + (/\p{L}/u.test(t.at(-1) ?? '') ? 'a' : /\p{N}/u.test(t.at(-1) ?? '') ? '0' : t.at(-1)))
  }
  for (const l of lines.slice(0, 12)) for (const tok of tokenize(l).slice(0, 12)) out.add('T:' + tok.toLowerCase())
  return out
}

export function pasteFeatureIds(text: string, buckets: number): Uint32Array {
  const ids = new Set<number>()
  for (const f of pasteFeatureStrings(text)) ids.add(hash(f) % buckets)
  return Uint32Array.from(ids)
}
