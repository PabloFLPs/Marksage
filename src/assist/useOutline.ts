import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import type { LangModel } from './model/model.ts'
import { SECTIONS_MODEL_URL, sharedLoad } from './modelEngine.ts'
import { buildOutline } from './outline.ts'

export type OutlineModelStatus = 'off' | 'loading' | 'ready' | 'failed'

/**
 * Outline of `text`, recomputed as the document changes (deferred, so typing stays smooth).
 * `useModel` (Rules + AI mode) loads the section model the first time the panel is open (`panelOpen`) — the
 * document bar's type also reads the outline with the panel closed, but never triggers that download.
 */
export function useOutline(text: string, enabled: boolean, useModel: boolean, panelOpen = enabled) {
  const [model, setModel] = useState<LangModel | null>(null)
  const [failed, setFailed] = useState(false)
  const wantModel = enabled && panelOpen && useModel

  useEffect(() => {
    if (!wantModel || model) return
    let alive = true
    sharedLoad(SECTIONS_MODEL_URL).then(
      (m) => alive && setModel(m),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [wantModel, model])

  const deferred = useDeferredValue(text)
  const active = useModel ? model : null
  const items = useMemo(() => (enabled ? buildOutline(deferred, active) : []), [enabled, deferred, active])
  const status: OutlineModelStatus = !useModel ? 'off' : model ? 'ready' : failed ? 'failed' : 'loading'
  return { items, status, text: deferred }
}
