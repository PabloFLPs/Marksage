import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useViewMode } from '../../src/hooks/useViewMode'
import { useOutlinePanel } from '../../src/hooks/useOutlinePanel'
import { useInfoPages, EXIT_MS } from '../../src/hooks/useInfoPages'
import { useGlobalInput } from '../../src/hooks/useGlobalInput'
import { loadOutlineOpen } from '../../src/lib/storage'
import { en } from '../../src/lib/locales/en'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())
const exit = () => act(() => vi.advanceTimersByTime(EXIT_MS + 10))

describe('useViewMode', () => {
  it('the editor closes after its exit animation, and a read-only document never opens it', () => {
    const { result, rerender } = renderHook((p) => useViewMode(p), { initialProps: { readOnly: false, isDesktop: true, hasDocument: true } })
    expect(result.current.viewMode).toBe('preview')
    act(() => result.current.changeViewMode('edit'))
    expect(result.current.viewMode).toBe('edit')
    act(() => result.current.changeViewMode('preview'))
    expect(result.current).toMatchObject({ viewMode: 'edit', editorClosing: true }) // still sliding out
    exit()
    expect(result.current).toMatchObject({ viewMode: 'preview', editorClosing: false })

    rerender({ readOnly: true, isDesktop: true, hasDocument: true })
    act(() => result.current.changeViewMode('edit'))
    expect(result.current.viewMode).toBe('preview')
  })

  it('reopening the editor during its exit cancels the exit', () => {
    const { result } = renderHook(() => useViewMode({ readOnly: false, isDesktop: true, hasDocument: true }))
    act(() => result.current.changeViewMode('edit'))
    act(() => result.current.changeViewMode('preview'))
    act(() => result.current.changeViewMode('edit'))
    exit()
    expect(result.current).toMatchObject({ viewMode: 'edit', editorClosing: false })
  })

  it('a phone opening on a document starts in the editor; a desktop in the preview', () => {
    expect(renderHook(() => useViewMode({ readOnly: false, isDesktop: false, hasDocument: true })).result.current.viewMode).toBe('edit')
    expect(renderHook(() => useViewMode({ readOnly: false, isDesktop: true, hasDocument: true })).result.current.viewMode).toBe('preview')
    expect(renderHook(() => useViewMode({ readOnly: false, isDesktop: false, hasDocument: false })).result.current.viewMode).toBe('preview')
  })
})

describe('useOutlinePanel', () => {
  it('the document bar icons: open on a tab, switch tabs, close on the tab showing', () => {
    const { result } = renderHook(() => useOutlinePanel({ isDesktop: true, available: true }))
    expect(result.current.openPanelTab).toBeNull()
    act(() => result.current.toggleTab('suggestions'))
    expect(result.current.openPanelTab).toBe('suggestions')
    act(() => result.current.toggleTab('document'))
    expect(result.current.openPanelTab).toBe('document')
    act(() => result.current.toggleTab('document'))
    expect(result.current.openPanelTab).toBeNull() // closing (its exit animation)
    exit()
    expect(result.current.outlineOpen).toBe(false)
  })

  it('desktop remembers open / closed; a phone never does', () => {
    const desk = renderHook(() => useOutlinePanel({ isDesktop: true, available: true }))
    act(() => desk.result.current.toggleOutline())
    expect(loadOutlineOpen()).toBe(true)
    localStorage.clear()
    const phone = renderHook(() => useOutlinePanel({ isDesktop: false, available: true }))
    act(() => phone.result.current.toggleOutline())
    expect(phone.result.current.outlineShown).toBe(true)
    expect(loadOutlineOpen()).toBe(false)
  })

  it('not shown where there is no document on screen', () => {
    const { result } = renderHook(() => useOutlinePanel({ isDesktop: true, available: false }))
    act(() => result.current.toggleOutline())
    expect(result.current).toMatchObject({ outlineOpen: true, outlineShown: false, openPanelTab: null })
  })
})

describe('useInfoPages', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })
  const go = (hash: string) =>
    act(() => {
      window.location.hash = hash
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

  it('a hash opens its page and names the tab; "#ABOUT" works too', () => {
    window.history.replaceState(null, '', '/#ABOUT')
    const { result } = renderHook(() => useInfoPages())
    expect(result.current.infoPage).toBe('about')
    expect(document.title).toMatch(/About/)
  })

  it('a docs page opened from About goes back to About, and says so', () => {
    const { result } = renderHook(() => useInfoPages())
    go('about')
    go('smart-assist')
    exit()
    expect(result.current.infoPage).toBe('docs')
    expect(result.current.backLabel).toMatch(/About/)
  })

  it('a direct link to a docs page: Back goes to About, then to the app', () => {
    window.history.replaceState(null, '', '/#models')
    const { result } = renderHook(() => useInfoPages())
    act(() => result.current.closeAbout())
    exit()
    expect(result.current.infoPage).toBe('about')
    expect(window.location.hash).toBe('#about')
    act(() => result.current.closeAbout())
    exit()
    expect(result.current.infoPage).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('the logo goes straight back to the app', () => {
    window.history.replaceState(null, '', '/#story')
    const { result } = renderHook(() => useInfoPages())
    act(() => result.current.goHome())
    exit()
    expect(result.current.showAbout).toBe(false)
    expect(document.title).toBe(en['app.title'])
  })
})

describe('useGlobalInput', () => {
  function setup(over: Partial<Parameters<typeof useGlobalInput>[0]> = {}) {
    const o = {
      hasDocument: true,
      showAbout: false,
      exportOpen: false,
      openExport: vi.fn(),
      togglePalette: vi.fn(),
      onImport: vi.fn(),
      onCopy: vi.fn(),
      closeAbout: vi.fn(),
      openFile: vi.fn(async () => true),
      pasteText: vi.fn(),
      showResult: vi.fn(),
      showNotice: vi.fn(),
      t: (k: string) => k,
      ...over,
    }
    renderHook(() => useGlobalInput(o))
    return o
  }
  const key = (k: string, mods: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, metaKey: true, cancelable: true, ...mods }))

  it('⌘K, ⌘O, ⌘S and ⌘⇧C', () => {
    const o = setup()
    key('k')
    key('o')
    key('s')
    key('C', { shiftKey: true })
    for (const f of [o.togglePalette, o.onImport, o.openExport, o.onCopy]) expect(f).toHaveBeenCalledTimes(1)
  })

  it('⌘S does nothing without a document or on an info page; Ctrl works like ⌘', () => {
    const none = setup({ hasDocument: false })
    key('s', { metaKey: false, ctrlKey: true })
    expect(none.openExport).not.toHaveBeenCalled()
    const about = setup({ showAbout: true })
    key('s')
    expect(about.openExport).not.toHaveBeenCalled()
  })

  it('Esc leaves an info page — unless a menu is open', () => {
    const o = setup({ showAbout: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(o.closeAbout).toHaveBeenCalledTimes(1)
    const menu = document.body.appendChild(Object.assign(document.createElement('div'), { role: 'menu' }))
    menu.setAttribute('role', 'menu')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(o.closeAbout).toHaveBeenCalledTimes(1)
    menu.remove()
  })

  it('text pasted outside the editor opens as a document; inside a field it does not', () => {
    const o = setup()
    const paste = (target: EventTarget, text: string) => {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } })
      target.dispatchEvent(e)
    }
    paste(document.body, '# Pasted')
    expect(o.pasteText).toHaveBeenCalledWith('# Pasted')
    const input = document.body.appendChild(document.createElement('input'))
    paste(input, '# Into the field')
    paste(document.body, '   ')
    expect(o.pasteText).toHaveBeenCalledTimes(1)
    input.remove()
  })
})
