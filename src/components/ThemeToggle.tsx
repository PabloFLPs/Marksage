import { useEffect, useRef } from 'react'
import { Moon, Sun } from 'lucide-react'
import type { Theme } from '../hooks/useTheme'
import { useI18n } from '../hooks/useI18n'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLButtonElement>(null)
  // During the theme cross-fade the browser hit-tests the page root instead of this button, so a quick second
  // click (a double-click) would be lost: count clicks on the root that land where the button is.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.target !== document.documentElement) return
      const r = ref.current?.getBoundingClientRect()
      if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) onToggle()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [onToggle])
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
      title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink-muted transition-colors hover:border-accent hover:text-accent dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted dark:hover:border-dark-accent dark:hover:text-dark-accent"
    >
      <span key={theme} className="anim-spin-in inline-flex">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
    </button>
  )
}