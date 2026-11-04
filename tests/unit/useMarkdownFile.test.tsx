import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkdownFile } from '../../src/hooks/useMarkdownFile'
import { loadDocument, saveDocument } from '../../src/lib/storage'
import { loadHistory } from '../../src/lib/history'

/** The document and Recent, as the app sees them: saved after a short pause, kept when switching, shared between tabs. */
describe('useMarkdownFile', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const settle = () => act(() => vi.advanceTimersByTime(400))

  it('saves the open document after a short pause, and lists it in Recent', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('# Notes\n\nfirst'))
    expect(loadDocument()).toBeNull() // not on every keystroke
    settle()
    expect(loadDocument()?.content).toBe('# Notes\n\nfirst')
    expect(loadHistory().map((e) => e.content)).toEqual(['# Notes\n\nfirst'])
  })

  it('stores New at once, so a reload right after it does not bring the previous document back', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('# Old'))
    settle()
    act(() => result.current.newDocument())
    // Stored as the new, empty document — which a reload doesn't reopen (the start screen instead), never '# Old'.
    expect(JSON.parse(localStorage.getItem('marksage:doc')!).content).toBe('')
    expect(loadDocument()).toBeNull()
  })

  it('Close document: nothing open, nothing stored, the document still in Recent', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('# Keep me'))
    settle()
    act(() => result.current.closeDocument())
    expect(result.current.document).toBeNull()
    expect(loadDocument()).toBeNull()
    expect(result.current.history.map((e) => e.content)).toEqual(['# Keep me'])
  })

  it('switching documents keeps the current one in Recent, edits included', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('# A'))
    act(() => result.current.updateContent('# A, edited'))
    act(() => result.current.pasteText('# B'))
    expect(result.current.history.map((e) => e.content)).toContain('# A, edited')
  })

  it('the same text pasted again reuses its Recent entry', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('# Same'))
    settle()
    const id = result.current.document?.id
    act(() => result.current.pasteText('# Other'))
    settle()
    act(() => result.current.pasteText('# Same'))
    expect(result.current.document?.id).toBe(id)
  })

  it('replaceUntouched changes a clean document only', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('# Sample EN', 'sample.md')) // an app document starts clean
    act(() => result.current.replaceUntouched('# Sample PT'))
    expect(result.current.document?.content).toBe('# Sample PT')
    expect(result.current.isDirty).toBe(false)
    act(() => result.current.updateContent('# Sample PT, mine'))
    act(() => result.current.replaceUntouched('# Sample EN'))
    expect(result.current.document?.content).toBe('# Sample PT, mine')
  })

  it('refuses files that are not Markdown, and binary text', async () => {
    const { result } = renderHook(() => useMarkdownFile())
    await act(async () => void (await result.current.openFile(new File(['hello'], 'notes.txt'))))
    expect(result.current.error).toBe('error.notMarkdown')
    await act(async () => void (await result.current.openFile(new File(['\u0000\u0001\u0002PNG'], 'image.md'))))
    expect(result.current.error).toBe('error.notText')
    await act(async () => void (await result.current.openFile(new File(['# Real'], 'real.md'))))
    expect(result.current.error).toBeNull()
    expect(result.current.document).toMatchObject({ filename: 'real.md', content: '# Real' })
  })

  it('Export marks it saved; an edit after makes it unsaved again', () => {
    const { result } = renderHook(() => useMarkdownFile())
    act(() => result.current.pasteText('text'))
    expect(result.current.isDirty).toBe(true)
    act(() => result.current.markSaved())
    expect(result.current.isDirty).toBe(false)
    act(() => result.current.updateContent('text!'))
    expect(result.current.isDirty).toBe(true)
  })

  describe('another tab saves the same document', () => {
    function otherTabSaves(id: string, content: string) {
      saveDocument({ id, filename: null, content, savedContent: '' })
      act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'marksage:doc', newValue: localStorage.getItem('marksage:doc') })))
    }

    it('an idle tab follows it', () => {
      const { result } = renderHook(() => useMarkdownFile())
      act(() => result.current.pasteText('# Shared'))
      settle()
      otherTabSaves(result.current.document!.id, '# Shared, from the other tab')
      expect(result.current.document?.content).toBe('# Shared, from the other tab')
      expect(result.current.conflict).toBe(false)
    })

    it('a tab with changes of its own asks; taking theirs keeps mine in Recent', () => {
      const { result } = renderHook(() => useMarkdownFile())
      act(() => result.current.pasteText('# Shared'))
      settle()
      act(() => result.current.updateContent('# Shared, mine'))
      otherTabSaves(result.current.document!.id, '# Shared, theirs')
      expect(result.current.conflict).toBe(true)
      expect(result.current.document?.content).toBe('# Shared, mine')
      act(() => result.current.resolveConflict(false))
      expect(result.current.document?.content).toBe('# Shared, theirs')
      expect(result.current.history.map((e) => e.content)).toContain('# Shared, mine')
    })

    it('keeping mine writes it over theirs', () => {
      const { result } = renderHook(() => useMarkdownFile())
      act(() => result.current.pasteText('# Shared'))
      settle()
      act(() => result.current.updateContent('# Shared, mine'))
      otherTabSaves(result.current.document!.id, '# Shared, theirs')
      act(() => result.current.resolveConflict(true))
      expect(loadDocument()?.content).toBe('# Shared, mine')
    })
  })
})
