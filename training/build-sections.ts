/**
 * Section-type dataset → training/data/sections.jsonl
 *   node --experimental-strip-types training/build-sections.ts
 *
 * Reads the Markdown already cloned by collect.ts (training/data/repos, both source lists) and cuts
 * every file into sections with the app's own splitter (src/assist/sections.ts). A section gets a
 * label only when its heading matches exactly one type under the strict heading rule ("Installation"
 * → setup); the text under it — without the heading — is what the model learns from, so it can type
 * sections whose headings say nothing ("Notes", "Step 2"). Weak labels, so the scores are agreement
 * with the heading rule on repos never trained on, not a hand-checked accuracy.
 *
 * Split by repo, matching the language model: dev repos from splits.json → dev; test repos from
 * splits.json and every repo in sources-test2.json → test; the rest → train. Within a split, duplicate
 * texts are dropped, and a repo contributes ≤ PER_REPO sections per type so big doc sites don't dominate.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Source } from './collect.ts'
import { headingType, isNavigationHeading, meaningfulChars, MIN_SECTION_CHARS, splitDocSections, SECTION_TYPES, type SectionType } from '../src/assist/sections.ts'

const ROOT = new URL('.', import.meta.url).pathname
const REPOS = join(ROOT, 'data/repos')
const PER_REPO = 60
export const MAX_SECTION_CHARS = 2000

/** Sections whose heading names no type — mostly topic content ("Arrays", "Amazon S3"). A sample of them
 * is the "other" class, so the model can say "no type" instead of forcing one (some really do have a
 * type, so "other" is noisy by design: it trades a little recall for precision). */
export const OTHER = 'other'
const OTHER_PER_REPO = 40
const NAV_PER_REPO = 10

export interface SectionRow {
  label: SectionType | typeof OTHER
  heading: string
  text: string
  repo: string
  file: string
  line: number
  split: 'train' | 'dev' | 'test'
}

/** The text a section is judged on: what's directly under the heading, capped. Shared with the app. */
export const sectionInput = (own: string) => own.slice(0, MAX_SECTION_CHARS)

if (process.argv[1] === fileURLToPath(import.meta.url)) build()

function build() {
  const read = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))
  const sources: Source[] = [...read('sources.json').sources, ...read('sources-test2.json').sources].filter((s: Source) => !s.code)
  const splits = read('splits.json') as { dev: string[]; test: string[] }
  const splitOf = (s: Source): SectionRow['split'] =>
    splits.dev.includes(s.repo) ? 'dev' : splits.test.includes(s.repo) || s.split === 'test2' ? 'test' : 'train'

  function* walk(dir: string): Generator<string> {
    for (const f of readdirSync(dir).sort()) {
      if (f === '.git' || f === 'node_modules') continue
      const p = join(dir, f)
      const st = lstatSync(p)
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) yield* walk(p)
      else if (st.size < 1_500_000 && /\.(md|mdx|markdown)$/i.test(f)) yield p
    }
  }

  const rows: SectionRow[] = []
  const seen = new Set<string>()
  for (const s of [...sources].sort((a, b) => a.repo.localeCompare(b.repo))) {
    const dir = join(REPOS, s.repo.replace('/', '__') + (s.wiki ? '.wiki' : ''))
    if (!existsSync(dir)) continue
    const split = splitOf(s)
    const perType = new Map<string, number>()
    const others: SectionRow[] = []
    const add = (r: SectionRow, cap: number) => {
      const key = split + '\0' + r.text.replace(/\s+/g, ' ').trim().toLowerCase()
      if (seen.has(key) || (perType.get(r.label) ?? 0) >= cap) return false
      seen.add(key)
      perType.set(r.label, (perType.get(r.label) ?? 0) + 1)
      rows.push(r)
      return true
    }
    for (const p of walk(dir)) {
      const text = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '') // front matter
      for (const sec of splitDocSections(text)) {
        const input = sectionInput(sec.own)
        if (meaningfulChars(input) < MIN_SECTION_CHARS) continue
        const row = { heading: sec.heading, text: input, repo: s.repo, file: relative(dir, p), line: sec.line, split }
        const label = headingType(sec.heading, true)
        if (label) add({ label, ...row }, PER_REPO)
        // Navigation ("See also", "Next steps") reads like the section it points to: always "other".
        else if (isNavigationHeading(sec.heading)) add({ label: OTHER, ...row }, NAV_PER_REPO)
        else if (!headingType(sec.heading)) others.push({ label: OTHER, ...row })
      }
    }
    // Spread the "other" sample over the repo's files (every k-th).
    perType.set(OTHER, 0)
    const step = Math.max(1, Math.floor(others.length / OTHER_PER_REPO))
    for (let i = 0; i < others.length; i += step) add(others[i], OTHER_PER_REPO)
  }

  writeFileSync(join(ROOT, 'data/sections.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const table = (['train', 'dev', 'test'] as const).map((sp) => {
    const xs = rows.filter((r) => r.split === sp)
    return `${sp.padEnd(5)} ${String(xs.length).padStart(6)}  ` + [...SECTION_TYPES, OTHER].map((t) => `${t}:${xs.filter((r) => r.label === t).length}`).join(' ') + `  (${new Set(xs.map((r) => r.repo)).size} repos)`
  })
  console.log(table.join('\n'))
}
