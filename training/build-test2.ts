/**
 * Fresh held-out set for model v2 → src/assist/__fixtures__/fences.real2.json
 *   node --experimental-strip-types training/collect.ts --sources sources-test2.json --out blocks-test2.jsonl --manifest manifest-test2.json
 *   node --experimental-strip-types training/build-test2.ts
 *
 * The repos in sources-test2.json are used nowhere else. On top of that, any block whose text (or first
 * three lines) appears anywhere in the main collection — train, dev or the first test set — is dropped,
 * so neither training nor tuning has ever seen anything in this set. Stratified: ≤ 15 per language,
 * ≤ 3 per repo per language, 1 per file per language.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Block } from './collect.ts'
import { LABELS } from './labels.ts'

const ROOT = new URL('.', import.meta.url).pathname
const FIX = join(ROOT, '../src/assist/__fixtures__')
// Built once (2026-10-24) and then frozen — a held-out set shouldn't be resampled after results are known.
if (existsSync(join(FIX, 'fences.real2.json')) && !process.argv.includes('--force')) {
  console.log('fences.real2.json exists — not rebuilding (pass --force to resample).')
  process.exit(0)
}
const PER_LANG = 15

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
for (const f of ['fences.json', 'fences.dev.json', 'fences.real.json']) for (const x of JSON.parse(readFileSync(join(FIX, f), 'utf8'))) remember(x.code)

const { commits } = JSON.parse(readFileSync(join(ROOT, 'manifest-test2.json'), 'utf8')) as { commits: Record<string, string> }
const pool = readJsonl('blocks-test2.jsonl')
  .filter((b) => b.kind === 'fence')
  .sort((x, y) => (x.repo + '\0' + x.file).localeCompare(y.repo + '\0' + y.file) || x.line - y.line) // collector order varies
const fresh = pool.filter((b) => !seen.has(norm(b.code)) && !(headKey(b.code) && seenHead.has(headKey(b.code)!)))

const rand = rng(2026_10_24)
const out: { label: string; code: string; tag: string; source: string }[] = []
const taken = new Set<string>()
for (const label of LABELS) {
  const xs = fresh.filter((b) => b.label === label)
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  const perRepo = new Map<string, number>()
  const files = new Set<string>()
  let n = 0
  for (const b of xs) {
    if (n >= PER_LANG) break
    const k = norm(b.code)
    if (taken.has(k) || files.has(b.repo + b.file) || (perRepo.get(b.repo) ?? 0) >= 3) continue
    taken.add(k)
    files.add(b.repo + b.file)
    perRepo.set(b.repo, (perRepo.get(b.repo) ?? 0) + 1)
    out.push({ label, code: b.code, tag: b.tag, source: `https://github.com/${b.repo}/blob/${commits[b.repo] ?? 'HEAD'}/${b.file}#L${b.line}` })
    n++
  }
}
writeFileSync(join(FIX, 'fences.real2.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`${pool.length} blocks collected, ${pool.length - fresh.length} dropped as already seen, ${out.length} sampled from ${new Set(out.map((o) => o.source.split('/blob/')[0])).size} repos`)
console.log(LABELS.map((l) => `${l}:${out.filter((o) => o.label === l).length}`).join(' '))
