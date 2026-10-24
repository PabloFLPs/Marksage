import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { editorLineTops, previewAnchors } from '../lib/scrollSync'

/** How far below the top edge a section counts as "the one being read". */
const PROBE_PX = 48

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
  // After a click, the clicked section stays highlighted while the smooth scroll passes the others.
  const pinnedUntil = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const el: HTMLElement | null = preview.current ?? editor.current
    if (!el) return
    let frame = 0
    const update = () => {
      if (performance.now() < pinnedUntil.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
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
    const settle = () => {
      pinnedUntil.current = 0
      update()
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    el.addEventListener('scrollend', settle)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', update)
      el.removeEventListener('scrollend', settle)
      window.removeEventListener('resize', update)
    }
  }, [enabled, preview, editor, viewKey, linesKey])

  const goTo = useCallback(
    (line: number) => {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      setActiveLine(line)
      pinnedUntil.current = performance.now() + (smooth ? 1200 : 0) // `scrollend` releases it sooner
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

  const hovered = useRef<HTMLElement | null>(null)
  const hover = useCallback(
    (line: number | null) => {
      hovered.current?.removeAttribute('data-outline-hit')
      hovered.current = null
      const box = preview.current
      if (line === null || !box) return
      const target = elementForLine(box, line)
      if (target && /^H[1-6]$/.test(target.tagName)) {
        target.setAttribute('data-outline-hit', '')
        hovered.current = target
      }
    },
    [preview],
  )
  useEffect(() => () => hovered.current?.removeAttribute('data-outline-hit'), [viewKey])

  return { activeLine, goTo, hover }
}

/** The preview block for a source line: the exact block, or the closest one above it. */
function elementForLine(box: HTMLElement, line: number): HTMLElement | null {
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
