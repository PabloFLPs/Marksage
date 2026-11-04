/** The footer's counts: lines, words and the UTF-8 size, and how a size is written. */

export function countWords(content: string): number {
  const match = content.trim().match(/\S+/g)
  return match ? match.length : 0
}

export function countLines(content: string): number {
  let n = 1
  for (let i = content.indexOf('\n'); i !== -1; i = content.indexOf('\n', i + 1)) n++
  return n
}

/** UTF-8 size of the text — what Export saves — counted without encoding a copy. */
export function utf8Bytes(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4 // surrogate pair: one 4-byte character
      i++
    } else n += 3
  }
  return n
}

/** 999 B, 1.5 KB, 12 KB, 3.4 MB — decimal units, in the app's language. */
export function formatBytes(bytes: number, lang: string): string {
  if (bytes < 1000) return `${bytes.toLocaleString(lang)} B`
  const [v, unit] = bytes < 1_000_000 ? [bytes / 1000, 'KB'] : [bytes / 1_000_000, 'MB']
  return `${v.toLocaleString(lang, { maximumFractionDigits: v < 100 ? 1 : 0 })} ${unit}`
}
