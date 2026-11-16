import { describe, expect, it } from 'vitest'
import { editDistance, fuzzyMatcher, wordScore } from '../../src/commands/fuzzyMatcher'
import type { MatchItem } from '../../src/commands/matcher'
import { availableCommands, type CommandContext, type CommandGroup } from '../../src/commands/registry'
import { translate } from '../../src/lib/i18n'

// The palette's real list on an open document in the editor, UI in English (names in Portuguese as aliases).
const ctx: CommandContext = { hasDocument: true, showAbout: false, readOnly: false, editing: true, isDesktop: true, outlineShown: false, theme: 'light', assistMode: 'heuristics', lang: 'en' }
const groupName: Record<CommandGroup, string> = { document: 'Document', view: 'View', assist: 'Smart Assist', goto: 'Go to' }
const items: MatchItem[] = availableCommands(ctx).map((d) => {
  const title = d.title(ctx)
  return { id: d.id, label: translate('en', title.key, title.vars), aliases: [translate('pt-BR', title.key, title.vars)], keywords: d.keywords(ctx), group: groupName[d.group] }
})
const ranked = (query: string) => fuzzyMatcher.rank(query, items).map((r) => r.id)

describe('editDistance', () => {
  it('counts a swap of neighbors as one edit and stops past the limit', () => {
    expect(editDistance('exprot', 'export', 2)).toBe(1)
    expect(editDistance('thme', 'theme', 1)).toBe(1)
    expect(editDistance('abc', 'abc', 1)).toBe(0)
    expect(editDistance('markdown', 'dark', 1)).toBe(2) // length gap alone is past 1
  })
})

describe('wordScore', () => {
  it('exact > start > inside > typo, and no typos on short words', () => {
    expect(wordScore('pdf', 'pdf')).toBe(1)
    expect(wordScore('exp', 'export')).toBe(0.9)
    expect(wordScore('port', 'export')).toBe(0.7)
    expect(wordScore('exprot', 'export')).toBe(0.5)
    expect(wordScore('pfd', 'pdf')).toBe(0) // 3 letters: no typos
    expect(wordScore('thme', 'the')).toBe(0) // no typos against a 3-letter word
    expect(wordScore('dark', 'markdown')).toBe(0) // a typo in a word's start needs 5 typed letters
  })
})

describe('fuzzyMatcher on the palette', () => {
  it('an empty query keeps every command, in order', () => {
    expect(ranked('  ')).toEqual(items.map((i) => i.id))
  })

  it('the name first, search words after', () => {
    expect(ranked('exp')).toEqual(['export', 'pdf'])
  })

  it('every typed word must match', () => {
    expect(ranked('rules ai')).toEqual(['assist-model'])
    expect(ranked('export pdf')).toEqual(['pdf'])
  })

  it('either language, accents optional', () => {
    expect(ranked('salvar pdf')).toEqual(['pdf'])
    expect(ranked('tema escuro')).toEqual(['theme'])
    expect(ranked('sugestoes')).toEqual(['outline'])
    expect(ranked('privacidade')).toEqual(['privacy'])
  })

  it('forgives typos', () => {
    expect(ranked('exprot')[0]).toBe('export')
    expect(ranked('thme')).toEqual(['theme'])
    expect(ranked('outlien')).toEqual(['outline'])
    expect(ranked('expotr markdwon')).toEqual(['export'])
  })

  it('a solid match hides the noise next to it', () => {
    expect(ranked('dark')).toEqual(['theme'])
    expect(ranked('pfd')).toEqual([])
  })
})
