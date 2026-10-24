/**
 * Step 2 — split collected blocks into train / dev / test, by repository.
 *   node --experimental-strip-types training/build-sets.ts
 *
 * - Split by repo, never by block: a repo pinned in sources.json keeps its split. Then, for every
 *   language (rarest first), dev and test get at least MIN_REPOS repos (4 / 6) with ≥ MIN_BLOCKS blocks of
 *   it — taking the smallest qualifying repos, so training loses as little as possible. Everything else
 *   is train. "code" sources only feed train, and are dropped when the same repo's docs left train.
 * - Leaks: any training block that matches a dev/test block (same text, or same first lines) is removed.
 * - dev → src/assist/__fixtures__/fences.dev.json   (stratified, ≤ PER_LANG per language)
 * - test → src/assist/__fixtures__/fences.real.json (keeps every existing entry, tops up to ≤ PER_LANG)
 * - train → training/data/train.jsonl (not committed; rebuild with collect.ts + this script)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Block, Source } from './collect.ts'
import { LABELS } from './labels.ts'

const ROOT = new URL('.', import.meta.url).pathname
const FIX = join(ROOT, '../src/assist/__fixtures__')
const PER_LANG = 15 // dev and test: ≤ 15 per language → ~300 each
const TRAIN_CAP_PER_LABEL = 6000
const TRAIN_CAP_PER_REPO_LABEL = 600

type Split = 'train' | 'dev' | 'test'
interface Fixture { label: string; code: string; tag?: string; source: string; note?: string }

function fnv(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
function rng(seed: number) {
  let a = seed
  return () => ((a = (a + 0x6d2b79f5) | 0), ((Math.imul(a ^ (a >>> 15), 1 | a) ^ (a >>> 7)) >>> 0) / 2 ** 32)
}
function shuffle<T>(xs: T[], rand: () => number) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

const norm = (code: string) => code.replace(/\s+/g, ' ').trim().toLowerCase()
/** Near-duplicate key: the first three non-blank lines (translated docs repeat code verbatim). */
const headKey = (code: string) => {
  const ls = code.split('\n').map((l) => l.trim()).filter(Boolean)
  return ls.length >= 3 ? norm(ls.slice(0, 3).join('\n')) : null
}

const MIN_REPOS: Record<'dev' | 'test', number> = { dev: 4, test: 6 }
const MIN_BLOCKS = 4

function assignSplits(blocks: Block[], docsSource: Map<string, Source>): Map<string, Split> {
  const split = new Map<string, Split>()
  const counts = new Map<string, Record<string, number>>()
  const totals = new Map<string, number>()
  const labelTotals: Record<string, number> = {}
  for (const b of blocks) {
    if (b.kind !== 'fence') continue
    const c = counts.get(b.repo) ?? counts.set(b.repo, {}).get(b.repo)!
    c[b.label] = (c[b.label] ?? 0) + 1
    totals.set(b.repo, (totals.get(b.repo) ?? 0) + 1)
    labelTotals[b.label] = (labelTotals[b.label] ?? 0) + 1
  }
  for (const repo of counts.keys()) split.set(repo, (docsSource.get(repo)?.split as Split | undefined) ?? 'train')
  // Once splits.json exists the dev/test repos are frozen, so adding sources later only grows train
  // and every earlier number stays comparable. `--resplit` recomputes from scratch.
  const frozenFile = join(ROOT, 'splits.json')
  if (existsSync(frozenFile) && !process.argv.includes('--resplit')) {
    const frozen = JSON.parse(readFileSync(frozenFile, 'utf8')) as { dev: string[]; test: string[] }
    for (const r of frozen.dev) split.set(r, 'dev')
    for (const r of frozen.test) split.set(r, 'test')
    return split
  }
  const pinned = (repo: string) => docsSource.get(repo)?.split !== undefined
  const has = (repo: string, label: string) => (counts.get(repo)?.[label] ?? 0) >= MIN_BLOCKS
  for (const target of ['test', 'dev'] as const) {
    for (const label of [...LABELS].sort((a, b) => (labelTotals[a] ?? 0) - (labelTotals[b] ?? 0))) {
      const need = MIN_REPOS[target]
      let have = [...split].filter(([r, s]) => s === target && has(r, label)).length
      const candidates = [...split]
        .filter(([r, s]) => s === 'train' && !pinned(r) && has(r, label))
        .map(([r]) => r)
        .sort((a, b) => totals.get(a)! - totals.get(b)! || fnv(a + target) - fnv(b + target))
      for (const r of candidates) {
        if (have >= need) break
        // Never take the last repos a language has in train.
        if ([...split].filter(([x, s]) => s === 'train' && has(x, label)).length <= 4) break
        split.set(r, target)
        have++
      }
    }
  }
  return split
}

function main() {
  const { sources } = JSON.parse(readFileSync(join(ROOT, 'sources.json'), 'utf8')) as { sources: Source[] }
  const { commits } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as { commits: Record<string, string> }
  const docsSource = new Map(sources.filter((s) => !s.code).map((s) => [s.repo, s]))
  const blocks = readFileSync(join(ROOT, 'data/blocks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Block)

  // The collector writes repos in completion order (parallel clones): sort so sampling is reproducible.
  blocks.sort((x, y) => (x.repo + '\0' + x.file).localeCompare(y.repo + '\0' + y.file) || x.line - y.line)
  const splits = assignSplits(blocks, docsSource)
  const by: Record<Split, Block[]> = { train: [], dev: [], test: [] }
  for (const b of blocks) {
    const split = splits.get(b.repo) ?? 'train'
    if (b.kind === 'file' && split !== 'train') continue // that project's docs are held out — keep it out of train entirely
    by[b.kind === 'file' ? 'train' : split].push(b)
  }
  const list = (sp: Split) => [...splits].filter(([, s]) => s === sp).map(([r]) => r).sort()
  writeFileSync(join(ROOT, 'splits.json'), JSON.stringify({ dev: list('dev'), test: list('test') }, null, 1) + '\n')

  const url = (b: Block) => {
    const sha = commits[b.repo] ?? 'HEAD'
    return `https://github.com/${b.repo}/blob/${sha}/${b.file}#L${b.line}`
  }

  // Stratified sample: ≤ PER_LANG per language, ≤ 3 per repo per language, 1 per file per language.
  function sample(pool: Block[], seed: number, existing: Fixture[] = []): Fixture[] {
    const rand = rng(seed)
    const seen = new Set(existing.map((f) => norm(f.code)))
    const out: Fixture[] = [...existing]
    const byLabel = new Map<string, Block[]>()
    for (const b of pool) (byLabel.get(b.label) ?? byLabel.set(b.label, []).get(b.label)!).push(b)
    for (const label of LABELS) {
      const have = out.filter((f) => f.label === label)
      const repos = new Map<string, number>()
      const files = new Set<string>()
      for (const f of have) {
        const m = /github\.com\/([^/]+\/[^/]+)\/blob\/[^/]+\/(.*)#L/.exec(f.source)
        if (!m) continue
        repos.set(m[1], (repos.get(m[1]) ?? 0) + 1)
        files.add(m[1] + m[2])
      }
      let n = have.length
      for (const b of shuffle([...(byLabel.get(label) ?? [])], rand)) {
        if (n >= PER_LANG) break
        const k = norm(b.code)
        if (seen.has(k) || files.has(b.repo + b.file) || (repos.get(b.repo) ?? 0) >= 3) continue
        seen.add(k)
        files.add(b.repo + b.file)
        repos.set(b.repo, (repos.get(b.repo) ?? 0) + 1)
        out.push({ label, code: b.code, tag: b.tag, source: url(b) })
        n++
      }
    }
    return out
  }

  // Keep earlier held-out entries — but only those whose repo is still in test (reruns stay leak-free).
  const repoOf = (f: Fixture) => /github\.com\/([^/]+\/[^/]+)\//.exec(f.source)?.[1] ?? ''
  const existingAll = JSON.parse(readFileSync(join(FIX, 'fences.real.json'), 'utf8')) as Fixture[]
  const existingReal = existingAll.filter((f) => splits.get(repoOf(f)) === 'test')
  if (existingReal.length < existingAll.length) console.warn(`  dropped ${existingAll.length - existingReal.length} held-out entries whose repo is no longer in test`)
  const test = sample(by.test, 1, existingReal)
  const existingDevAll = existsSync(join(FIX, 'fences.dev.json')) ? (JSON.parse(readFileSync(join(FIX, 'fences.dev.json'), 'utf8')) as Fixture[]) : []
  const dev = sample(by.dev, 2, existingDevAll.filter((f) => splits.get(repoOf(f)) === 'dev'))

  // Leak guard: drop training blocks that match anything in dev/test, or any held-out block at all.
  const held = new Set<string>()
  const heldHead = new Set<string>()
  // …and anything in the second, fresh held-out set (fences.real2.json), so later sources can't leak into it.
  const real2 = existsSync(join(FIX, 'fences.real2.json')) ? (JSON.parse(readFileSync(join(FIX, 'fences.real2.json'), 'utf8')) as Fixture[]) : []
  for (const f of [...test, ...dev, ...by.dev, ...by.test, ...real2]) {
    held.add(norm(f.code))
    const h = headKey(f.code)
    if (h) heldHead.add(h)
  }
  const rand = rng(3)
  const trainSeen = new Set<string>()
  const perLabel = new Map<string, number>()
  const perRepoLabel = new Map<string, number>()
  const train: { label: string; code: string; repo: string }[] = []
  let leaks = 0
  for (const b of shuffle([...by.train], rand)) {
    const k = norm(b.code)
    const h = headKey(b.code)
    if (held.has(k) || (h && heldHead.has(h))) { leaks++; continue }
    if (trainSeen.has(k)) continue
    const rl = b.repo + b.label
    if ((perLabel.get(b.label) ?? 0) >= TRAIN_CAP_PER_LABEL || (perRepoLabel.get(rl) ?? 0) >= TRAIN_CAP_PER_REPO_LABEL) continue
    trainSeen.add(k)
    perLabel.set(b.label, (perLabel.get(b.label) ?? 0) + 1)
    perRepoLabel.set(rl, (perRepoLabel.get(rl) ?? 0) + 1)
    train.push({ label: b.label, code: b.code, repo: b.repo })
  }

  writeFileSync(join(ROOT, 'data/train.jsonl'), train.map((t) => JSON.stringify(t)).join('\n') + '\n')
  writeFileSync(join(FIX, 'fences.dev.json'), JSON.stringify(dev, null, 2) + '\n')
  writeFileSync(join(FIX, 'fences.real.json'), JSON.stringify(test, null, 2) + '\n')

  const repoCount = (xs: Block[]) => new Set(xs.map((b) => b.repo)).size
  console.log(`repos  train ${repoCount(by.train)}  dev ${repoCount(by.dev)}  test ${repoCount(by.test)}`)
  console.log(`train  ${train.length} blocks (${leaks} dropped as dev/test look-alikes)`)
  console.log(`dev    ${dev.length}   test ${test.length} (${existingReal.length} kept from before)`)
  const row = (name: string, xs: { label: string }[]) =>
    console.log(name.padEnd(6), LABELS.map((l) => `${l}:${xs.filter((x) => x.label === l).length}`).join(' '))
  row('train', train)
  row('dev', dev)
  row('test', test)
}

main()
