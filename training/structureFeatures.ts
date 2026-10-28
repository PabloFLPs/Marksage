/**
 * Featurizer 3 — for the structure model (training/train-structure.ts). Shared by the trainer and the app,
 * like features.ts. The input is the candidate line with up to two lines of context on each side, the
 * candidate marked by a leading U+0001 (see `structureInput`):
 *
 *   "Requisitos:\n\u0001-Conhecimento em Git;\n-Inglês avançado"
 *
 * It becomes a *set* of hashed features:
 *   K:kind      the near-miss marker: dash, star, plus, num., num), numdash, hash1–6, bold, glyph, check, wiki
 *   I:…         indentation of the line          A:…  what follows the marker (upper, lower, digit, letter, or the symbol)
 *   W:word      words after the marker, folded   F:/L:  first and last word   T1:/T2:  first tokens, raw
 *   N:…         word count bucket                E:c  last character          S:…  shapes (url, /, :, =, $, `, flags,
 *               hashtags, permissions, separators, sentence end, colon end, …)
 *   C<p>:cat    each context line (p = -2, -1, +1, +2): blank, same marker, item, glyph, numbered, heading, bold,
 *               fence, table, quote, html, indented, code-like, url, prose, or none (edge of the document)
 *   CF<p>:word  the first word of the line just before / after       KC<p>:kind/cat  marker × neighbour
 */
import { hash, tokenize } from '../src/assist/model/features.ts'

export const MARK = '\u0001'
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const WORD = /\p{L}[\p{L}\p{N}'-]*/gu
const GLYPHS = '•◦▪▫▸►▹●○■□·‣⁃'
const DASHES = '–—'
const CHECKS = '✓✔☑✅'

/** Build the model input from the prefilter's context (±2 lines) and the candidate line. */
export function structureInput(context: string, line: string): string {
  const lines = context.split('\n')
  const i = lines.indexOf(line)
  if (i < 0) return MARK + line
  lines[i] = MARK + line
  return lines.join('\n')
}

interface Marker {
  kind: string
  rest: string
}

/** Which near-miss marker a line starts with, and the text after it. */
export function markerOf(line: string): Marker {
  const t = line.replace(/^\s+/, '')
  let m: RegExpExecArray | null
  if ((m = /^\*\*(.*?)\*\*:?\s*$/.exec(t))) return { kind: 'bold', rest: m[1] }
  if ((m = /^(={2,6})\s*(.*?)\s*=*\s*$/.exec(t))) return { kind: 'wiki', rest: m[2] }
  if ((m = /^(#{1,6})(.*)$/.exec(t))) return { kind: 'hash' + m[1].length, rest: m[2] }
  if ((m = /^(\d{1,3})([.)])(.*)$/.exec(t))) return { kind: 'num' + m[2], rest: m[3] }
  if ((m = /^(\d{1,3}) ?-(.*)$/.exec(t))) return { kind: 'numdash', rest: m[2] }
  const c = String.fromCodePoint(t.codePointAt(0) ?? 32)
  if (GLYPHS.includes(c)) return { kind: 'glyph', rest: t.slice(c.length) }
  if (DASHES.includes(c)) return { kind: 'emdash', rest: t.slice(c.length) }
  if (CHECKS.includes(c)) return { kind: 'check', rest: t.slice(c.length).replace(/^\uFE0F/, '') }
  if (c === '-') return { kind: 'dash', rest: t.slice(1) }
  if (c === '*') return { kind: 'star', rest: t.slice(1) }
  if (c === '+') return { kind: 'plus', rest: t.slice(1) }
  return { kind: 'none', rest: t }
}

/** A context line, as one coarse category. `kind` is the candidate's marker (for "same marker"). */
function category(raw: string | undefined, kind: string): string {
  if (raw === undefined) return 'none'
  const t = raw.trim()
  if (!t) return 'blank'
  if (/^(`{3,}|~{3,})/.test(t)) return 'fence'
  if (/^ {4,}|^\t/.test(raw) && !/^\s*([-*+]|\d+[.)])\s/.test(raw)) return 'indented'
  if (/^[-*+]\s+\S/.test(t)) return 'item'
  if (/^\d{1,3}[.)]\s+\S/.test(t)) return 'numbered'
  if (/^#{1,6}\s+\S/.test(t)) return 'heading'
  if (/^\|.*\||^[^|]+\|[^|]+\|/.test(t)) return 'table'
  if (/^>/.test(t)) return 'quote'
  if (/^<\/?[a-zA-Z]/.test(t)) return 'html'
  if (/^<?https?:\/\/\S+>?$/.test(t)) return 'url'
  const m = markerOf(raw)
  if (m.kind !== 'none' && m.kind === kind && m.rest && !/^\s/.test(m.rest)) return 'same'
  if (m.kind === 'bold') return 'bold'
  if (m.kind === 'glyph' || m.kind === 'check' || m.kind === 'emdash') return 'glyph'
  const sym = (t.match(/[{}();=<>[\]$&|\\]/g) ?? []).length
  if (sym >= 3 || /[;{}]$/.test(t) || /^[$#>] \S/.test(t)) return 'code'
  return 'prose'
}

function bucket(n: number): string {
  return n <= 2 ? String(n) : n <= 5 ? '3-5' : n <= 10 ? '6-10' : n <= 20 ? '11-20' : '21+'
}

export function structureFeatureStrings(input: string): Set<string> {
  const out = new Set<string>()
  const lines = input.slice(0, 2000).replace(/\r\n?/g, '\n').split('\n')
  let at = lines.findIndex((l) => l.startsWith(MARK))
  if (at < 0) at = 0
  const raw = lines[at].replace(MARK, '')
  const { kind, rest } = markerOf(raw)
  out.add('K:' + kind)
  const ws = /^[ \t]*/.exec(raw)![0]
  out.add('I:' + (ws.includes('\t') ? 't' : ws.length === 0 ? '0' : ws.length < 4 ? '1' : '4'))

  const r = rest.replace(/^\uFE0F/, '')
  const first = r.codePointAt(0)
  const fc = first === undefined ? '' : String.fromCodePoint(first)
  out.add('A:' + (!fc ? 'end' : /\s/.test(fc) ? 'space' : /\p{Lu}/u.test(fc) ? 'upper' : /\p{Ll}/u.test(fc) ? 'lower' : /\p{N}/u.test(fc) ? 'digit' : /\p{L}/u.test(fc) ? 'letter' : fc))
  const body = r.trim()
  const words = fold(body.replace(/`[^`]*`/g, ' ')).match(WORD) ?? []
  out.add('N:' + bucket(words.length))
  if (words.length) {
    out.add('F:' + words[0])
    out.add('L:' + words[words.length - 1])
  }
  const tags = kind.startsWith('hash') && /^[\p{L}\p{N}_]+(\s+#[\p{L}\p{N}_]+)+\s*$/u.test(body)
  if (!tags) for (const w of words.slice(0, 12)) out.add('W:' + w)
  const toks = tokenize(body)
  if (toks[0]) out.add('T1:' + toks[0].toLowerCase())
  if (toks[1]) out.add('T2:' + toks[1].toLowerCase())
  const last = body.at(-1) ?? ''
  out.add('E:' + (/\p{L}/u.test(last) ? 'a' : /\p{N}/u.test(last) ? '0' : last))

  const S = (name: string, on: boolean) => on && out.add('S:' + name)
  /** A decisive shape counts three times: the model averages its clues, so one clue among twenty is easily drowned. */
  const S3 = (name: string, on: boolean) => on && ['S:', 'S2:', 'S3:'].forEach((p) => out.add(p + name))
  S('url', /https?:\/\/|www\./.test(body))
  S('slash', /\//.test(body))
  S('colon', /:/.test(body))
  S3('colonEnd', /:\s*(\*\*)?$/.test(raw.trim()))
  S('eq', /=/.test(body))
  S('dollar', /\$/.test(body))
  S('tick', /`/.test(body))
  S('brace', /[{}]/.test(body))
  S('angle', /[<>]/.test(body))
  S('pipe', /\|/.test(body))
  S('backslash', /\\/.test(body))
  S('semicolonEnd', /;$/.test(body))
  S3('sentenceEnd', /[.!?。！？]$/.test(body))
  S('flagInside', /(^|\s)--?[a-z][\w-]*/.test(body))
  S3('hashtags', (body.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length >= 2 || (kind.startsWith('hash') && /\s#[\p{L}\p{N}_]/u.test(body)))
  S3('allHashtags', kind.startsWith('hash') && /^[\p{L}\p{N}_]+(\s+#[\p{L}\p{N}_]+)*\s*$/u.test(body))
  S3('perms', /^[rwxsStT-]{9}/.test(body) || /^[rwxsStT-]{8,9}\s/.test(r))
  S3('separators', (body.match(/\s[•·|–—]\s/g) ?? []).length >= 2)
  S('link', /\[[^\]]+\]\([^)]+\)/.test(body))
  S('linkOnly', /^\[[^\]]*\]\([^)]*\)$/.test(body))
  S('emphasis', /^\*[^*]+\*/.test(r) || /\*\s*$/.test(body))
  S('digitsOnly', /^[\d\s.,:/-]+$/.test(body))
  S('allCaps', body.length > 3 && body === body.toUpperCase() && /\p{Lu}/u.test(body))
  S3('identifier', /^[\w$]+([._:][\w$]+)+$/.test(body))
  S('cjk', /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(body))
  S('long', body.length > 120)

  for (const p of [-2, -1, 1, 2]) {
    const cat = category(lines[at + p], kind)
    out.add(`C${p}:${cat}`)
    if (p === -1 || p === 1) {
      out.add(`KC${p}:${kind}/${cat}`)
      const cw = fold(lines[at + p] ?? '').match(WORD)?.[0]
      if (cw) out.add(`CF${p}:${cw}`)
      const cl = (lines[at + p] ?? '').trim()
      if (/^\s*(<img\b|!\[)/i.test(cl)) out.add(`C${p}:image`)
    }
  }
  return out
}

export function structureFeatureIds(input: string, buckets: number): Uint32Array {
  const ids = new Set<number>()
  for (const f of structureFeatureStrings(input)) ids.add(hash(f) % buckets)
  return Uint32Array.from(ids)
}
