import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocName } from '../../src/components/DocName'
import { CommandPalette, type Command } from '../../src/components/CommandPalette'
import { SuggestionBar } from '../../src/components/SuggestionBar'
import { DocBar } from '../../src/components/DocBar'
import { HistoryList } from '../../src/components/HistoryList'
import { MarkdownPreview } from '../../src/components/MarkdownPreview'
import type { Suggestion } from '../../src/assist/types'
import type { HistoryEntry } from '../../src/lib/history'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('DocName (rename in the header)', () => {
  it('Enter keeps the new name, with .md added; Esc cancels', () => {
    const onRename = vi.fn()
    render(<DocName filename="notes.md" isDirty={false} onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'notes.md' }))
    const input = screen.getByRole('textbox', { name: /name/i })
    fireEvent.change(input, { target: { value: 'meeting' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('meeting.md')

    fireEvent.click(screen.getByRole('button', { name: 'notes.md' }))
    const again = screen.getByRole('textbox', { name: /name/i })
    fireEvent.change(again, { target: { value: 'other' } })
    fireEvent.keyDown(again, { key: 'Escape' })
    fireEvent.blur(again)
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it('an untitled document says so, and the unsaved star is labelled', () => {
    render(<DocName filename={null} isDirty onRename={() => {}} />)
    expect(screen.getByRole('button', { name: 'Untitled' })).toBeTruthy()
    expect(screen.getByLabelText(/Not exported yet/)).toBeTruthy()
  })
})

describe('CommandPalette', () => {
  const run = { exportCmd: vi.fn(), about: vi.fn() }
  const commands: Command[] = [
    { id: 'export', group: 'Document', icon: null, label: 'Export Markdown', keywords: 'export save download exportar salvar baixar', run: run.exportCmd },
    { id: 'about', group: 'Go to', icon: null, label: 'About Marksage', keywords: 'about help sobre ajuda', run: run.about },
  ]
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('finds by keywords in both languages, accents ignored, and Enter runs the first', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={commands} />)
    const box = screen.getByRole('combobox')
    fireEvent.change(box, { target: { value: 'SALVÁR' } }) // accent and case folded; "salvar" is a PT keyword
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Export Markdown')])
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(run.exportCmd).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('↓ moves to the next one; every word must match; nothing found says so', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />)
    const box = screen.getByRole('combobox')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(run.about).toHaveBeenCalledTimes(1)
    fireEvent.change(box, { target: { value: 'export about' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('SuggestionBar', () => {
  const suggestion: Suggestion = {
    key: 'fence:1',
    feature: 'codeFence',
    label: 'Add language “bash” to code block',
    confidence: 0.97,
    edit: { from: 3, to: 3, insert: 'bash' },
    expected: '',
  }

  it('Accept and Dismiss are named by their visible words, and call back', () => {
    const onAccept = vi.fn()
    const onDismiss = vi.fn()
    render(<SuggestionBar suggestion={suggestion} onAccept={onAccept} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /^Accept/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Dismiss/ }))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/97%/)).toBeTruthy()
  })
})

describe('DocBar', () => {
  it('one pressed icon per open tab, the pending count read with Suggestions', () => {
    const onTab = vi.fn()
    render(<DocBar kind={null} name="notes.md" copied={false} onCopy={() => {}} copyTitle="Copy" tabs={['outline', 'document', 'suggestions']} openTab="outline" onTab={onTab} pending={12} />)
    const outline = screen.getByRole('button', { name: 'Outline' })
    expect(outline.getAttribute('aria-pressed')).toBe('true')
    const suggestions = screen.getByRole('button', { name: /^Suggestions/ })
    expect(suggestions.getAttribute('aria-pressed')).toBe('false')
    expect(suggestions.textContent).toContain('12')
    fireEvent.click(suggestions)
    expect(onTab).toHaveBeenCalledWith('suggestions')
  })
})

describe('HistoryList (Recent)', () => {
  const entry = (id: string, content: string, at: number): HistoryEntry => ({ id, filename: null, content, savedContent: content, updatedAt: at })
  const entries = [entry('a', '# Alpha', 3), entry('b', '# Bravo', 2), entry('c', '# Charlie', 1)]

  it('numbers the other documents 1–9, the open one disabled', () => {
    const onOpen = vi.fn()
    render(<HistoryList entries={entries} currentId="a" onOpen={onOpen} onRemove={() => {}} numbered />)
    const alpha = screen.getByRole('button', { name: /^Alpha/ }) as HTMLButtonElement
    expect(alpha.disabled).toBe(true)
    const bravo = screen.getByRole('button', { name: /^Bravo/ })
    expect(bravo.querySelector('kbd')?.textContent).toBe('1')
    fireEvent.click(bravo)
    expect(onOpen).toHaveBeenCalledWith(entries[1])
  })

  it('remove takes that entry only', () => {
    const onRemove = vi.fn()
    render(<HistoryList entries={entries} onOpen={() => {}} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Charlie from history' }))
    expect(onRemove).toHaveBeenCalledWith('c')
  })
})

describe('MarkdownPreview', () => {
  const show = async (content: string, props: Partial<Parameters<typeof MarkdownPreview>[0]> = {}) => {
    const view = render(<MarkdownPreview content={content} {...props} />)
    await act(async () => {}) // lazy highlighting and deferred work settle
    return view
  }

  it('renders GFM, with each block carrying its source line', async () => {
    const { container } = await show('# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ https://example.com')
    expect(container.querySelector('h1')?.getAttribute('data-line')).toBe('1')
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelector('del')?.textContent).toBe('gone')
    expect(container.querySelector('a[href="https://example.com"]')?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it("a section's readability dot is shown, but stays out of the heading's name", async () => {
    const { container } = await show('## Install\n\ntext', { readability: [{ heading: 'Install', value: 0, label: 'very easy' }] })
    expect(container.querySelector('h2 [aria-hidden][title^="Readability"]')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Install' })).toBeTruthy()
  })

  it('task boxes are named Done / Not done', async () => {
    await show('- [x] shipped\n- [ ] later')
    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Not done' })).toBeTruthy()
  })

  it('images from other websites wait for permission, and never send a referrer', async () => {
    const { container, rerender } = await show('![chart](https://cdn.example.com/c.png)')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('cdn.example.com')
    rerender(<MarkdownPreview content="![chart](https://cdn.example.com/c.png)" remoteImages />)
    expect(container.querySelector('img')?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('an address without "//" that still reaches another site waits too (https:host, https:/host)', async () => {
    const { container } = await show('![b](https:b.example/p.png) ![c](https:/c.example/p.png)')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('b.example')
    expect(container.textContent).toContain('c.example')
  })

  it('raw HTML shows as text — no element, no script', async () => {
    const { container } = await show('<script>alert(1)</script>\n\n<b>bold?</b>')
    expect(container.querySelector('script, b')).toBeNull()
  })

  it('an in-document link scrolls the preview instead of changing the page hash', async () => {
    const { container } = await show('[go](#install)\n\n## Install')
    window.history.replaceState(null, '', '/')
    fireEvent.click(container.querySelector('a[href="#install"]')!)
    expect(window.location.hash).toBe('')
  })
})

describe('DocumentTab', () => {
  const fence = '```\nx = 1\n```\n'
  it('a section-type chip goes to its section, and with several, to the next one each time', async () => {
    const { DocumentTab } = await import('../../src/components/DocumentTab')
    const { buildOutline } = await import('../../src/assist/outline')
    const text = '# Tool\n\n## Installation\n\nRun it.\n\n## Usage\n\nUse it.\n\n## Requirements\n\nNode 20.\n'
    const onSelect = vi.fn()
    render(<DocumentTab text={text} items={buildOutline(text)} filename="README.md" onSelect={onSelect} />)
    const setup = screen.getByRole('button', { name: /^Setup 2 ?, go to “Installation” \(1 of 2\)$/ })
    fireEvent.click(setup)
    expect(screen.getByRole('button', { name: /^Setup 2 ?, go to “Requirements” \(2 of 2\)$/ })).toBe(setup)
    fireEvent.click(setup)
    fireEvent.click(setup)
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([2, 10, 2])
    fireEvent.click(screen.getByRole('button', { name: /^Guide 1 ?, go to “Usage”$/ }))
    expect(onSelect).toHaveBeenLastCalledWith(6)
  })

  it('"+N more" shows the rest of a flag group, and "Show fewer" hides it again', async () => {
    vi.useFakeTimers()
    try {
      const { DocumentTab } = await import('../../src/components/DocumentTab')
      const { buildOutline } = await import('../../src/assist/outline')
      const text = '# Code\n\n' + fence.repeat(8)
      render(<DocumentTab text={text} items={buildOutline(text)} filename={null} onSelect={() => {}} />)
      const lineChips = () => screen.queryAllByRole('button', { name: /^Line \d+$/ }).length
      expect(lineChips()).toBe(6)
      const more = screen.getByRole('button', { name: '+2 more' })
      expect(more.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(more)
      expect(lineChips()).toBe(8)
      expect(more.textContent).toBe('Show fewer')
      expect(more.getAttribute('aria-expanded')).toBe('true')
      fireEvent.click(more)
      act(() => void vi.advanceTimersByTime(200)) // the exit animation
      expect(lineChips()).toBe(6)
      expect(more.textContent).toBe('+2 more')
    } finally {
      vi.useRealTimers()
    }
  })
})
