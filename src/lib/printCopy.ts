/**
 * Printing and "Save as PDF" (⌘/Ctrl + P): the rendered document alone, in the app's theme, on as many pages as it
 * needs.
 *
 * The app is a fixed-height layout of scrolling panes, so the browser printed it as one cut-off page with the header
 * and buttons on it (launch QA D07). Before printing, a copy of the preview's rendered DOM — code highlighting and
 * all — goes into `#print-root`, which `@media print` shows instead of the app (`index.css`), with the page's
 * background printed, so a dark theme prints dark. The tab title becomes the document's name, which browsers use as
 * the PDF's file name. After printing, both go back.
 *
 * With no preview on screen (a phone, while editing) the copy is the Markdown source. With neither (the start
 * screen), nothing changes.
 */
export function installPrintCopy(getTitle: () => string | null): () => void {
  let restore: (() => void) | null = null

  const before = () => {
    restore?.()
    const source = document.querySelector<HTMLElement>('main .markdown-body')
    const editor = document.querySelector<HTMLTextAreaElement>('textarea[data-editor]')
    if (!source && !editor) return

    const root = document.createElement('div')
    root.id = 'print-root'
    if (source) {
      root.append(source.cloneNode(true))
    } else if (editor) {
      const pre = document.createElement('pre')
      pre.className = 'print-source'
      pre.textContent = editor.value
      root.append(pre)
    }
    document.body.append(root)

    const title = document.title
    const name = getTitle()
    if (name) document.title = name

    restore = () => {
      root.remove()
      document.title = title
      restore = null
    }
  }
  const after = () => restore?.()

  window.addEventListener('beforeprint', before)
  window.addEventListener('afterprint', after)
  return () => {
    window.removeEventListener('beforeprint', before)
    window.removeEventListener('afterprint', after)
    restore?.()
  }
}

/**
 * Export → PDF: opens the print dialog once the rendered document is on screen — the caller may have just switched a
 * phone from the editor to the preview — so the copy above is the rendered document, not its source. After about a
 * second it prints whatever is there.
 */
export function printWhenRendered(): void {
  let frames = 0
  const tick = () => {
    if (document.querySelector('main .markdown-body') || ++frames > 60) window.print()
    else window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}
