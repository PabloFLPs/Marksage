/**
 * Training-data fingerprints — so a model's training set can be checked after the data is gone.
 *   node --experimental-strip-types training/fingerprint.ts --write locks/<name>.json     # record today's data
 *   node --experimental-strip-types training/fingerprint.ts --check locks/<name>.json     # compare a rebuild with it
 *
 * Why (2026-10-30): the shipped lang-v2.bin couldn't be rebuilt — the pinned collection now gives 64,288 training
 * blocks instead of 63,751, and nothing recorded which blocks v2 had seen. A lock records, per repository and
 * language, how many blocks were collected (data/blocks.jsonl) and how many reached training (data/train.jsonl),
 * plus checksums of both files and of the inputs that decide them, and the tool versions. A failed --check names
 * the repositories and languages that differ, so a drift is found in seconds instead of guessed at.
 * train.ts writes the lock automatically when it saves into public/models/ (a model that ships).
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = new URL('.', import.meta.url).pathname

export interface Lock {
  /** What the lock is for: a model file, or a rebuild kept for reference. */
  name: string
  created: string
  tools: { node: string; git: string; platform: string }
  /** sha256 of the inputs that decide the data. */
  inputs: Record<string, string>
  collected: { sha256: string; blocks: number; perLabel: Record<string, number>; perRepo: Record<string, Record<string, number>> }
  train: { sha256: string; blocks: number; perLabel: Record<string, number>; perRepo: Record<string, Record<string, number>> }
  note?: string
}

const sha = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex')
const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

function count(file: string) {
  const text = readFileSync(file)
  const perLabel: Record<string, number> = {}
  const perRepo: Record<string, Record<string, number>> = {}
  let blocks = 0
  for (const line of text.toString('utf8').split('\n')) {
    if (!line) continue
    const b = JSON.parse(line) as { label: string; repo: string }
    blocks++
    perLabel[b.label] = (perLabel[b.label] ?? 0) + 1
    ;(perRepo[b.repo] ??= {})[b.label] = (perRepo[b.repo][b.label] ?? 0) + 1
  }
  return { sha256: sha(text), blocks, perLabel: sorted(perLabel), perRepo: sorted(Object.fromEntries(Object.entries(perRepo).map(([r, c]) => [r, sorted(c)]))) }
}

/**
 * The collected blocks' order depends on the collector's job order, so their checksum is taken over the sorted lines
 * (train.jsonl is already deterministic).
 */
function collectedSha(file: string) {
  return sha(readFileSync(file, 'utf8').split('\n').filter(Boolean).sort().join('\n'))
}

export function fingerprint(name: string, note?: string): Lock {
  const data = join(ROOT, 'data')
  const collected = count(join(data, 'blocks.jsonl'))
  const inputs: Record<string, string> = {}
  for (const f of ['sources.json', 'manifest.json', 'splits.json', 'labels.ts', 'collect.ts', 'build-sets.ts'])
    inputs[f] = sha(readFileSync(join(ROOT, f)))
  let git = 'unknown'
  try {
    git = execFileSync('git', ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    // no git on PATH
  }
  return {
    name,
    created: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }), // the project's dates are São Paulo dates
    tools: { node: process.version, git, platform: `${process.platform}-${process.arch}` },
    inputs,
    collected: { ...collected, sha256: collectedSha(join(data, 'blocks.jsonl')) },
    train: count(join(data, 'train.jsonl')),
    ...(note ? { note } : {}),
  }
}

export function writeLock(path: string, lock: Lock) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(lock, null, 1) + '\n')
}

/** Differences between a recorded lock and today's data, largest first. Empty = identical. */
export function compare(want: Lock, have: Lock): string[] {
  const out: string[] = []
  for (const f of Object.keys({ ...want.inputs, ...have.inputs }))
    if (want.inputs[f] !== have.inputs[f]) out.push(`input ${f} changed`)
  if (want.tools.git !== have.tools.git) out.push(`git: ${want.tools.git} → ${have.tools.git}`)
  for (const part of ['collected', 'train'] as const) {
    const w = want[part]
    const h = have[part]
    if (w.sha256 === h.sha256) continue
    out.push(`${part}: ${w.blocks} → ${h.blocks} blocks`)
    const rows: [number, string][] = []
    for (const repo of new Set([...Object.keys(w.perRepo), ...Object.keys(h.perRepo)])) {
      const a = w.perRepo[repo] ?? {}
      const b = h.perRepo[repo] ?? {}
      for (const label of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const d = (b[label] ?? 0) - (a[label] ?? 0)
        if (d) rows.push([d, `  ${part} ${repo} ${label}: ${a[label] ?? 0} → ${b[label] ?? 0} (${d > 0 ? '+' : ''}${d})`])
      }
    }
    rows.sort((x, y) => Math.abs(y[0]) - Math.abs(x[0]))
    out.push(...rows.slice(0, 40).map(([, s]) => s))
    if (rows.length > 40) out.push(`  … ${rows.length - 40} more`)
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
  const write = flag('--write')
  const check = flag('--check')
  if (write) {
    const path = join(ROOT, write)
    writeLock(path, fingerprint(flag('--name') ?? write.split('/').pop()!.replace(/\.json$/, ''), flag('--note') ?? undefined))
    console.log(`wrote ${path}`)
  } else if (check) {
    const path = join(ROOT, check)
    if (!existsSync(path)) throw new Error(`no lock at ${path}`)
    const diffs = compare(JSON.parse(readFileSync(path, 'utf8')) as Lock, fingerprint('now'))
    console.log(diffs.length ? diffs.join('\n') : 'identical to the lock')
    process.exit(diffs.length ? 1 : 0)
  } else {
    console.log('usage: fingerprint.ts --write locks/<name>.json [--note "…"] | --check locks/<name>.json')
  }
}
