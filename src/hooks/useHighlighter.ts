import { useEffect, useState } from 'react'

type Highlighter = typeof import('../lib/highlight')

let loaded: Highlighter | null = null
let loading: Promise<Highlighter> | null = null

/** The highlighter module once loaded (null until then). `enabled` starts the one-time load. */
export function useHighlighter(enabled = true): Highlighter | null {
  const [mod, setMod] = useState(loaded)
  useEffect(() => {
    if (mod || !enabled) return
    let alive = true
    loading ??= import('../lib/highlight').then((m) => (loaded = m))
    loading.then(
      (m) => alive && setMod(m),
      () => {
        loading = null // offline or a failed chunk: plain code, retry next time
      },
    )
    return () => {
      alive = false
    }
  }, [mod, enabled])
  return mod
}
