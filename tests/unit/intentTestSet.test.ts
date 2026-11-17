import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTestSet } from '../../training/intent/testSet'
import { COMMANDS } from '../../src/commands/registry'

const ids = new Set(COMMANDS.map((c) => c.id))

describe('intent test set (Markdown)', () => {
  it('the blank template reads as no rows, without errors', () => {
    expect(parseTestSet(readFileSync('training/intent/test.v1.template.md', 'utf8'), ids)).toEqual([])
  })

  it('reads ## id, ### language and one query per list item; "(real)" marks real queries', () => {
    const md = '# t\n\n> - not a row\n\n## pdf\n\n*Save as PDF*\n\n### en\n\n- save as pdf\n- \n\n### pt-BR\n\n- (real) salva em pdf\n\n## none\n\n### pt-BR\n\n- deixa em negrito\n'
    expect(parseTestSet(md, ids)).toEqual([
      { q: 'save as pdf', lang: 'en', id: 'pdf', src: 'written' },
      { q: 'salva em pdf', lang: 'pt-BR', id: 'pdf', src: 'real' },
      { q: 'deixa em negrito', lang: 'pt-BR', id: 'none', src: 'written' },
    ])
  })

  it('a typo in a heading stops the read instead of dropping rows', () => {
    expect(() => parseTestSet('## pfd\n### en\n- x', ids)).toThrow(/isn't a command id/)
    expect(() => parseTestSet('## pdf\n### pt\n- x', ids)).toThrow(/isn't en or pt-BR/)
  })
})
