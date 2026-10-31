import { useEffect } from 'react'
import type { RefObject } from 'react'
import { mapScroll } from '../lib/scrollSync'

/**
 * Keeps the preview pane and the editor textarea scrolled to the same place.
 * Whichever side the user is scrolling drives the other; programmatic scrolls
 * are ignored so the two never fight.
 */
export function useScrollSync(
  previewRef: RefObject<HTMLElement | null>,
  editorRef: RefObject<HTMLTextAreaElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const preview = previewRef.current
    const editor = editorRef.current
    if (!preview || !editor) return

    // The side the user last interacted with is the driver.
    let driver: 'preview' | 'editor' | null = null
    const expected = new Map<HTMLElement, number>()
    let frame = 0

    const sync = (from: 'preview' | 'editor') => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const target = from === 'preview' ? editor : preview
        const y = Math.round(mapScroll(from, preview, editor))
        if (Math.abs(target.scrollTop - y) < 1) return
        expected.set(target, y)
        target.scrollTop = y
      })
    }

    const onScroll = (side: 'preview' | 'editor') => (e: Event) => {
      const el = e.currentTarget as HTMLElement
      const exp = expected.get(el)
      // Echo of our own programmatic scroll → ignore.
      if (exp !== undefined && Math.abs(el.scrollTop - exp) <= 2 && driver !== side) {
        expected.delete(el)
        return
      }
      expected.delete(el)
      driver = side
      sync(side)
    }

    const claim = (side: 'preview' | 'editor') => () => {
      driver = side
    }

    // The preview renders a moment after the editor changes (deferred), so a paste or typing at the end moves the
    // editor while the preview still has its old height — and the sync that ran then is never redone. Follow again
    // whenever the preview's content changes size, while the editor is the side being driven.
    const resized = new ResizeObserver(() => {
      if (driver === 'editor') sync('editor')
    })
    const watch = () => {
      resized.disconnect()
      for (const el of preview.children) resized.observe(el)
    }
    watch()
    const replaced = new MutationObserver(watch)
    replaced.observe(preview, { childList: true })

    const onPreview = onScroll('preview')
    const onEditor = onScroll('editor')
    const claimPreview = claim('preview')
    const claimEditor = claim('editor')
    preview.addEventListener('scroll', onPreview, { passive: true })
    editor.addEventListener('scroll', onEditor, { passive: true })
    for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) {
      preview.addEventListener(ev, claimPreview, { passive: true })
      editor.addEventListener(ev, claimEditor, { passive: true })
    }
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      replaced.disconnect()
      preview.removeEventListener('scroll', onPreview)
      editor.removeEventListener('scroll', onEditor)
      for (const ev of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) {
        preview.removeEventListener(ev, claimPreview)
        editor.removeEventListener(ev, claimEditor)
      }
    }
  }, [previewRef, editorRef, enabled])
}
