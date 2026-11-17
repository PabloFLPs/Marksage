/**
 * The baseline the intent model must beat (ROADMAP §0.3, D7): the palette's FuzzyMatcher on the intent rows.
 *
 *   node --experimental-strip-types training/intent/eval-fuzzy.ts [val|train|test]
 *
 * Each row is ranked the way the palette would rank it with the UI in the row's language: every command offered
 * (the model is scored the same way; at run time both see only what `when` allows), names in that language, the other
 * language as aliases, the search words and the group. No result counts as `none`. Reports, per language: top-1 and
 * top-2 accuracy on rows that name a command, and on `none` rows how often it said nothing; plus precision of "nothing".
 * `test` reads Pablo's frozen test set (test.v1.md, via testSet.ts) — run it only for the final comparison.
 */
import { readFileSync } from 'node:fs'
import { fuzzyMatcher } from '../../src/commands/fuzzyMatcher.ts'
import type { MatchItem } from '../../src/commands/matcher.ts'
import { COMMANDS, type CommandContext, type CommandGroup } from '../../src/commands/registry.ts'
import { translate, type Lang } from '../../src/lib/i18n.ts'
import type { Row } from './build.ts'
import { loadTestSet } from './testSet.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const set = process.argv[2] ?? 'val'

interface Query {
  q: string
  lang: Lang
  id: string
}

function load(): Query[] {
  if (set === 'test') return loadTestSet(`${ROOT}training/intent/test.v1.md`, new Set(COMMANDS.map((c) => c.id)))
  return readFileSync(`${ROOT}training/data/intent/${set}.v1.jsonl`, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row)
    .filter((r): r is Row & { lang: Lang } => r.lang !== 'any')
}

function itemsFor(lang: Lang): MatchItem[] {
  const ctx: CommandContext = { hasDocument: true, showAbout: false, readOnly: false, editing: true, isDesktop: true, outlineShown: false, theme: 'light', assistMode: 'heuristics', lang, hasSelection: true }
  const other: Lang = lang === 'en' ? 'pt-BR' : 'en'
  const group = (g: CommandGroup) => (g === 'assist' ? 'Smart Assist' : translate(lang, `palette.group.${g}`))
  return COMMANDS.map((c) => {
    const t = c.title(ctx)
    return { id: c.id, label: translate(lang, t.key, t.vars), aliases: [translate(other, t.key, t.vars)], keywords: c.keywords(ctx), group: group(c.group) }
  })
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—')
const rows = load()
const items = { en: itemsFor('en'), 'pt-BR': itemsFor('pt-BR') }
console.log(`FuzzyMatcher on ${set}: ${rows.length} rows`)
let saidNone = 0
let saidNoneRight = 0
for (const lang of ['en', 'pt-BR'] as const) {
  const mine = rows.filter((r) => r.lang === lang)
  const named = mine.filter((r) => r.id !== 'none')
  const none = mine.filter((r) => r.id === 'none')
  let top1 = 0
  let top2 = 0
  let noneRight = 0
  for (const r of mine) {
    const ranked = fuzzyMatcher.rank(r.q, items[lang]).map((m) => m.id)
    if (!ranked.length) {
      saidNone++
      if (r.id === 'none') {
        saidNoneRight++
        noneRight++
      }
    }
    if (r.id !== 'none') {
      if (ranked[0] === r.id) top1++
      if (ranked.slice(0, 2).includes(r.id)) top2++
    }
  }
  console.log(`  ${lang.padEnd(5)}  commands: top-1 ${pct(top1, named.length)}, top-2 ${pct(top2, named.length)} (n=${named.length})  ·  none: said nothing ${pct(noneRight, none.length)} (n=${none.length})`)
}
console.log(`  "nothing" was right ${pct(saidNoneRight, saidNone)} of the time (${saidNoneRight}/${saidNone})`)
