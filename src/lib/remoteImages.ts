/**
 * Images from other websites. A remote image is fetched the moment the preview shows it — that request tells the
 * site the reader's IP address and browser, so a downloaded `.md` could carry a tracking pixel. Marksage doesn't
 * load them unless the reader turns "Load images from the web" on (About → Privacy & storage).
 */
import { splitLines } from '../assist/prefilter.ts'

/** `https://…`, `http://…` or `//host/…` pointing at another site. Relative paths and `data:` URLs stay local. */
export function remoteHost(src: string | undefined): string | null {
  if (!src || !/^(https?:)?\/\//i.test(src.trim())) return null
  try {
    const url = new URL(src.trim(), window.location.href)
    return url.host === window.location.host ? null : url.host
  } catch {
    return null
  }
}

const INLINE = /!\[[^\]]*\]\(\s*<?\s*((?:https?:)?\/\/[^\s)>]+)/gi
const REF_USE = /!\[([^\]]*)\](?:\[([^\]]*)\])?/g
const REF_DEF = /^\s{0,3}\[([^\]]+)\]:\s*<?\s*((?:https?:)?\/\/\S+?)>?(?:\s|$)/

/** How many remote images the document shows (outside code) — for the "not loaded" bar. */
export function countRemoteImages(text: string): number {
  if (!/!\[/.test(text)) return 0
  const lines = splitLines(text).filter((l) => !l.inCode)
  const defs = new Map<string, string>()
  for (const l of lines) {
    const m = REF_DEF.exec(l.text)
    if (m) defs.set(m[1].trim().toLowerCase(), m[2])
  }
  let n = 0
  for (const l of lines) {
    for (const m of l.text.matchAll(INLINE)) if (remoteHost(m[1])) n++
    if (!defs.size) continue
    for (const m of l.text.matchAll(REF_USE)) {
      if (l.text[m.index + m[0].length] === '(') continue // inline, counted above
      const label = (m[2] || m[1]).trim().toLowerCase()
      const url = defs.get(label)
      if (url && remoteHost(url)) n++
    }
  }
  return n
}
