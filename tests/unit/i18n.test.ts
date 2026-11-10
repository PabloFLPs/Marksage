import { describe, expect, it } from 'vitest'
import { countKey, translate } from '../../src/lib/i18n'
import { kindReason } from '../../src/lib/docKind'

describe('i18n counts', () => {
  it('uses the .one key for exactly one, when there is one', () => {
    expect(countKey('history.chars', 1)).toBe('history.chars.one')
    expect(countKey('history.chars', 0)).toBe('history.chars')
    expect(countKey('history.chars', 2)).toBe('history.chars')
    expect(countKey('action.export', 1)).toBe('action.export') // no .one: unchanged
  })

  it('says "1 char", "Clear 1 document?" and "1 section" in both languages', () => {
    for (const [lang, want] of [
      ['en', ['1 char', 'Clear 1 document?', '1 section · 0 typed']],
      ['pt-BR', ['1 caractere', 'Limpar 1 documento?', '1 seção · 0 com tipo identificado']],
    ] as const) {
      expect(translate(lang, countKey('history.chars', 1), { n: 1 })).toBe(want[0])
      expect(translate(lang, countKey('history.clearAsk', 1), { n: 1 })).toBe(want[1])
      expect(translate(lang, countKey('outline.count', 1), { n: 1, typed: 0 })).toBe(want[2])
    }
  })

  it('counts each part of a long, structured document on its own', () => {
    const t = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars)
    const reason = kindReason({ id: 'docs', because: ['shape:12,1,2'] }, t)
    expect(reason).toBe('Long and structured: 12 sections, 1 table, 2 code blocks')
  })
})
