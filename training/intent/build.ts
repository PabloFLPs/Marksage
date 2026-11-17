/**
 * Intent data v1 for the command palette's intent model: train / val rows from the command registry and PHRASES.
 *
 *   node --experimental-strip-types training/intent/build.ts
 *
 * Writes training/data/intent/{train,val}.v1.jsonl (gitignored, like all training data) and
 * training/intent/manifest.v1.json (counts and SHA-256 of both files, committed). Deterministic: same inputs, same bytes.
 *
 * - Titles (both languages, every state of a toggle) and the registry's search words go to train only.
 * - Each handwritten phrase is a template; one in five goes to val (by its hash), at least one per command and
 *   language. Variants of a template (no accents, a typo, a polite prefix) stay on its side: the split is by
 *   template, never by variant, so val never holds a near-copy of a train row.
 * - The test set is not made here: Pablo writes it (test.v1.md), frozen in training/locks before any training.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { COMMANDS, type CommandContext } from '../../src/commands/registry.ts'
import { translate } from '../../src/lib/i18n.ts'
import { PHRASES, type IntentLang } from './phrases.ts'

export const LANGS: IntentLang[] = ['en', 'pt-BR']
const VERSION = 'v1'
const SEED = 1
/** One template in VAL_EVERY goes to val. */
const VAL_EVERY = 5
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}training/data/intent`

export interface Row {
  q: string
  /** `any` for the registry's search words, which mix both languages. */
  lang: IntentLang | 'any'
  id: string
  template: string
  kind: 'title' | 'keyword' | 'phrase'
  aug: 'orig' | 'fold' | 'typo' | 'prefix'
}

/** Two states that between them show every toggle's names (Edit / Preview, Show / Hide, dark / light). */
const STATES: Omit<CommandContext, 'lang'>[] = [
  { hasDocument: true, showAbout: false, readOnly: false, editing: true, isDesktop: true, outlineShown: false, theme: 'light', assistMode: 'heuristics', hasSelection: true },
  { hasDocument: true, showAbout: false, readOnly: false, editing: false, isDesktop: true, outlineShown: true, theme: 'dark', assistMode: 'heuristics', hasSelection: true },
]

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const templateId = (id: string, lang: string, text: string) => sha(`${id}|${lang}|${text}`).slice(0, 10)
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Two queries are the same when only accents, case or punctuation differ ("Open file…" = "open file"). */
const same = (s: string) => fold(s).replace(/[^\p{L}\p{N}+]+/gu, ' ').trim()

/** mulberry32: small, seedable, deterministic. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
/** One typo in one word of 4+ letters: swapped neighbors, a dropped, doubled or wrong letter. Null if none fits. */
function typo(text: string, rand: () => number): string | null {
  const words = text.split(' ')
  const long = words.map((w, i) => [w, i] as const).filter(([w]) => /^\p{L}{4,}$/u.test(w))
  if (!long.length) return null
  const [word, index] = long[Math.floor(rand() * long.length)]
  const at = 1 + Math.floor(rand() * (word.length - 2))
  const op = Math.floor(rand() * 4)
  let next = word
  if (op === 0) next = word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2)
  if (op === 1) next = word.slice(0, at) + word.slice(at + 1)
  if (op === 2) next = word.slice(0, at) + word[at] + word.slice(at)
  if (op === 3) next = word.slice(0, at) + LETTERS[Math.floor(rand() * LETTERS.length)] + word.slice(at + 1)
  if (next === word) return null
  words[index] = next
  return words.join(' ')
}

const PREFIXES: Record<IntentLang, string[]> = {
  en: ['please ', 'can you ', 'i want to ', 'quick '],
  'pt-BR': ['por favor ', 'quero ', 'pode ', 'me ajuda a '],
}

/** The template itself, then its variants (no accents, a typo, a polite prefix), duplicates removed. */
function variants(text: string, lang: IntentLang, template: string): [string, Row['aug']][] {
  const rand = rng(parseInt(template.slice(0, 8), 16) ^ SEED)
  const out: [string, Row['aug']][] = [[text, 'orig']]
  const folded = fold(text)
  if (folded !== text) out.push([folded, 'fold'])
  const t = typo(folded, rand)
  if (t) out.push([t, 'typo'])
  const prefixes = PREFIXES[lang]
  out.push([prefixes[Math.floor(rand() * prefixes.length)] + text, 'prefix'])
  const seen = new Set<string>()
  return out.filter(([q]) => (seen.has(q) ? false : (seen.add(q), true)))
}

export function build(): { train: Row[]; val: Row[]; leaked: number } {
  const train: Row[] = []
  const val: Row[] = []
  const ids = new Set(COMMANDS.map((c) => c.id))
  for (const id of Object.keys(PHRASES)) if (id !== 'none' && !ids.has(id)) throw new Error(`PHRASES has "${id}", which isn't a registry command`)
  for (const id of ids) if (!PHRASES[id]) throw new Error(`no phrases for registry command "${id}"`)

  // Titles and search words: train only. A search word several commands share ("english" is on both language
  // commands, "assist" on the three modes) would teach contradicting answers, so it's left out.
  const keywordsOf = (c: (typeof COMMANDS)[number]) => new Set(STATES.flatMap((s) => c.keywords({ ...s, lang: 'en' }).split(/\s+/).filter(Boolean)))
  const owners = new Map<string, number>()
  for (const c of COMMANDS) for (const w of keywordsOf(c)) owners.set(w, (owners.get(w) ?? 0) + 1)
  for (const c of COMMANDS) {
    for (const lang of LANGS) {
      const titles = new Set(STATES.map((s) => { const t = c.title({ ...s, lang }); return translate(lang, t.key, t.vars) }))
      for (const title of titles) train.push({ q: title, lang, id: c.id, template: templateId(c.id, lang, title), kind: 'title', aug: 'orig' })
    }
    for (const w of keywordsOf(c)) if (owners.get(w) === 1) train.push({ q: w, lang: 'any', id: c.id, template: templateId(c.id, 'any', w), kind: 'keyword', aug: 'orig' })
  }

  // Phrases: split by template.
  for (const [id, byLang] of Object.entries(PHRASES)) {
    for (const lang of LANGS) {
      const templates = byLang[lang].map((text) => ({ text, template: templateId(id, lang, text) }))
      const toVal = new Set(templates.filter((t) => parseInt(t.template.slice(0, 8), 16) % VAL_EVERY === 0).map((t) => t.template))
      if (!toVal.size) toVal.add([...templates].sort((a, b) => a.template.localeCompare(b.template))[0].template)
      for (const { text, template } of templates)
        for (const [q, aug] of variants(text, lang, template)) (toVal.has(template) ? val : train).push({ q, lang, id, template, kind: 'phrase', aug })
    }
  }
  // One query, one answer: the same text (accents and case aside) under two commands is a mistake in the sources.
  const answer = new Map<string, string>()
  const conflicts: string[] = []
  for (const r of [...train, ...val]) {
    const key = same(r.q)
    const known = answer.get(key)
    if (known && known !== r.id) conflicts.push(`"${r.q}": ${known} / ${r.id}`)
    else answer.set(key, r.id)
  }
  if (conflicts.length) throw new Error(`the same query under two commands:\n  ${[...new Set(conflicts)].join('\n  ')}`)

  // No val row may repeat a train row (a phrase "pdf" in val, the search word "pdf" in train; "open file" and the
  // title "Open file…"): those leave val.
  const seen = new Set(train.map((r) => same(r.q)))
  const clean = val.filter((r) => !seen.has(same(r.q)))
  return { train, val: clean, leaked: val.length - clean.length }
}

function count(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.id] = (out[r.id] ?? 0) + 1
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { train, val, leaked } = build()
  mkdirSync(OUT, { recursive: true })
  const files: Record<string, string> = {
    [`train.${VERSION}.jsonl`]: train.map((r) => JSON.stringify(r)).join('\n') + '\n',
    [`val.${VERSION}.jsonl`]: val.map((r) => JSON.stringify(r)).join('\n') + '\n',
  }
  for (const [name, body] of Object.entries(files)) writeFileSync(`${OUT}/${name}`, body)
  const templates = (rows: Row[]) => new Set(rows.map((r) => r.template)).size
  const manifest = {
    version: VERSION,
    seed: SEED,
    valEvery: VAL_EVERY,
    train: { rows: train.length, templates: templates(train), perId: count(train) },
    val: { rows: val.length, templates: templates(val), leakedRowsLeftOut: leaked, perId: count(val) },
    sha256: Object.fromEntries(Object.entries(files).map(([name, body]) => [name, sha(body)])),
  }
  writeFileSync(`${ROOT}training/intent/manifest.${VERSION}.json`, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`train ${train.length} rows (${templates(train)} templates), val ${val.length} rows (${templates(val)} templates) → training/data/intent`)
}
