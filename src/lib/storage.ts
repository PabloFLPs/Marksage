export interface StoredDocument {
  id?: string
  filename: string | null
  content: string
  savedContent: string
}

const DOC_KEY = 'marksage:doc'
const SPLIT_KEY = 'marksage:split'

export function loadDocument(): StoredDocument | null {
  try {
    const raw = localStorage.getItem(DOC_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredDocument> | null
    if (typeof parsed?.content !== 'string') return null
    const isEmptyUntitled =
      parsed.content === '' && !parsed.filename && !parsed.savedContent
    if (isEmptyUntitled) return null
    return {
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      filename: typeof parsed.filename === 'string' ? parsed.filename : null,
      content: parsed.content,
      savedContent:
        typeof parsed.savedContent === 'string' ? parsed.savedContent : parsed.content,
    }
  } catch {
    return null
  }
}

/**
 * Set by "Delete all Marksage data" until the page reloads: the reload's own `pagehide` flush (useMarkdownFile)
 * and any pending debounced save would otherwise write the open document and Recent straight back.
 */
let wiped = false
export const isWiped = (): boolean => wiped

/**
 * Keep the open document. `savedContent` is left out when it equals `content` (`loadDocument` falls back to it), so
 * an opened, unchanged file takes half the room. Returns false when the browser refused it (full or too large) —
 * the caller tells the user, so work isn't lost silently.
 */
export function saveDocument(doc: StoredDocument): boolean {
  if (wiped) return true
  try {
    const { savedContent, ...rest } = doc
    localStorage.setItem(DOC_KEY, JSON.stringify(savedContent === doc.content ? rest : doc))
    return true
  } catch {
    return false
  }
}

export function clearStoredDocument(): void {
  try {
    localStorage.removeItem(DOC_KEY)
  } catch {
    // Ignore.
  }
}

export function loadSplitRatio(): number {
  try {
    const raw = localStorage.getItem(SPLIT_KEY)
    const value = raw ? Number.parseFloat(raw) : Number.NaN
    return value >= 20 && value <= 80 ? value : 50
  } catch {
    return 50
  }
}

export function saveSplitRatio(ratio: number): void {
  try {
    localStorage.setItem(SPLIT_KEY, String(ratio))
  } catch {
    // Ignore.
  }
}

export type StoredAssistMode = 'off' | 'heuristics' | 'model'
const ASSIST_KEY = 'marksage:assist'

export function loadAssistMode(): StoredAssistMode {
  try {
    const raw = localStorage.getItem(ASSIST_KEY)
    // Nothing stored yet → Rules: instant, local, nothing to download, suggest-only. A stored 'off' stays off.
    return raw === 'off' || raw === 'model' ? raw : 'heuristics'
  } catch {
    return 'heuristics'
  }
}

export function saveAssistMode(mode: StoredAssistMode): void {
  try {
    localStorage.setItem(ASSIST_KEY, mode)
  } catch {
    // Ignore.
  }
}

// The user has read the Rules + AI notice (download + browser storage) once.
const MODEL_NOTICE_KEY = 'marksage:model-notice'

export function loadModelNoticeSeen(): boolean {
  try {
    return localStorage.getItem(MODEL_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveModelNoticeSeen(seen: boolean): void {
  try {
    if (seen) localStorage.setItem(MODEL_NOTICE_KEY, '1')
    else localStorage.removeItem(MODEL_NOTICE_KEY)
  } catch {
    // Ignore.
  }
}

// Outline panel open next to the document (desktop).
const OUTLINE_KEY = 'marksage:outline'

export function loadOutlineOpen(): boolean {
  try {
    return localStorage.getItem(OUTLINE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveOutlineOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(OUTLINE_KEY, '1')
    else localStorage.removeItem(OUTLINE_KEY)
  } catch {
    // Ignore.
  }
}

/** Everything Marksage keeps in this browser: every `marksage:*` key, plus the downloaded model. */
export async function deleteAllLocalData(): Promise<void> {
  wiped = true
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('marksage:')) localStorage.removeItem(key)
  } catch {
    // Ignore.
  }
  try {
    for (const name of await caches.keys()) if (name.startsWith('marksage-')) await caches.delete(name)
  } catch {
    // Cache API unavailable — nothing was stored there.
  }
}

const REMOTE_IMAGES_KEY = 'marksage:remote-images'

/** "Load images from the web" — off unless the reader turned it on (lib/remoteImages.ts). */
export function loadRemoteImages(): boolean {
  try {
    return localStorage.getItem(REMOTE_IMAGES_KEY) === '1'
  } catch {
    return false
  }
}

export function saveRemoteImages(on: boolean): void {
  try {
    if (on) localStorage.setItem(REMOTE_IMAGES_KEY, '1')
    else localStorage.removeItem(REMOTE_IMAGES_KEY)
  } catch {
    // Ignore.
  }
}
