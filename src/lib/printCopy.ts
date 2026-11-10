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
 * Prints the rendered document from a hidden iframe, so the page on screen never switches to the print layout —
 * printing the page itself made it blink, before the preview (⌘P) or after the dialog (a button: `print()` blocks
 * painting until it closes). The frame gets the same stylesheets, the `<html>` classes and attributes (theme,
 * accent, language), the document's name as its title, and `#print-root` with a copy of the preview, so the print
 * CSS above applies unchanged. Returns false when there's no rendered document on screen (the caller lets the
 * browser print the page; `installPrintCopy` covers that).
 */
export function printDocument(title: string | null): boolean {
  const source = document.querySelector<HTMLElement>('main .markdown-body')
  if (!source) return false
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', opacity: '0', pointerEvents: 'none' })
  document.body.append(frame)
  const win = frame.contentWindow
  const doc = frame.contentDocument
  if (!win || !doc) {
    frame.remove()
    return false
  }
  const html = document.documentElement
  for (const { name, value } of Array.from(html.attributes)) doc.documentElement.setAttribute(name, value)
  doc.title = title ?? document.title
  const loads: Promise<unknown>[] = []
  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    const copy = node.cloneNode(true) as HTMLElement
    if (copy instanceof HTMLLinkElement)
      loads.push(
        new Promise((done) => {
          copy.addEventListener('load', done, { once: true })
          copy.addEventListener('error', done, { once: true })
        }),
      )
    doc.head.append(copy)
  }
  const root = doc.createElement('div')
  root.id = 'print-root'
  root.append(doc.importNode(source, true))
  doc.body.append(root)

  // Chrome names the PDF after the page's title, not the frame's: both carry the document's name while printing.
  const pageTitle = document.title
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    document.title = pageTitle
    frame.remove()
  }
  win.addEventListener('afterprint', () => window.setTimeout(cleanup))
  void Promise.all(loads).then(() => {
    if (title) document.title = title
    win.focus()
    win.print()
    // Cleanup: on the frame's afterprint; else when the page has focus back after the dialog; a minute at most.
    window.addEventListener('focus', () => window.setTimeout(cleanup), { once: true })
    window.setTimeout(cleanup, 60_000)
  })
  return true
}

/**
 * Export → PDF: prints once the rendered document is on screen — the caller may have just switched a phone from
 * the editor to the preview. After about a second it lets the browser print the page (the source, on a phone).
 */
export function printWhenRendered(title: string | null): void {
  let frames = 0
  const tick = () => {
    if (printDocument(title)) return
    if (++frames > 60) window.print()
    else window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}

/** ⌘/Ctrl + P prints the rendered document from the frame too, when there is one; otherwise the browser's own. */
export function installPrintShortcut(getTitle: () => string | null): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'p') return
    if (printDocument(getTitle())) e.preventDefault()
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}
