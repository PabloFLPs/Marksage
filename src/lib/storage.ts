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

export function saveDocument(doc: StoredDocument): void {
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(doc))
  } catch {
    // Storage unavailable or full — persistence is best-effort.
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
    return raw === 'heuristics' || raw === 'model' ? raw : 'off'
  } catch {
    return 'off'
  }
}

export function saveAssistMode(mode: StoredAssistMode): void {
  try {
    localStorage.setItem(ASSIST_KEY, mode)
  } catch {
    // Ignore.
  }
}

// The user has read the Local model notice (download + browser storage) once.
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

/** Everything Marksage keeps in this browser: every `marksage:*` key, plus the downloaded model. */
export async function deleteAllLocalData(): Promise<void> {
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
