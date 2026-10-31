import { useEffect, useRef, type RefObject } from 'react'

/** The editor's textarea while it's on screen (editor or split view), else null. */
function visibleEditor(): HTMLTextAreaElement | null {
  const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-editor]')
  return ta && ta.getClientRects().length > 0 ? ta : null
}

/**
 * Where focus goes when a header menu or panel closes with focus inside it (Esc, a choice, a download) or lost:
 * to the editor when it's on screen — so you keep typing — else back to the button that opened it (the first
 * button in `rootRef`). On touch screens always the button: focusing the editor would pop up the keyboard. If focus
 * already moved on (a click on something else) or is on that button (Tab in a menu), it's left alone.
 */
export function useReturnFocus(open: boolean, rootRef: RefObject<HTMLElement | null>) {
  const wasOpen = useRef(open)
  useEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed) return
    // A frame later: a Tab or a click that closed it has moved focus by then, and that choice stands.
    const frame = window.requestAnimationFrame(() => {
      const root = rootRef.current
      const trigger = root?.querySelector<HTMLElement>('button')
      const active = document.activeElement
      if (active === trigger || (active && active !== document.body && !root?.contains(active))) return
      const touch = window.matchMedia('(pointer: coarse)').matches
      const target = (!touch && visibleEditor()) || trigger
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, rootRef])
}
