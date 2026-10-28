import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { editorLineTops, previewAnchors } from '../lib/scrollSync'

/** How far below the top edge a section counts as "the one being read". */
const PROBE_PX = 48
/** Side padding of the Outline hover tint: the readability dot sits 10–16 px left of a heading. */
const HOVER_PAD = 26
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '])

/**
 * Outline ↔ document: which section is in view, jump to a section, and mark the hovered one.
 * `preview` is the scroll container of the rendered preview when one is on screen; otherwise
 * (editor only, small screens) the textarea is used. Lines are 0-based source lines.
 */
export function useOutlineNav(
  preview: RefObject<HTMLElement | null>,
  editor: RefObject<HTMLTextAreaElement | null>,
  headingLines: number[],
  enabled: boolean,
  /** Changes whenever the visible scroller changes (view mode, document). */
  viewKey: string,
) {
  const [activeLine, setActiveLine] = useState<number | null>(null)
  const linesRef = useRef(headingLines)
  linesRef.current = headingLines
  const linesKey = headingLines.join(',')
  // After a click, the clicked section stays highlighted until the reader scrolls on their own — not while the
  // smooth scroll passes other sections (however long it takes), and not when a short document can't bring the
  // clicked heading to the top (the "scrolled to the end" rule would pick the last section).
  const pinned = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const el: HTMLElement | null = preview.current ?? editor.current
    if (!el) return
    let frame = 0
    const update = () => {
      if (pinned.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (pinned.current) return // a click landed between the scroll event and this frame
        const lines = linesRef.current
        if (!lines.length) return setActiveLine(null)
        let current = 0 // 0-based source line at the probe
        if (el === preview.current) {
          const probe = el.scrollTop + PROBE_PX
          for (const a of previewAnchors(el)) if (a.y <= probe) current = a.line - 1
        } else {
          const tops = editorLineTops(el as HTMLTextAreaElement)
          const probe = el.scrollTop + PROBE_PX
          for (let i = 0; i < tops.length && tops[i] <= probe; i++) current = i
        }
        // Scrolled to the end: the last section is the one in view, even if its heading can't reach the top.
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && el.scrollTop > 0) current = Number.MAX_SAFE_INTEGER
        let active: number | null = null
        for (const l of lines) if (l <= current) active = l
        setActiveLine(active ?? lines[0])
      })
    }
    // The reader taking over (wheel, touch, keys, dragging the scrollbar) releases a clicked section.
    const release = () => {
      if (!pinned.current) return
      pinned.current = false
      update()
    }
    const INTENT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    // Scrolling keys work with the focus anywhere on the page, so listen for those on the window.
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) release()
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    // In split view the editor drives the preview through scroll sync, so its input counts too.
    const sources = [el, editor.current].filter((x, i, a): x is HTMLElement => !!x && a.indexOf(x) === i)
    for (const src of sources) for (const ev of INTENT) src.addEventListener(ev, release, { passive: true })
    window.addEventListener('resize', update)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', update)
      for (const src of sources) for (const ev of INTENT) src.removeEventListener(ev, release)
      window.removeEventListener('resize', update)
      window.removeEventListener('keydown', onKey)
    }
  }, [enabled, preview, editor, viewKey, linesKey])

  const goTo = useCallback(
    (line: number) => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setActiveLine(line)
      pinned.current = true
      const box = preview.current
      if (box) {
        const target = elementForLine(box, line)
        if (!target) return
        const top = target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12
        box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
        return
      }
      const ta = editor.current
      if (!ta) return
      const tops = editorLineTops(ta)
      ta.scrollTo({ top: Math.max(0, (tops[line] ?? 0) - 8), behavior: smooth ? 'smooth' : 'auto' })
      let pos = 0
      for (let n = 0; n < line; n++) {
        const next = ta.value.indexOf('\n', pos)
        if (next < 0) break
        pos = next + 1
      }
      ta.focus({ preventScroll: true })
      ta.setSelectionRange(pos, pos)
    },
    [preview, editor],
  )

  // Hovering a section in the Outline tints the whole section in the preview: one box from its heading down to
  // the next heading in the Outline (or the end of the document), drawn behind the text.
  const hoverBox = useRef<HTMLDivElement | null>(null)
  const hover = useCallback(
    (line: number | null) => {
      const box = preview.current
      const heading = line === null || !box ? null : elementForLine(box, line)
      const body = heading?.closest<HTMLElement>('.markdown-body')
      if (!box || !heading || !body || !/^H[1-6]$/.test(heading.tagName)) {
        hoverBox.current?.classList.remove('is-shown')
        return
      }
      const lines = linesRef.current
      const next = lines.find((l) => l > (line as number))
      const nextEl = next === undefined ? null : box.querySelector<HTMLElement>(`[data-line="${next + 1}"]`)
      const origin = body.getBoundingClientRect()
      const h = heading.getBoundingClientRect()
      const top = h.top - origin.top
      // The section's text ends where the next heading's top margin starts, or where the content ends.
      const last = body.lastElementChild === hoverBox.current ? hoverBox.current?.previousElementSibling : body.lastElementChild
      const bottom =
        nextEl && body.contains(nextEl)
          ? nextEl.getBoundingClientRect().top - origin.top - parseFloat(getComputedStyle(nextEl).marginTop) / 2
          : (last?.getBoundingClientRect().bottom ?? origin.bottom) - origin.top + 6
      let el = hoverBox.current
      if (!el || el.parentElement !== body) {
        el?.remove()
        el = document.createElement('div')
        el.className = 'outline-hit-box'
        el.setAttribute('aria-hidden', 'true')
        body.appendChild(el)
        hoverBox.current = el
        void el.offsetWidth // start from here, not from 0, when it first appears
      }
      el.style.top = `${top - 6}px`
      el.style.height = `${Math.max(0, bottom - top + 6)}px`
      // Wide enough to hold the readability dot left of an ## heading (16 px out), never past the content's padding.
      const pad = Math.min(HOVER_PAD, h.left - origin.left)
      el.style.left = `${h.left - origin.left - pad}px`
      el.style.width = `${h.width + 2 * pad}px`
      el.classList.add('is-shown')
    },
    [preview],
  )
  useEffect(
    () => () => {
      hoverBox.current?.remove()
      hoverBox.current = null
    },
    [viewKey],
  )

  return { activeLine, goTo, hover }
}

/** The preview block for a source line: the exact block, or the closest one above it. */
export function elementForLine(box: HTMLElement, line: number): HTMLElement | null {
  const exact = box.querySelector<HTMLElement>(`[data-line="${line + 1}"]`)
  if (exact) return exact
  let best: HTMLElement | null = null
  let bestLine = -1
  box.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
    const l = Number(el.dataset.line)
    if (l <= line + 1 && l > bestLine) {
      best = el
      bestLine = l
    }
  })
  return best
}
