/**
 * Writes training/intent/test.v1.template.tsv: the blank sheet for Pablo's intent test set (ROADMAP §0.3, G2).
 *
 *   node --experimental-strip-types training/intent/make-test-template.ts
 *
 * Every command gets 5 rows per language and `none` 35, with the language and the id filled in; the query column is
 * his. Saved as test.v1.tsv, it's frozen (its hash in training/locks/intent-test-v1.json) before any training.
 */
import { writeFileSync } from 'node:fs'
import { COMMANDS, type CommandContext } from '../../src/commands/registry.ts'
import { translate } from '../../src/lib/i18n.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const PER_COMMAND = 5
const PER_NONE = 35
const ctx: CommandContext = { hasDocument: true, showAbout: false, readOnly: false, editing: true, isDesktop: true, outlineShown: false, theme: 'light', assistMode: 'heuristics', lang: 'en', hasSelection: true }

const lines = [
  '# Marksage intent test set v1 — written by Pablo, frozen before any training (ROADMAP §0.3).',
  '# Columns (tab-separated): lang, id, query, src. Fill in the query column the way you would type it in ⌘K:',
  '# short forms, typos and slang welcome. src: "written" (made up for this set) or "real" (something you typed or',
  '# would type). Add rows freely; rows left without a query are skipped. "none" = something the palette can\'t do.',
  '# Don\'t look at the registry\'s search words or the training phrases: this set measures your words, not ours.',
  '',
]
for (const c of COMMANDS) {
  const t = c.title(ctx)
  lines.push(`# ${c.id} — ${translate('en', t.key, t.vars)} / ${translate('pt-BR', t.key, t.vars)}`)
  for (const lang of ['en', 'pt-BR']) for (let i = 0; i < PER_COMMAND; i++) lines.push(`${lang}\t${c.id}\t\twritten`)
  lines.push('')
}
lines.push('# none — something the palette can\'t do (make bold, insert an image, undo, translate…)')
for (const lang of ['en', 'pt-BR']) for (let i = 0; i < PER_NONE; i++) lines.push(`${lang}\tnone\t\twritten`)
writeFileSync(`${ROOT}training/intent/test.v1.template.tsv`, lines.join('\n') + '\n')
console.log(`training/intent/test.v1.template.tsv: ${COMMANDS.length} commands × 2 languages × ${PER_COMMAND} + none × 2 × ${PER_NONE}`)
