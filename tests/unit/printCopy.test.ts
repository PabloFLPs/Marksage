import { afterEach, describe, expect, it } from 'vitest'
import { installPrintCopy } from '../../src/lib/printCopy'

const print = (phase: 'beforeprint' | 'afterprint') => window.dispatchEvent(new Event(phase))

describe('printCopy (⌘P / Save as PDF)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.className = ''
    document.title = ''
  })

  it('prints a light copy of the rendered document, named after it, and puts everything back after', () => {
    document.body.innerHTML = '<div id="root"><main><div class="markdown-body"><h1>Notes</h1><pre><code class="token">x</code></pre></div></main></div>'
    document.documentElement.className = 'dark'
    document.title = 'Marksage — Markdown editor'
    const uninstall = installPrintCopy(() => 'notes')

    print('beforeprint')
    const copy = document.getElementById('print-root')
    expect(copy?.querySelector('.markdown-body h1')?.textContent).toBe('Notes')
    expect(copy?.querySelector('code.token')).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.title).toBe('notes')

    print('afterprint')
    expect(document.getElementById('print-root')).toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.title).toBe('Marksage — Markdown editor')
    uninstall()
  })

  it('prints the Markdown source when only the editor is on screen', () => {
    document.body.innerHTML = '<div id="root"><main><textarea data-editor></textarea></main></div>'
    document.querySelector('textarea')!.value = '# Notes\n\nline'
    const uninstall = installPrintCopy(() => 'notes')
    print('beforeprint')
    expect(document.querySelector('#print-root .print-source')?.textContent).toBe('# Notes\n\nline')
    uninstall()
    expect(document.getElementById('print-root')).toBeNull()
  })

  it('changes nothing on a page with no document', () => {
    document.body.innerHTML = '<div id="root"><main><p>Start</p></main></div>'
    document.title = 'Marksage'
    const uninstall = installPrintCopy(() => 'document')
    print('beforeprint')
    expect(document.getElementById('print-root')).toBeNull()
    expect(document.title).toBe('Marksage')
    uninstall()
  })
})
