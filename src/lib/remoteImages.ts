/**
 * Images from other websites. A remote image is fetched the moment the preview shows it — that request tells the
 * site the reader's IP address and browser, so a downloaded `.md` could carry a tracking pixel. Marksage doesn't
 * load them unless the reader turns "Load images from the web" on (About → Privacy & storage).
 */
import { splitLines } from '../assist/prefilter.ts'

/**
 * The host of an image on another website, or null for one that stays local (a relative path, `data:`, `blob:`, this
 * site). Decided the way the browser will resolve the address, not by its prefix: `https:host/x` and
 * `https:/host/x` both fetch `https://host/x`, though neither starts with `//`. An address the browser can't parse
 * fetches nothing.
 */
export function remoteHost(src: string | undefined): string | null {
  if (!src) return null
  let url: URL
  try {
    url = new URL(src, window.location.href)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.host === window.location.host ? null : url.host
}

/**
 * The address as the preview renders it: Markdown's backslash escapes undone (`https\://` → `https://`), and a
 * backslash left over percent-encoded, as the Markdown parser does (`\\host` is a relative path, not another site).
 */
const asRendered = (s: string) => s.replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/\\/g, '%5C')

const INLINE = /!\[[^\]]*\]\(\s*<?\s*([^\s)>]+)/g
const REF_USE = /!\[([^\]]*)\](?:\[([^\]]*)\])?/g
const REF_DEF = /^\s{0,3}\[([^\]]+)\]:\s*<?\s*(\S+?)>?(?:\s|$)/

/** How many remote images the document shows (outside code) — for the "not loaded" bar. */
export function countRemoteImages(text: string): number {
  if (!/!\[/.test(text)) return 0
  const lines = splitLines(text).filter((l) => !l.inCode)
  const defs = new Map<string, string>()
  for (const l of lines) {
    const m = REF_DEF.exec(l.text)
    if (m) defs.set(m[1].trim().toLowerCase(), asRendered(m[2]))
  }
  let n = 0
  for (const l of lines) {
    for (const m of l.text.matchAll(INLINE)) if (remoteHost(asRendered(m[1]))) n++
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
