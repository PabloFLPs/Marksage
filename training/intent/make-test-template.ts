/**
 * Writes training/intent/test.v1.template.md: the blank sheet for Pablo's intent test set (ROADMAP §0.3, G2). He copies
 * it to test.v1.md and fills it in Marksage; `testSet.ts` reads it. Frozen (its hash in training/locks/) before any
 * training.
 *
 *   node --experimental-strip-types training/intent/make-test-template.ts
 */
import { writeFileSync } from 'node:fs'
import { COMMANDS, type CommandContext } from '../../src/commands/registry.ts'
import { translate } from '../../src/lib/i18n.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const PER_COMMAND = 5
const PER_NONE = 20
const ctx: CommandContext = { hasDocument: true, showAbout: false, readOnly: false, editing: true, isDesktop: true, outlineShown: false, theme: 'light', assistMode: 'heuristics', lang: 'en', hasSelection: true }

const blanks = (n: number) => Array.from({ length: n }, () => '- ').join('\n')
const out: string[] = [
  '# Conjunto de teste do modelo de intenção (v1)',
  '',
  '> **Como preencher.** Em cada comando, escreva em cada item de lista o que você digitaria no ⌘K para chegar nele:',
  '> do seu jeito, com abreviações, gírias e erros de digitação quando for natural. Cerca de 5 por idioma; pode',
  '> acrescentar mais itens, e item vazio é ignorado. Comece o item com `(real)` quando for algo que você de fato',
  '> digitou ou digitaria (`- (real) salva em pdf`). Não olhe `phrases.ts` nem as palavras de busca do registro: este',
  '> conjunto mede as **suas** palavras. Não mude os títulos `##` e `###`: eles dizem o comando e o idioma.',
  '>',
  '> Salve como `training/intent/test.v1.md`. Quando terminar, ele é congelado (hash em `training/locks/`) antes de',
  '> qualquer treino, e usado uma vez só, para comparar o modelo com o fuzzy (ROADMAP §0.3, D7).',
  '',
]
for (const c of COMMANDS) {
  const t = c.title(ctx)
  out.push(`## ${c.id}`, '', `*${translate('en', t.key, t.vars)} · ${translate('pt-BR', t.key, t.vars)}*`, '')
  for (const lang of ['en', 'pt-BR']) out.push(`### ${lang}`, '', blanks(PER_COMMAND), '')
}
out.push('## none', '', '*Algo que a palette **não** faz: negrito, inserir imagem, desfazer, traduzir…*', '')
for (const lang of ['en', 'pt-BR']) out.push(`### ${lang}`, '', blanks(PER_NONE), '')
writeFileSync(`${ROOT}training/intent/test.v1.template.md`, out.join('\n'))
console.log(`training/intent/test.v1.template.md: ${COMMANDS.length} commands × 2 languages × ${PER_COMMAND} + none × 2 × ${PER_NONE}`)
