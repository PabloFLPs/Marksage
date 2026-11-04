import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../src/App'
import { I18nProvider } from '../../src/components/I18nProvider'
import { loadDocument } from '../../src/lib/storage'

/**
 * The whole app in happy-dom (no layout, no real browser): the screens and what moves between them. The Playwright
 * suite drives the same flows in Chromium, WebKit and Firefox; this one runs in a second, with the code coverage.
 */
function mount() {
  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  )
}
const settle = () => act(async () => new Promise((r) => setTimeout(r, 400)))
const header = () => within(document.querySelector('header')!)

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // A desktop: the split view and the docked Outline.
  window.matchMedia = ((q: string) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(cleanup)

describe('App', () => {
  it('start screen → Start writing → the document is saved and listed', async () => {
    mount()
    expect(screen.getByRole('button', { name: 'Try it on a sample document' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
    const editor = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: '# Groceries\n\n- milk' } })
    await settle()
    expect(loadDocument()?.content).toBe('# Groceries\n\n- milk')
    expect(document.querySelector('footer')?.textContent).toMatch(/3 lines/)
  })

  it('the sample opens in the editor with Smart Assist on, and Close document goes back to the start', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Try it on a sample document' }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toMatch(/^# Pitwall/)
    expect(header().getByRole('button', { name: /^Assist: Rules/ })).toBeTruthy()
    await settle()
    fireEvent.click(header().getByRole('button', { name: 'Close document' }))
    await settle()
    expect(screen.getByRole('button', { name: 'Try it on a sample document' })).toBeTruthy()
    expect(screen.getByText(/pitwall-README\.md/)).toBeTruthy() // in Recent
  })

  it('Preview and Edit switch views; the Outline lists the sections', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Doc\n\n## Install\n\ntext\n\n## Usage\n\nmore' } })
    fireEvent.click(header().getByRole('button', { name: /^Preview/ }))
    await settle()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('.markdown-body h2')?.textContent).toBe('Install')
    fireEvent.click(screen.getByRole('group', { name: 'Outline and document insights' }).querySelector('button[aria-pressed]')!)
    await settle()
    expect(screen.getByRole('complementary').textContent).toMatch(/Install[\s\S]*Usage/)
  })

  it('⌘K opens the palette with the screen’s commands; About opens from it, and Esc leaves it', async () => {
    mount()
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })))
    const box = await screen.findByRole('combobox')
    fireEvent.change(box, { target: { value: 'sobre' } }) // Portuguese keyword, English UI
    fireEvent.keyDown(box, { key: 'Enter' })
    await settle()
    expect(window.location.hash).toBe('#about')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Marksage' }, { timeout: 3000 })).toBeTruthy()
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await settle()
    expect(screen.getByRole('button', { name: 'Start writing' })).toBeTruthy()
  })

  it('a reload brings the stored document back, with its name', async () => {
    localStorage.setItem('marksage:doc', JSON.stringify({ id: 'x1', filename: 'kept.md', content: '# Kept' }))
    mount()
    expect(await header().findByRole('button', { name: 'kept.md' })).toBeTruthy()
    expect(document.querySelector('.markdown-body h1')?.textContent).toBe('Kept')
  })
})
