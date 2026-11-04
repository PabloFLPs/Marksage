import { useCallback, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'marksage:theme'

/** A first visit is light (Pablo's call, 2026-10-31); dark only once the user picks it. index.html applies the
 *  same rule before first paint, so the page never flashes the other theme. */
function getInitialTheme(): Theme {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'dark') return 'dark'
  } catch {
    // Storage unavailable — light.
  }
  return 'light'
}

/** Saved only when the user picks a theme; until then, light (nothing stored). */
function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore.
  }
}

let transitioning = false

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Before paint, so a change never shows a frame of the old theme.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    // The browser bar on phones matches the page (surface colours in index.css).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d1117' : '#ffffff')
  }, [theme])

  const toggleTheme = useCallback(() => {
    const flip = () =>
      setTheme((prev) => {
        const next = prev === 'dark' ? 'light' : 'dark'
        saveTheme(next)
        return next
      })
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // View Transitions: one GPU cross-fade of two snapshots — cheap even for huge documents.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } }
    // A click while one is still running flips at once (no second transition), so a quick double-click
    // toggles twice instead of losing a click.
    if (doc.startViewTransition && !reduced && !transitioning) {
      transitioning = true
      const vt = doc.startViewTransition(() => flushSync(flip))
      vt.finished.finally(() => (transitioning = false))
      return
    }
    const root = document.documentElement
    root.classList.add('theme-transition')
    window.setTimeout(() => root.classList.remove('theme-transition'), 250)
    flip()
  }, [])

  return { theme, toggleTheme }
}