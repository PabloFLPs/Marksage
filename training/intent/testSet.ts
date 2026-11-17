/**
 * Pablo's intent test set, read from Markdown (test.v1.md, written in Marksage from test.v1.template.md):
 *
 *   ## pdf            ← a command id of src/commands/registry.ts, or `none`
 *   ### en            ← `en` or `pt-BR`
 *   - save as pdf     ← one query per list item; "(real) " in front marks something actually typed
 *
 * Everything else (the title line, quotes, comments, empty items) is ignored. An unknown id or language stops the
 * read, so a typo in a heading can't silently drop rows.
 */
import { readFileSync } from 'node:fs'

export interface TestRow {
  q: string
  lang: 'en' | 'pt-BR'
  id: string
  src: 'written' | 'real'
}

export function parseTestSet(markdown: string, ids: ReadonlySet<string>): TestRow[] {
  const rows: TestRow[] = []
  let id: string | null = null
  let lang: TestRow['lang'] | null = null
  markdown.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const h2 = /^##\s+(\S+)/.exec(line)
    const h3 = /^###\s+(\S+)/.exec(line)
    if (h2 && !line.startsWith('###')) {
      if (!ids.has(h2[1]) && h2[1] !== 'none') throw new Error(`line ${i + 1}: "${h2[1]}" isn't a command id`)
      id = h2[1]
      lang = null
      return
    }
    if (h3) {
      if (h3[1] !== 'en' && h3[1] !== 'pt-BR') throw new Error(`line ${i + 1}: "${h3[1]}" isn't en or pt-BR`)
      lang = h3[1]
      return
    }
    const item = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (!item || !id || !lang) return
    const real = /^\(real\)\s*/i.exec(item[1])
    const q = (real ? item[1].slice(real[0].length) : item[1]).trim()
    if (q) rows.push({ q, lang, id, src: real ? 'real' : 'written' })
  })
  return rows
}

export function loadTestSet(path: string, ids: ReadonlySet<string>): TestRow[] {
  return parseTestSet(readFileSync(path, 'utf8'), ids)
}
