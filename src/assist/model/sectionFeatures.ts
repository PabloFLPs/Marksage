/**
 * Featurizer 2 — for the section-type model (training/train-sections.ts). Shared by the trainer and
 * the app, like features.ts. A section's Markdown becomes a *set* of hashed features:
 *   W:word    every prose word, lower-cased, accents folded ("instalacao" = "instalação")
 *   B:a b     adjacent prose words
 *   F:word    the first word of each prose line / list item ("run", "added", "fixed", "see")
 *   C:tok     tokens inside code blocks, lower-cased ("npm", "install", "--save", "import")
 *   L:lang    the language of each code block ("bash", "yaml", "json")
 *   S:…       shape: code block, table, list, numbered list, shell prompt, version number, date,
 *             PR / issue reference, link, image, quote, and a length bucket
 */
import { hash, tokenize } from './features.ts'

export const SECTION_MAX_CHARS = 2000
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`{]*)/
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const WORD = /\p{L}[\p{L}\p{N}'-]*/gu

export function sectionFeatureStrings(md: string): Set<string> {
  const out = new Set<string>()
  const text = md.slice(0, SECTION_MAX_CHARS).replace(/\r\n?/g, '\n')
  let fence: string | null = null
  let chars = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const f = FENCE.exec(raw)
    if (f) {
      if (fence === null) {
        fence = f[1][0]
        out.add('S:code')
        if (f[2]) out.add('L:' + f[2].toLowerCase())
      } else if (f[1][0] === fence) fence = null
      continue
    }
    if (!line) continue
    if (fence !== null) {
      if (/^[$>#] \S/.test(line)) out.add('S:prompt')
      for (const t of tokenize(line).slice(0, 12)) if (/[\p{L}-]/u.test(t)) out.add('C:' + t.toLowerCase())
      continue
    }
    chars += line.length
    if (/^\|/.test(line)) out.add('S:table')
    if (/^[-*+]\s/.test(line)) out.add('S:list')
    if (/^\d+[.)]\s/.test(line)) out.add('S:olist')
    if (/^>/.test(line)) out.add('S:quote')
    if (/\bv?\d+\.\d+\.\d+\b/.test(line)) out.add('S:version')
    if (/\b(19|20)\d\d-\d\d-\d\d\b/.test(line)) out.add('S:date')
    if (/(^|[\s(])#\d+\b|\/pull\/\d+|\/issues\/\d+/.test(line)) out.add('S:ref')
    if (/!\[[^\]]*\]\(/.test(line)) out.add('S:img')
    else if (/\[[^\]]+\]\([^)]+\)|https?:\/\//.test(line)) out.add('S:link')
    const prose = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, (_, c: string) => {
        for (const t of tokenize(c).slice(0, 6)) if (/[\p{L}-]/u.test(t)) out.add('C:' + t.toLowerCase())
        return ' '
      })
      .replace(/^(?:[-*+>|]|\d+[.)])\s*/, '')
    const words = fold(prose).match(WORD) ?? []
    if (words.length) out.add('F:' + words[0])
    for (let i = 0; i < words.length; i++) {
      out.add('W:' + words[i])
      if (i + 1 < words.length) out.add('B:' + words[i] + ' ' + words[i + 1])
    }
  }
  out.add('S:len' + (chars < 120 ? 0 : chars < 400 ? 1 : chars < 1000 ? 2 : 3))
  return out
}

export function sectionFeatureIds(md: string, buckets: number): Uint32Array {
  const ids = new Set<number>()
  for (const f of sectionFeatureStrings(md)) ids.add(hash(f) % buckets)
  return Uint32Array.from(ids)
}
