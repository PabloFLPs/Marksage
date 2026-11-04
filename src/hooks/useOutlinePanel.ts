import { useCallback, useState, useRef } from 'react'
import type { PanelTab } from '../components/OutlinePanel'
import { loadOutlineOpen, saveOutlineOpen } from '../lib/storage'
import { EXIT_MS } from './useInfoPages'

/**
 * The Outline panel: docked on desktop (open or closed is remembered), a bottom sheet on small screens (never
 * opens by itself); its tab (this session only); and the document bar's tab icons, which open the panel on a tab
 * or close it when that tab is the one showing. `available`: a document is on screen (not About, not the start).
 */
export function useOutlinePanel({ isDesktop, available }: { isDesktop: boolean; available: boolean }) {
  const [outlineOpen, setOutlineOpen] = useState(() => isDesktop && loadOutlineOpen())
  const [panelTab, setPanelTab] = useState<PanelTab>('outline')
  const [outlineClosing, setOutlineClosing] = useState(false)
  const outlineTimer = useRef<number | null>(null)
  const closeOutline = useCallback(() => {
    if (outlineTimer.current) return
    setOutlineClosing(true)
    outlineTimer.current = window.setTimeout(() => {
      outlineTimer.current = null
      setOutlineClosing(false)
      setOutlineOpen(false)
    }, EXIT_MS)
    if (isDesktop) saveOutlineOpen(false)
  }, [isDesktop])
  const toggleOutline = useCallback(() => {
    if (outlineOpen && !outlineClosing) return closeOutline()
    if (outlineTimer.current) window.clearTimeout(outlineTimer.current)
    outlineTimer.current = null
    setOutlineClosing(false)
    setOutlineOpen(true)
    if (isDesktop) saveOutlineOpen(true)
  }, [outlineOpen, outlineClosing, closeOutline, isDesktop])

  const outlineShown = outlineOpen && available
  const openPanelTab: PanelTab | null = outlineShown && !outlineClosing ? panelTab : null
  const toggleTab = useCallback(
    (tab: PanelTab) => {
      if (openPanelTab === tab) return closeOutline()
      setPanelTab(tab)
      if (!openPanelTab) toggleOutline()
    },
    [openPanelTab, closeOutline, toggleOutline],
  )

  return { outlineOpen, outlineShown, outlineClosing, closeOutline, toggleOutline, panelTab, setPanelTab, openPanelTab, toggleTab }
}
