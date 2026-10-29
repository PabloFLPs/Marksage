import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'marksage:theme'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage unavailable — follow the system.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Saved only when the user picks a theme; until then the system setting is followed (nothing stored). */
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
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