/**
 * Step 1 — collect labelled code blocks from the public sources in sources.json.
 *   node --experimental-strip-types training/collect.ts [--jobs 8]
 *   … --sources sources-test2.json --out blocks-test2.jsonl --manifest manifest-test2.json   (a separate held-out set)
 *
 * Shallow, sparse clones (only Markdown, or only the listed source files) into training/data/repos/,
 * then every fenced block whose info string maps to a LANGUAGES key becomes one record in
 * training/data/blocks.jsonl. "code" sources add windows of real source files labelled by extension.
 * The commit of every clone is written to training/manifest.json so the data can be rebuilt exactly.
 */
import { execFile } from 'node:child_process'
import { createWriteStream, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import { infoTag, labelForTag } from './labels.ts'
import type { Language } from '../src/assist/questions.ts'

const run = promisify(execFile)
const ROOT = new URL('.', import.meta.url).pathname
const DATA = join(ROOT, 'data')
const REPOS = join(DATA, 'repos')
const JOBS = Number(process.argv[process.argv.indexOf('--jobs') + 1]) || 8
const flag = (name: string, dflt: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : dflt)
const SOURCES = flag('--sources', 'sources.json')
const OUT = flag('--out', 'blocks.jsonl')
const MANIFEST = flag('--manifest', 'manifest.json')

export interface Source {
  repo: string
  split?: 'train' | 'dev' | 'test' | 'test2'
  paths?: string[]
  code?: Partial<Record<Language, string[]>>
  wiki?: boolean
}
export interface Block {
  label: Language
  tag: string // author's info string ("code" sources: "file:<ext>")
  code: string
  repo: string
  file: string
  line: number
  kind: 'fence' | 'file'
}

const MAX_LINES = 40
// Includes / templating that make a block not really code in the tagged language.
const TEMPLATED = /\{\*|\{%|\{\{<|\{\/\*|<Sandpack|@include|\[!code|^<<<|\{\{#include/m
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/

function dirFor(s: Source) {
  return join(REPOS, s.repo.replace('/', '__') + (s.code ? '.code' : s.wiki ? '.wiki' : ''))
}

function sparsePatterns(s: Source): string[] {
  if (s.code) return Object.values(s.code).flat() as string[]
  if (!s.paths) return ['*.md', '*.mdx', '*.markdown']
  return s.paths.flatMap((p) => (p.endsWith('*') ? [p.replace(/\*$/, '**/*.md'), p.replace(/\*$/, '**/*.mdx')] : [p]))
}

async function clone(s: Source): Promise<string | null> {
  const dir = dirFor(s)
  const url = `https://github.com/${s.repo}${s.wiki ? '.wiki' : ''}.git`
  try {
    if (!existsSync(join(dir, '.git'))) {
      await run('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', url, dir], { timeout: 240_000 })
      await run('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', ...sparsePatterns(s)], { timeout: 240_000 })
    }
    const { stdout } = await run('git', ['-C', dir, 'rev-parse', 'HEAD'])
    return stdout.trim()
  } catch (e) {
    console.warn(`  ✗ ${s.repo}: ${(e as Error).message.split('\n')[0]}`)
    return null
  }
}

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    if (f === '.git' || f === 'node_modules') continue
    const p = join(dir, f)
    const st = lstatSync(p) // lstat: skip symlinks (some point outside the repo or nowhere)
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) yield* walk(p)
    else if (st.size < 1_500_000) yield p
  }
}

export function fencesIn(text: string): { info: string; body: string; line: number }[] {
  const out: { info: string; body: string; line: number }[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i])
    if (!m || (m[2][0] === '`' && m[3].includes('`'))) continue
    const indent = m[1].length
    const marker = m[2]
    let j = i + 1
    for (; j < lines.length; j++) {
      const n = FENCE.exec(lines[j])
      if (n && n[2][0] === marker[0] && n[2].length >= marker.length && n[3].trim() === '') break
    }
    const body = lines
      .slice(i + 1, j)
      .map((l) => (l.slice(0, indent).trim() === '' ? l.slice(indent) : l))
      .join('\n')
    out.push({ info: m[3], body, line: i + 1 })
    i = j
  }
  return out
}

function fenceBlocks(s: Source, dir: string): Block[] {
  const out: Block[] = []
  for (const p of walk(dir)) {
    if (!/\.(md|mdx|markdown)$/i.test(p)) continue
    const text = readFileSync(p, 'utf8')
    for (const f of fencesIn(text)) {
      const tag = infoTag(f.info)
      const label = tag ? labelForTag(tag) : null
      if (!label) continue
      const code = f.body.replace(/^\n+|\s+$/g, '')
      const n = code.split('\n').filter((l) => l.trim()).length
      if (n < 1 || n > MAX_LINES || TEMPLATED.test(code)) continue
      out.push({ label, tag, code, repo: s.repo, file: relative(dir, p), line: f.line, kind: 'fence' })
    }
  }
  return out
}

/** Deterministic PRNG so windows are reproducible. */
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 2 ** 32
}

/** A few windows (3–25 lines, starting on a non-blank line) per real source file. */
function fileBlocks(s: Source, dir: string): Block[] {
  const out: Block[] = []
  for (const [label, patterns] of Object.entries(s.code ?? {}) as [Language, string[]][]) {
    const exts = new Set(patterns.map((p) => p.split('/').pop()!.replace(/^.*\*/, '')))
    for (const p of walk(dir)) {
      const name = p.split('/').pop()!
      if (![...exts].some((e) => name.endsWith(e) || name === e)) continue
      const lines = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n').split('\n')
      const rand = rng(p)
      const windows = Math.min(4, Math.max(1, Math.floor(lines.length / 40)))
      for (let w = 0; w < windows; w++) {
        const len = 3 + Math.floor(rand() * 23)
        let start = Math.floor(rand() * Math.max(1, lines.length - len))
        while (start < lines.length && !lines[start].trim()) start++
        const code = lines.slice(start, start + len).join('\n').replace(/\s+$/, '')
        if (code.split('\n').filter((l) => l.trim()).length < 2) continue
        out.push({ label, tag: `file:${name.includes('.') ? name.split('.').pop() : name}`, code, repo: s.repo, file: relative(dir, p), line: start + 1, kind: 'file' })
      }
    }
  }
  return out
}

async function main() {
  const { sources } = JSON.parse(readFileSync(join(ROOT, SOURCES), 'utf8')) as { sources: Source[] }
  mkdirSync(REPOS, { recursive: true })
  const manifest: Record<string, string> = {}
  const outFile = createWriteStream(join(DATA, OUT))
  let total = 0
  let next = 0
  const counts: Record<string, number> = {}
  async function worker() {
    while (next < sources.length) {
      const s = sources[next++]
      const sha = await clone(s)
      if (!sha) continue
      manifest[s.repo + (s.code ? '#code' : '')] = sha
      const blocks = s.code ? fileBlocks(s, dirFor(s)) : fenceBlocks(s, dirFor(s))
      for (const b of blocks) {
        outFile.write(JSON.stringify(b) + '\n')
        counts[b.label] = (counts[b.label] ?? 0) + 1
      }
      total += blocks.length
      console.log(`  ${s.repo.padEnd(42)} ${String(blocks.length).padStart(6)} blocks`)
    }
  }
  await Promise.all(Array.from({ length: JOBS }, worker))
  outFile.end()
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(join(ROOT, MANIFEST), JSON.stringify({ collected: new Date().toISOString().slice(0, 10), commits: sorted }, null, 1) + '\n')
  console.log(`\n${total} blocks from ${Object.keys(manifest).length}/${sources.length} sources`)
  console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '))
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
