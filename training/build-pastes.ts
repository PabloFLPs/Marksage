/**
 * Paste-kind dataset → training/data/pastes.jsonl
 *   node --experimental-strip-types training/build-pastes.ts
 *
 * What someone pastes into the editor, labelled by where it came from — not by the rules:
 *   code   real fenced code blocks (the authors' language tag says it's code), JSON excluded
 *   json   real ```json blocks that parse; some minified, as an API response would be
 *   csv / tsv / table   real Markdown tables, turned back into the text a CSV export, a spreadsheet copy
 *          (cells joined by tabs) or a terminal (columns padded with spaces) would give; plus real ```csv / ```tsv blocks
 *   list   real Markdown lists as a browser copies them: one item per line, markers gone (or "•")
 *   prose  real paragraphs, rendered (links and code spans become their text)
 * Only pastes the app would ask about are kept (isPasteCandidate, and not already Markdown structure).
 * Split by repo like the other models: splits.json dev → dev, test + sources-test2.json → test, the rest → train.
 */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Source } from './collect.ts'
import { fencesIn } from './collect.ts'
import { infoTag, labelForTag } from './labels.ts'
import { rng } from './fasttext.ts'
import { isPasteCandidate, splitLines } from '../src/assist/prefilter.ts'
import { parseJsonLike } from '../src/assist/json.ts'
import type { PasteKind } from '../src/assist/questions.ts'

const ROOT = new URL('.', import.meta.url).pathname
const REPOS = join(ROOT, 'data/repos')
const PER_REPO = 25 // per kind

export interface PasteRow {
  label: PasteKind
  /** fence = a real block as written; table = from a real Markdown table; list / prose = rendered from real Markdown. */
  src: 'fence' | 'table' | 'list' | 'prose'
  text: string
  repo: string
  file: string
  line: number
  split: 'train' | 'dev' | 'test'
}

/** What a browser copy of rendered Markdown inline text gives: link text, code text, no emphasis marks. */
export function rendered(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_]([^*_\s][^*_]*)[*_](?=\W|$)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .trim()
}

/** Already Markdown structure — the app doesn't ask about these (features/smartPaste.ts). */
const MARKDOWN_START = /^\s*(\|.*\||```|~~~|#{1,6}\s|[-*+]\s)/

if (process.argv[1] === fileURLToPath(import.meta.url)) build()

function build() {
  const read = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))
  const sources: Source[] = [...read('sources.json').sources, ...read('sources-test2.json').sources].filter((s: Source) => !s.code)
  const splits = read('splits.json') as { dev: string[]; test: string[] }
  const splitOf = (s: Source): PasteRow['split'] =>
    splits.dev.includes(s.repo) ? 'dev' : splits.test.includes(s.repo) || s.split === 'test2' ? 'test' : 'train'
  const rand = rng(1)

  function* walk(dir: string): Generator<string> {
    for (const f of readdirSync(dir).sort()) {
      if (f === '.git' || f === 'node_modules') continue
      const p = join(dir, f)
      const st = lstatSync(p)
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) yield* walk(p)
      else if (/\.(md|markdown)$/i.test(p) && st.size < 1_500_000) yield p
    }
  }

  const rows: PasteRow[] = []
  const seen = new Set<string>()
  const counts: Record<string, number> = {}
  for (const s of sources) {
    const dir = join(REPOS, s.repo.replace('/', '__') + (s.wiki ? '.wiki' : ''))
    let files: string[]
    try {
      files = [...walk(dir)]
    } catch {
      continue
    }
    const split = splitOf(s)
    const per: Record<string, number> = {}
    const add = (label: PasteKind, src: PasteRow['src'], text: string, file: string, line: number) => {
      const key = `${label}:${src}`
      if ((per[key] ?? 0) >= PER_REPO) return
      if (!isPasteCandidate(text) || MARKDOWN_START.test(text)) return
      if (seen.has(text)) return
      seen.add(text)
      per[key] = (per[key] ?? 0) + 1
      counts[`${split} ${label} ${src}`] = (counts[`${split} ${label} ${src}`] ?? 0) + 1
      rows.push({ label, src, text, repo: s.repo, file, line, split })
    }

    for (const p of files) {
      const text = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n')
      const file = relative(dir, p)

      for (const f of fencesIn(text)) {
        const body = f.body.replace(/^\n+|\s+$/g, '')
        const n = body.split('\n').filter((l) => l.trim()).length
        if (n < 2 || n > 60 || /\{%|\{\{|\[!code/.test(body)) continue
        const tag = (infoTag(f.info) ?? '').toLowerCase()
        if (tag === 'csv') add('csv', 'fence', body, file, f.line)
        else if (tag === 'tsv') add('tsv', 'fence', body, file, f.line)
        const label = tag ? labelForTag(tag) : null
        if (!label || label === 'markdown' || label === 'plaintext') continue
        if (label === 'json') {
          const j = parseJsonLike(body)
          if (!j) continue
          add('json', 'fence', j.strict && rand() < 0.25 ? JSON.stringify(JSON.parse(body)) : body, file, f.line)
        } else add('code', 'fence', body, file, f.line)
      }

      const lines = text.split('\n')
      const meta = splitLines(text)
      for (let i = 0; i < lines.length; i++) {
        if (meta[i].inCode) continue
        // Markdown table: header, delimiter row, ≥ 2 body rows
        if (/^\s*\|?.*\|.*$/.test(lines[i]) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1] ?? '')) {
          let j = i + 2
          while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim()) j++
          const rowsMd = [lines[i], ...lines.slice(i + 2, j)]
          if (rowsMd.length >= 3) {
            const cells = rowsMd.map((r) => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => rendered(c.replace(/\\\|/g, '|'))))
            const w = cells[0].length
            if (w >= 2 && cells.every((c) => c.length === w) && cells.flat().some((c) => c)) {
              const pick = rand()
              if (pick < 0.34) add('csv', 'table', cells.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n'), file, i + 1)
              else if (pick < 0.67) add('tsv', 'table', cells.map((r) => r.join('\t')).join('\n'), file, i + 1)
              else {
                const widths = cells[0].map((_, k) => Math.max(...cells.map((r) => r[k].length)))
                const gutter = rand() < 0.5 ? '  ' : '   '
                const body = cells.map((r) => r.map((c, k) => (k < w - 1 ? c.padEnd(widths[k]) : c)).join(gutter).trimEnd())
                if (rand() < 0.3) body.splice(1, 0, widths.map((x) => '-'.repeat(Math.max(3, x))).join(gutter))
                if (cells.every((r) => r.every((c) => c && !/\s{2,}/.test(c)))) add('table', 'table', body.join('\n'), file, i + 1)
              }
            }
          }
          i = j
          continue
        }
        // Markdown list: ≥ 3 consecutive items at the same indent
        const item = /^(\s*)([-*+]|\d{1,3}[.)]) +(\S.*)$/.exec(lines[i])
        if (item && (i === 0 || !/^\s*([-*+]|\d{1,3}[.)]) +\S/.test(lines[i - 1]))) {
          const items: string[] = []
          let j = i
          for (; j < lines.length; j++) {
            const m = /^(\s*)([-*+]|\d{1,3}[.)]) +(\S.*)$/.exec(lines[j])
            if (!m || m[1] !== item[1]) break
            items.push(rendered(m[3]))
          }
          if (items.length >= 3 && items.length <= 30 && items.every((x) => x.length > 0 && x.length < 200)) {
            const bullet = rand() < 0.25 ? '• ' : ''
            add('list', 'list', items.map((x) => bullet + x).join('\n'), file, i + 1)
          }
          i = Math.max(i, j - 1)
          continue
        }
        // Paragraph: ≥ 2 lines of plain text (hard-wrapped), or one long line followed by another paragraph
        if (/^\p{L}/u.test(lines[i]) && (i === 0 || !lines[i - 1].trim())) {
          let j = i
          while (j < lines.length && lines[j].trim() && !meta[j].inCode && !/^\s*([-*+>|#]|\d+[.)]|<|!\[|```|~~~)/.test(lines[j])) j++
          const para = lines.slice(i, j).map(rendered)
          const words = para.join(' ').split(/\s+/).length
          if (words >= 15 && para.every((l) => l)) {
            let text = para.join('\n')
            // a single-line paragraph: paste it together with the next one, as a two-paragraph copy
            if (para.length === 1) {
              let k = j
              while (k < lines.length && !lines[k].trim()) k++
              let e = k
              while (e < lines.length && lines[e].trim() && /^\p{L}/u.test(lines[e]) && !meta[e].inCode) e++
              if (e > k) text += '\n\n' + lines.slice(k, e).map(rendered).join('\n')
            }
            add('prose', 'prose', text, file, i + 1)
          }
          i = Math.max(i, j - 1)
        }
      }
    }
  }
  writeFileSync(join(ROOT, 'data/pastes.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  for (const sp of ['train', 'dev', 'test']) console.log(`${sp}: ${rows.filter((r) => r.split === sp).length}`)
  for (const [k, v] of Object.entries(counts).sort()) console.log(String(v).padStart(7), k)
}
