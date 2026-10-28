/**
 * How good is the link text Marksage offers for a pasted URL? Judged against the text real authors wrote.
 *   node --experimental-strip-types training/eval-links.ts            # dev repos (splits.json dev) — tune here
 *   node --experimental-strip-types training/eval-links.ts --test     # held-out repos — run once per rule version
 *
 * Every link that stands alone on its line or list item — `- [text](https://…)`, the closest thing to a pasted URL —
 * is a URL with the text its author chose.
 * For each, the rule (src/assist/heuristics/link.ts) either offers a text or stays quiet (it only speaks for GitHub
 * issues and pull requests; the quiet ones are counted by what they point to). "Same text" compares
 * case-insensitively, ignoring punctuation and accents; an issue link also counts when the author wrote just its
 * number ("#123"), since that's the same reference. Links whose text is the URL itself are skipped: there the
 * author chose to show the address.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Source } from './collect.ts'
import { linkTextFor } from './linkText.ts'

const ROOT = new URL('.', import.meta.url).pathname
const REPOS = join(ROOT, 'data/repos')
const TEST = process.argv.includes('--test')
const SHOW = process.argv.includes('--show')

const read = (f: string) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'))
const sources: Source[] = [...read('sources.json').sources, ...read('sources-test2.json').sources].filter((s: Source) => !s.code)
const splits = read('splits.json') as { dev: string[]; test: string[] }
const pick = sources.filter((s) => (TEST ? splits.test.includes(s.repo) || s.split === 'test2' : splits.dev.includes(s.repo)))

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
const norm = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[`*_~"'“”‘’]/g, '').replace(/[^\p{L}\p{N}#]+/gu, ' ').trim()

type Tally = { links: number; offered: number; same: number; samples: string[] }
const by: Record<string, Tally> = {}
const PER_REPO = 400 // links per repo, so big doc sites don't dominate
let total = 0
let urlText = 0
for (const s of pick) {
  const dir = join(REPOS, s.repo.replace('/', '__') + (s.wiki ? '.wiki' : ''))
  let n = 0
  let files: string[]
  try {
    files = [...walk(dir)]
  } catch {
    continue
  }
  const seen = new Set<string>()
  for (const p of files) {
    // A link alone on its line (or alone in a list item) is the closest thing to a pasted URL: no sentence around it.
    const alone = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\[([^\]\n]{1,150})\]\((https?:\/\/[^)\s]+)\)\s*[.,;:]?\s*$/gm
    for (const m of readFileSync(p, 'utf8').matchAll(alone)) {
      if (n >= PER_REPO) break
      const [, text, url] = m
      if (seen.has(text + url)) continue
      seen.add(text + url)
      if (norm(text) === norm(url) || norm(text) === norm(url.replace(/^https?:\/\/(www\.)?/, ''))) {
        urlText++
        continue
      }
      n++
      total++
      const d = linkTextFor(url)
      const kind = d ? 'issue' : /github\.com\/[^/]+\/[^/]+\/?$/.test(url) ? 'quiet: repository' : /github\.com/.test(url) ? 'quiet: other GitHub' : /^https?:\/\/[^/]+\/?$/.test(url) ? 'quiet: home page' : 'quiet: page'
      const t = (by[kind] ??= { links: 0, offered: 0, same: 0, samples: [] })
      t.links++
      if (!d) continue
      t.offered++
      const num = /#(\d+)$/.exec(d)?.[1]
      const same = norm(d) === norm(text) || (!!num && new RegExp(`^(#|pr #?|issue #?|pull request #?)?${num}$`).test(norm(text).replace(/\s+/g, ' ')))
      if (same) t.same++
      else if (SHOW && t.samples.length < 12) t.samples.push(`${JSON.stringify(text)} ← ${url}  (offered ${JSON.stringify(d)})`)
    }
  }
}
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + '%' : '—')
const offered = Object.values(by).reduce((a, t) => a + t.offered, 0)
const same = Object.values(by).reduce((a, t) => a + t.same, 0)
console.log(`${TEST ? 'held-out' : 'dev'} repos: ${pick.length} · links ${total} (+${urlText} whose text is the URL itself, skipped)`)
console.log(`offered ${offered} (${pct(offered, total)}) · same text as the author ${same} (${pct(same, offered)} of offered)`)
for (const [k, t] of Object.entries(by).sort((a, b) => b[1].links - a[1].links)) {
  console.log(`  ${k.padEnd(6)} links ${String(t.links).padStart(6)} · offered ${String(t.offered).padStart(6)} · same ${pct(t.same, t.offered)}`)
  for (const x of t.samples) console.log('      ✗ ' + x)
}
