import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useI18n } from '../hooks/useI18n'

const MIN_RATIO = 20
const MAX_RATIO = 80

interface SplitPanesProps {
  ratio: number
  onRatioChange: (ratio: number) => void
  left: ReactNode
  right: ReactNode
  /** Play the exit animation (editor pane slides back out to the right). */
  closing?: boolean
  /** Disable the width animation (e.g. very large documents, where reflowing every frame is costly). */
  animateWidth?: boolean
  /** Scroll container of the left (preview) pane — used for scroll sync. */
  leftRef?: RefObject<HTMLDivElement | null>
}

function clamp(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value))
}

export function SplitPanes({ ratio, onRatioChange, left, right, closing = false, animateWidth = true, leftRef }: SplitPanesProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  // Start with the preview at full width, then animate to `ratio` on the next frame.
  const [entered, setEntered] = useState(false)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const width = entered && !closing ? ratio : 100

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startRatio = ratio

    const onMove = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const delta = ((ev.clientX - startX) / rect.width) * 100
      onRatioChange(clamp(startRatio + delta))
    }

    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        ref={leftRef}
        data-split-pane=""
        style={{
          width: `${width}%`,
          transition: dragging || !animateWidth ? 'none' : 'width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="scroll-area min-w-0 overflow-y-auto overscroll-contain"
      >
        {left}
      </div>

      {/* Keyboard too: ← → resize by 5% (Shift: 10%), Home / End to the limits, Enter back to half. Above the editor
          pane (z-10), so its grab area is 8 px on both sides of the line, not only the left. */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={t('split.resize')}
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={MIN_RATIO}
        aria-valuemax={MAX_RATIO}
        title={t('split.resizeTitle')}
        onPointerDown={startDrag}
        onDoubleClick={() => onRatioChange(50)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 5
          const next = e.key === 'ArrowLeft' ? ratio - step : e.key === 'ArrowRight' ? ratio + step : e.key === 'Home' ? MIN_RATIO : e.key === 'End' ? MAX_RATIO : e.key === 'Enter' ? 50 : null
          if (next === null) return
          e.preventDefault()
          onRatioChange(clamp(next))
        }}
        className="group relative z-10 w-px shrink-0 cursor-col-resize touch-none select-none bg-line outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-accent/40 dark:bg-dark-line dark:hover:bg-dark-accent dark:focus-visible:bg-dark-accent"
      >
        <span className="absolute inset-y-0 -left-2 -right-2" />
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 overflow-hidden ${closing ? 'anim-slide-out-right' : 'anim-slide-in-right'}`}
      >
        {right}
      </div>
    </div>
  )
}
