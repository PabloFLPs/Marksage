import { beforeEach, describe, expect, it } from 'vitest'
import { HISTORY_KEY, HISTORY_LIMIT, entryTitle, loadHistory, numberedEntries, removeHistory, searchHistory, upsertHistory, type HistoryEntry } from '../../src/lib/history'

const entry = (id: string, content = `# ${id}\n\ntext`, updatedAt = Date.now()): HistoryEntry => ({ id, filename: null, content, savedContent: '', updatedAt })
const stored = () => loadHistory().map((e) => e.id)

beforeEach(() => localStorage.clear())

describe('Recent across tabs (the pre-launch review blocker)', () => {
  it("keeps another tab's document when this tab saves its own stale copy", () => {
    const tabA = upsertHistory([], entry('a')) // tab A: [a]
    // Tab B, meanwhile, adds b — written straight to storage, tab A's copy still says [a].
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry('b'), ...tabA]))
    upsertHistory(tabA, entry('a', '# a\n\nmore'))
    expect(stored()).toEqual(['a', 'b'])
  })

  it("doesn't bring back a document another tab removed", () => {
    const mine = [entry('a'), entry('b')]
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry('a')])) // the other tab removed b
    upsertHistory(mine, entry('a', '# a\n\nedited'))
    expect(stored()).toEqual(['a'])
  })

  it('removes from what storage holds', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry('a'), entry('b'), entry('c')]))
    removeHistory([entry('a')], 'b')
    expect(stored()).toEqual(['a', 'c'])
  })
})

describe('Recent', () => {
  it('moves an updated document to the top, once', () => {
    let list = upsertHistory([], entry('a'))
    list = upsertHistory(list, entry('b'))
    list = upsertHistory(list, entry('a', '# a\n\nagain'))
    expect(list.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('keeps no empty documents and at most HISTORY_LIMIT', () => {
    expect(upsertHistory([], entry('empty', '   '))).toEqual([])
    let list: HistoryEntry[] = []
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = upsertHistory(list, entry(`d${i}`))
    expect(list).toHaveLength(HISTORY_LIMIT)
    expect(list[0].id).toBe(`d${HISTORY_LIMIT + 4}`)
  })

  it('numbers the first nine documents other than the open one (1–9 in the menu)', () => {
    const list = Array.from({ length: 12 }, (_, i) => entry(`d${i}`))
    const numbered = numberedEntries(list, 'd0')
    expect(numbered).toHaveLength(9)
    expect(numbered[0].id).toBe('d1')
  })

  it('titles and searches like a person would', () => {
    expect(entryTitle({ filename: null, content: 'intro\n\n## Relatório anual' })).toBe('Relatório anual')
    expect(entryTitle({ filename: 'notes.md', content: '# x' })).toBe('notes.md')
    const list = [entry('a', '# Relatório anual'), entry('b', '# Something else')]
    expect(searchHistory(list, 'relatorio').map((e) => e.id)).toEqual(['a'])
  })
})
