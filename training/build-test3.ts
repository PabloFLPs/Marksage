/**
 * Third held-out set, for code-language model v3 → src/assist/__fixtures__/fences.real3.json
 *   node --experimental-strip-types training/collect.ts --sources sources-test3.json --out blocks-test3.jsonl --manifest manifest-test3.json
 *   node --experimental-strip-types training/build-test3.ts
 *
 * Built before any v3 training (2026-10-30), then frozen. Like build-test2.ts: the repos in sources-test3.json are
 * used nowhere else (not in sources.json, sources-test2.json, any fixture or the issue pools), and any block whose
 * text (or first three lines) appears in the main collection or in any fixture is dropped.
 * Bigger than test 2, and weighted toward the near-superset pairs v3 is about (Pablo's choice):
 *   - ≤ 30 per language (≤ 3 per repo per language, 1 per file per language);
 *   - the pair languages (ts, js, c, cpp, csharp, java) topped up to ≤ 60;
 *   - up to 40 more `json` blocks that contain comments (JSONC-like; `subset: "json-comments"`) — `jsonc` and
 *     `json5` are labelled `json` (labels.ts), so this is how "JSONC vs JSON" can be measured at all.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Block } from './collect.ts'
import { LABELS } from './labels.ts'
import { hasJsonComment } from './jsonComments.ts'

const ROOT = new URL('.', import.meta.url).pathname
const FIX = join(ROOT, '../src/assist/__fixtures__')
const OUT = join(FIX, 'fences.real3.json')
if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.log('fences.real3.json exists — not rebuilding (frozen; pass --force to resample).')
  process.exit(0)
}
const PER_LANG = 30
const PAIR_LANGS = new Set(['ts', 'js', 'c', 'cpp', 'csharp', 'java'])
const PER_PAIR_LANG = 60
const JSON_COMMENTS = 40
const PER_REPO = 3

const norm = (code: string) => code.replace(/\s+/g, ' ').trim().toLowerCase()
const headKey = (code: string) => {
  const ls = code.split('\n').map((l) => l.trim()).filter(Boolean)
  return ls.length >= 3 ? norm(ls.slice(0, 3).join('\n')) : null
}
function rng(seed: number) {
  let a = seed
  return () => ((a = (a + 0x6d2b79f5) | 0), ((Math.imul(a ^ (a >>> 15), 1 | a) ^ (a >>> 7)) >>> 0) / 2 ** 32)
}
const readJsonl = (f: string) => readFileSync(join(ROOT, 'data', f), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Block)

const seen = new Set<string>()
const seenHead = new Set<string>()
const remember = (code: string) => {
  seen.add(norm(code))
  const h = headKey(code)
  if (h) seenHead.add(h)
}
for (const b of readJsonl('blocks.jsonl')) remember(b.code)
for (const f of ['fences.json', 'fences.dev.json', 'fences.real.json', 'fences.real2.json']) for (const x of JSON.parse(readFileSync(join(FIX, f), 'utf8'))) remember(x.code)

const { commits } = JSON.parse(readFileSync(join(ROOT, 'manifest-test3.json'), 'utf8')) as { commits: Record<string, string> }
const pool = readJsonl('blocks-test3.jsonl')
  .filter((b) => b.kind === 'fence')
  .sort((x, y) => (x.repo + '\0' + x.file).localeCompare(y.repo + '\0' + y.file) || x.line - y.line)
const fresh = pool.filter((b) => !seen.has(norm(b.code)) && !(headKey(b.code) && seenHead.has(headKey(b.code)!)))

const rand = rng(2026_10_30)
type Out = { label: string; code: string; tag: string; source: string; subset?: string }
const out: Out[] = []
const taken = new Set<string>()
const perRepo = new Map<string, number>() // label|repo → count
const files = new Set<string>() // label|repo|file
const shuffled = new Map<string, Block[]>()
for (const label of LABELS) {
  const xs = fresh.filter((b) => b.label === label)
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  shuffled.set(label, xs)
}
function take(label: string, limit: number, filter: (b: Block) => boolean = () => true, subset?: string) {
  let n = out.filter((o) => o.label === label && o.subset === subset).length
  for (const b of shuffled.get(label) ?? []) {
    if (n >= limit) break
    const k = norm(b.code)
    const rk = `${label}|${b.repo}`
    if (!filter(b) || taken.has(k) || files.has(`${rk}|${b.file}`) || (perRepo.get(rk) ?? 0) >= PER_REPO) continue
    taken.add(k)
    files.add(`${rk}|${b.file}`)
    perRepo.set(rk, (perRepo.get(rk) ?? 0) + 1)
    out.push({ label, code: b.code, tag: b.tag, source: `https://github.com/${b.repo}/blob/${commits[b.repo] ?? 'HEAD'}/${b.file}#L${b.line}`, ...(subset ? { subset } : {}) })
    n++
  }
}
for (const label of LABELS) take(label, PER_LANG)
for (const label of PAIR_LANGS) take(label, PER_PAIR_LANG)
// JSON with comments: its own repo/file budget would starve it, so it may reuse repos (still 1 per file, ≤ 3 per repo).
for (const k of [...perRepo.keys()].filter((k) => k.startsWith('json|'))) perRepo.delete(k)
take('json', JSON_COMMENTS, (b) => hasJsonComment(b.code), 'json-comments')

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
const repos = new Set(out.map((o) => o.source.split('/blob/')[0]))
console.log(`${pool.length} blocks collected, ${pool.length - fresh.length} dropped as already seen, ${out.length} sampled from ${repos.size} repos`)
console.log(LABELS.map((l) => `${l}:${out.filter((o) => o.label === l && !o.subset).length}`).join(' '), `json-comments:${out.filter((o) => o.subset).length}`)
