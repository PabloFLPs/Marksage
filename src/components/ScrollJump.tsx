import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react'
import { useI18n } from '../hooks/useI18n'

/** Shown only on documents at least this many screens tall — a shorter one is a flick away. */
const MIN_SCREENS = 1.8

/**
 * "Back to the start" / "jump to the end" for the scroll area this sits in. Place it as the last child of the
 * scrolling element (or of its content): it sticks to the bottom-right corner of the visible area and finds the
 * scroller by itself. Each button hides at its own end.
 */
export function ScrollJump() {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLElement | null>(null)
  const [state, setState] = useState({ top: false, end: false })

  useEffect(() => {
    const el = scrollParent(ref.current)
    scroller.current = el
    if (!el) return
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const { scrollTop, scrollHeight, clientHeight } = el
        const long = scrollHeight > clientHeight * MIN_SCREENS
        const top = long && scrollTop > clientHeight * 0.5
        const end = long && scrollHeight - scrollTop - clientHeight > clientHeight * 0.5
        setState((s) => (s.top === top && s.end === end ? s : { top, end }))
      })
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    // The content grows and shrinks while typing in split view; the scroller itself resizes with the window.
    const ro = new ResizeObserver(check)
    ro.observe(el)
    for (const child of Array.from(el.children)) if (child !== ref.current) ro.observe(child)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [])

  const jump = (where: 'top' | 'end') => {
    const el = scroller.current
    if (!el) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: where === 'top' ? 0 : el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  const button = (where: 'top' | 'end', shown: boolean) => {
    const label = where === 'top' ? t('scroll.toStart') : t('scroll.toEnd')
    const Icon = where === 'top' ? ArrowUpToLine : ArrowDownToLine
    return (
      <button
        type="button"
        onClick={() => jump(where)}
        aria-label={label}
        title={label}
        tabIndex={shown ? 0 : -1}
        aria-hidden={!shown}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-sm transition-[opacity,transform,color,border-color] duration-200 hover:border-accent hover:text-accent pointer-coarse:h-10 pointer-coarse:w-10 dark:border-dark-line dark:bg-dark-surface-soft dark:text-dark-ink-muted dark:hover:border-dark-accent dark:hover:text-dark-accent ${
          shown ? 'pointer-events-auto opacity-100' : `pointer-events-none opacity-0 ${where === 'top' ? 'translate-y-1' : '-translate-y-1'}`
        }`}
      >
        <Icon className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div ref={ref} className="pointer-events-none sticky bottom-0 z-10 h-0 shrink-0">
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 print:hidden">
        {button('top', state.top)}
        {button('end', state.end)}
      </div>
    </div>
  )
}

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') return el
  }
  return null
}
