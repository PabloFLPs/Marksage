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

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('split.resize')}
        title={t('split.resizeTitle')}
        onPointerDown={startDrag}
        onDoubleClick={() => onRatioChange(50)}
        className="group relative w-px shrink-0 cursor-col-resize touch-none select-none bg-line transition-colors hover:bg-accent dark:bg-dark-line dark:hover:bg-dark-accent"
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
