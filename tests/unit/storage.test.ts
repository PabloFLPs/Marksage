import { beforeEach, describe, expect, it } from 'vitest'

beforeEach(() => localStorage.clear())

describe('Delete all Marksage data', () => {
  it("removes every marksage: key, leaves other sites' keys, and nothing is written back", async () => {
    // A fresh module per test: "wiped" is module state until the reload.
    const storage = await import('../../src/lib/storage')
    localStorage.setItem('marksage:theme', 'dark')
    localStorage.setItem('marksage:history', '[]')
    localStorage.setItem('other-app', 'keep')
    await storage.deleteAllLocalData()
    expect(Object.keys(localStorage).filter((k) => k.startsWith('marksage:'))).toEqual([])
    expect(localStorage.getItem('other-app')).toBe('keep')
    // The pagehide flush after "Delete all" must not save the open document again.
    expect(storage.saveDocument({ filename: 'a.md', content: 'x', savedContent: 'x' })).toBe(true)
    expect(localStorage.getItem('marksage:doc')).toBeNull()
  })
})

describe('the open document', () => {
  it('stores savedContent only when it differs, and reads both back', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const storage = await import('../../src/lib/storage')
    storage.saveDocument({ id: '1', filename: 'a.md', content: 'same', savedContent: 'same' })
    expect(JSON.parse(localStorage.getItem('marksage:doc')!)).not.toHaveProperty('savedContent')
    expect(storage.loadDocument()).toMatchObject({ id: '1', content: 'same', savedContent: 'same' })
    storage.saveDocument({ id: '1', filename: 'a.md', content: 'edited', savedContent: 'same' })
    expect(storage.loadDocument()).toMatchObject({ content: 'edited', savedContent: 'same' })
  })

  it('starts in Rules on a first visit, keeps a stored Off', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    const storage = await import('../../src/lib/storage')
    expect(storage.loadAssistMode()).toBe('heuristics')
    storage.saveAssistMode('off')
    expect(storage.loadAssistMode()).toBe('off')
  })
})
