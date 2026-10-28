/**
 * Structure dataset → training/data/structure.jsonl
 *   node --experimental-strip-types training/build-structure.ts
 *
 * The question the structure model answers: "is this near-miss line a list item or heading that lost its
 * marker's space (or was written with a look-alike marker)?" — yes / no. Reads the Markdown cloned by
 * collect.ts. Every example is a window of up to ±2 lines exactly as the app's prefilter builds it
 * (src/assist/prefilter.ts), and is kept only if the prefilter really flags that line, with the right kind.
 *
 * yes — real list items and headings with the near-miss put back in: "- item" → "-item" / "• item",
 *       "1. item" → "1.item" / "1- item", "## Title" → "##Title" / "**Title**". Neighbouring items of the same
 *       list get the same treatment most of the time (people who skip the space skip it on every line).
 * no  — real look-alikes: lines the prefilter flags in the documentation's prose (footnotes, flags, wrapped
 *       "-1 …", "#include", …); bold-only lines (noisy on purpose: some really are headings); lines inside code
 *       blocks that would be flagged if pasted without the fence (CLI help, `ls -l`, diff, CSS, `#` comments…);
 *       and two small synthetic groups the documentation never has — hashtag lines and "-Name" signatures —
 *       built from real heading words and author names.
 *
 * Split by repo like the other models: splits.json dev → dev, test + sources-test2.json → test, the rest → train.
 */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Source } from './collect.ts'
import { fencesIn } from './collect.ts'
import { rng } from './fasttext.ts'
import { findStructureCandidates, splitLines, type StructureKind } from '../src/assist/prefilter.ts'
import { structureInput } from './structureFeatures.ts'

const ROOT = new URL('.', import.meta.url).pathname
const REPOS = join(ROOT, 'data/repos')

/** Kinds the model answers. `heading-wiki` and `link-space` stay with the rules. */
export const MODEL_STRUCTURE_KINDS: StructureKind[] = ['list-nospace', 'list-glyph', 'ordered-nospace', 'ordered-dash', 'heading-nospace', 'heading-bold']

export interface StructureRow {
  y: 0 | 1
  kind: StructureKind
  /** pos = real item made a near-miss; prose / bold / code = real look-alike; synthetic = hashtag or signature line. */
  src: 'pos' | 'prose' | 'bold' | 'code' | 'synthetic'
  input: string
  repo: string
  file: string
  line: number
  split: 'train' | 'dev' | 'test'
}

const POS_PER_REPO = 60 // per kind
const NEG_PER_REPO = 80 // per source group
const GLYPH_SET = ['•', '•', '•', '●', '·', '▪', '◦', '–', '—', '✔️', '✅', '✓']

if (process.argv[1] === fileURLToPath(import.meta.url)) build()

function build() {
  const read = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))
  const sources: Source[] = [...read('sources.json').sources, ...read('sources-test2.json').sources].filter((s: Source) => !s.code)
  const splits = read('splits.json') as { dev: string[]; test: string[] }
  const splitOf = (s: Source): StructureRow['split'] =>
    splits.dev.includes(s.repo) ? 'dev' : splits.test.includes(s.repo) || s.split === 'test2' ? 'test' : 'train'
  const rand = rng(1)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

  function* walk(dir: string): Generator<string> {
    for (const f of readdirSync(dir).sort()) {
      if (f === '.git' || f === 'node_modules') continue
      const p = join(dir, f)
      const st = lstatSync(p)
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) yield* walk(p)
      else if (/\.(md|mdx|markdown)$/i.test(p) && st.size < 1_500_000) yield p
    }
  }

  const rows: StructureRow[] = []
  const seen = new Set<string>()
  const headingWords: string[] = []
  const authors: string[] = []
  const counts: Record<string, number> = {}

  /** The prefilter's own window and candidate for line `i` of `lines`, if it flags that line as `kind`. */
  function exampleAt(lines: string[], i: number, kind: StructureKind): string | null {
    const a = Math.max(0, i - 2)
    const win = lines.slice(a, i + 3)
    const start = win.slice(0, i - a).join('\n').length + (i > a ? 1 : 0)
    const c = findStructureCandidates(win.join('\n')).find((x) => x.lineStart === start)
    if (!c || c.kind !== kind) return null
    return structureInput(c.context, c.text)
  }

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
    const room = (k: string, cap: number) => (per[k] ?? 0) < cap
    const add = (r: Omit<StructureRow, 'repo' | 'split'>, group: string, cap: number) => {
      if (!room(group, cap)) return
      const key = split + '|' + r.input
      if (seen.has(key)) return
      seen.add(key)
      per[group] = (per[group] ?? 0) + 1
      counts[`${r.y ? 'yes' : 'no'} ${r.src} ${r.kind}`] = (counts[`${r.y ? 'yes' : 'no'} ${r.src} ${r.kind}`] ?? 0) + 1
      rows.push({ ...r, repo: s.repo, split })
    }

    for (const p of files) {
      const text = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n')
      const file = relative(dir, p)
      const lines = text.split('\n')
      const meta = splitLines(text)
      const author = /^author:\s*["']?([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})["']?\s*$/m.exec(text.slice(0, 600))
      if (author && authors.length < 3000 && !/\b(The|Team|Authors?|Maintainers|Contributors)\b/.test(author[1])) authors.push(author[1])

      // no — the prose look-alikes the prefilter flags (weak: a few are real mistakes, see training/README.md)
      for (const c of findStructureCandidates(text)) {
        if (!MODEL_STRUCTURE_KINDS.includes(c.kind)) continue
        const i = text.slice(0, c.lineStart).split('\n').length - 1
        const bold = c.kind === 'heading-bold'
        add({ y: 0, kind: c.kind, src: bold ? 'bold' : 'prose', input: structureInput(c.context, c.text), file, line: i + 1 }, bold ? 'bold' : 'prose', bold ? NEG_PER_REPO : 400)
      }

      // yes — real items and headings, made into near-misses
      for (let i = 0; i < lines.length; i++) {
        if (meta[i].inCode) continue
        const t = lines[i]
        let m: RegExpExecArray | null
        let kind: StructureKind | null = null
        let make: ((l: string) => string | null) | null = null
        if ((m = /^(#{1,6}) +(\S.*?)\s*#*\s*$/.exec(t))) {
          const title = m[2]
          if (headingWords.length < 20000) headingWords.push(...title.split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]{3,12}$/.test(w)).slice(0, 3))
          if (rand() < 0.5 && m[1].length >= 2 && m[1].length <= 4 && title.split(/\s+/).length <= 10 && !/[*`]/.test(title)) {
            kind = 'heading-bold'
            const blankBefore = i > 0 && lines[i - 1].trim() === ''
            if (!blankBefore) continue
            const out = lines.slice()
            out[i] = `**${title}**`
            for (let j = i - 2; j <= i + 2; j++) if (j !== i && j >= 0 && j < out.length && /^#{2,4} +\S/.test(out[j]) && rand() < 0.5) out[j] = out[j].replace(/^#{2,4} +(.*?)\s*#*\s*$/, '**$1**')
            const ex = exampleAt(out, i, kind)
            if (ex) add({ y: 1, kind, src: 'pos', input: ex, file, line: i + 1 }, 'pos:' + kind, POS_PER_REPO)
            continue
          }
          kind = 'heading-nospace'
          make = (l) => (/^#{1,6} +\S/.test(l) ? l.replace(/^(#{1,6}) +/, '$1') : null)
        } else if ((m = /^(\s*)([-*+]) +(?=\S)/.exec(t)) && !/^\s*[-*+] +[-*+]/.test(t)) {
          const glyph = rand() < 0.4 ? pick(GLYPH_SET) : null
          kind = glyph ? 'list-glyph' : 'list-nospace'
          const spacer = glyph ? pick([' ', ' ', '  ', '\t', '']) : ''
          make = (l) => {
            const n = /^(\s*)([-*+]) +(?=\S)/.exec(l)
            if (!n) return null
            return glyph ? `${n[1]}${glyph}${spacer || (glyph.length > 1 ? ' ' : '')}${l.slice(n[0].length)}` : `${n[1]}${n[2]}${l.slice(n[0].length)}`
          }
        } else if ((m = /^(\s*)(\d{1,3})([.)]) +(?=\S)/.exec(t))) {
          const dash = rand() < 0.35
          kind = dash ? 'ordered-dash' : 'ordered-nospace'
          const sep = pick(['- ', '- ', ' - ', '-  '])
          make = (l) => {
            const n = /^(\s*)(\d{1,3})([.)]) +(?=\S)/.exec(l)
            if (!n) return null
            return dash ? `${n[1]}${n[2]}${sep}${l.slice(n[0].length)}` : `${n[1]}${n[2]}${n[3]}${l.slice(n[0].length)}`
          }
        }
        if (!kind || !make || !room('pos:' + kind, POS_PER_REPO)) continue
        const out = lines.slice()
        out[i] = make(t)!
        const consistent = kind === 'list-glyph' ? 0.9 : 0.5
        for (let j = i - 2; j <= i + 2; j++) {
          if (j === i || j < 0 || j >= out.length || meta[j].inCode) continue
          const r = rand() < consistent ? make(out[j]) : null
          if (r) out[j] = r
        }
        const ex = exampleAt(out, i, kind)
        if (ex) add({ y: 1, kind, src: 'pos', input: ex, file, line: i + 1 }, 'pos:' + kind, POS_PER_REPO)
      }

      // no — code-block lines that would be flagged if the block were pasted without its fence
      for (const f of fencesIn(text)) {
        const body = f.body
        for (const c of findStructureCandidates(body)) {
          if (!MODEL_STRUCTURE_KINDS.includes(c.kind) || c.kind === 'heading-bold') continue
          const i = body.slice(0, c.lineStart).split('\n').length - 1
          add({ y: 0, kind: c.kind, src: 'code', input: structureInput(c.context, c.text), file, line: f.line + 1 + i }, 'code', NEG_PER_REPO)
        }
      }
    }
  }

  // no — synthetic look-alikes the documentation never has: hashtag lines and "-Name" signatures, after real text
  const prose = rows.filter((r) => r.y === 1 && r.kind === 'list-nospace')
  const synth = (split: StructureRow['split'], n: number) => {
    const pool = prose.filter((r) => r.split === split)
    for (let k = 0; k < n && pool.length && headingWords.length; k++) {
      const before = pick(pool).input.split('\n').filter((l) => !l.startsWith('\u0001')).slice(0, 2)
      const hashtags = Array.from({ length: 2 + Math.floor(rand() * 10) }, () => {
        const w = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => pick(headingWords)).map((x) => x[0].toUpperCase() + x.slice(1))
        return '#' + w.join('')
      }).join(' ')
      const name = authors.length ? pick(authors) : 'Alex'
      const first = name.split(' ')[0]
      const sign = pick([`-${first}`, `-${first}`, `-${name}`, `— ${name}`, `– ${first}`, `-the ${pick(['team', 'maintainers', 'devs'])}`, `-${first.toLowerCase()}`])
      for (const [kind, line, ctx] of [
        ['heading-nospace', hashtags, [...before, '', '\u0001' + hashtags]],
        [/^[—–]/.test(sign) ? 'list-glyph' : 'list-nospace', sign, [...before.slice(-1), pick(['Thanks,', 'Thanks!', 'Cheers,', 'Regards,', 'Obrigado,', 'Thanks in advance,', 'Best,', 'Cheers', '']), '\u0001' + sign, ...(rand() < 0.5 ? ['', pick(before) ?? ''] : [])]],
      ] as [StructureKind, string, string[]][]) {
        const win = ctx.join('\n')
        const c = findStructureCandidates(win.replace('\u0001', '')).find((x) => x.text === line)
        if (!c || c.kind !== kind) continue
        rows.push({ y: 0, kind, src: 'synthetic', input: structureInput(c.context, c.text), repo: 'synthetic', file: '', line: 0, split })
        counts[`no synthetic ${kind}`] = (counts[`no synthetic ${kind}`] ?? 0) + 1
      }
    }
  }
  synth('train', 1500)
  synth('dev', 150)

  writeFileSync(join(ROOT, 'data/structure.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const by = (sp: string) => rows.filter((r) => r.split === sp)
  for (const sp of ['train', 'dev', 'test']) console.log(`${sp}: ${by(sp).length} (${by(sp).filter((r) => r.y).length} yes)`)
  for (const [k, v] of Object.entries(counts).sort()) console.log(String(v).padStart(7), k)
}
