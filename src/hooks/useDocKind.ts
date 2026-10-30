import { useEffect, useRef, useState } from 'react'
import { computeDocStats, type DocStats } from '../assist/docStats'
import type { OutlineItem } from '../assist/outline'

/** What the document looks like doesn't change per keystroke: recomputed once typing pauses. */
const SETTLE_MS = 400
/** Past this the document bar shows the name only (the full stats pass grows with the text: ~25 ms at 150k chars). */
const MAX_CHARS = 400_000

/**
 * The document type for the document bar — the Document tab's answer (`computeDocStats`) from the same outline
 * items, worked out after typing settles. null: no clear pattern, or too long to work out.
 * `docKey` changes with the document: a newly opened one gets its answer at once.
 */
export function useDocKind(text: string, items: OutlineItem[], filename: string | null, docKey: string): DocStats['kind'] {
  const [kind, setKind] = useState<DocStats['kind']>(null)
  const shownFor = useRef<string | null>(null)
  useEffect(() => {
    if (text.length > MAX_CHARS) {
      shownFor.current = docKey
      setKind(null)
      return
    }
    const run = () => {
      shownFor.current = docKey
      setKind(computeDocStats(text, items, filename).kind)
    }
    if (shownFor.current !== docKey) return run()
    const id = window.setTimeout(run, SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [text, items, filename, docKey])
  return kind
}
