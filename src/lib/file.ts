// Markdown only (plain .txt is refused on purpose). .mdx is Markdown + JSX: it opens as Markdown, the JSX shows as text.
export const ACCEPTED_EXTENSIONS = ['.md', '.markdown', '.mdx', '.mdown', '.mkd', '.mkdn', '.mdwn']

/** A NUL character never appears in a text file — it's a binary file renamed (an image, a PDF…). */
export function looksBinary(text: string): boolean {
  return text.slice(0, 8000).includes('\u0000')
}

export function isMarkdownFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`))
    reader.readAsText(file)
  })
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function openFilePicker(onFile: (file: File) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = ACCEPTED_EXTENSIONS.join(',')
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) onFile(file)
  }
  input.click()
}

/**
 * A name the user typed → a safe Markdown file name: characters file systems refuse become "-", no leading dots,
 * at most 120 characters, and `.md` added unless it already ends in a Markdown extension. null when empty.
 */
export function normalizeFilename(input: string): string | null {
  // eslint-disable-next-line no-control-regex
  let name = input.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/^\.+/, '').trim()
  if (!name) return null
  if (!isMarkdownFile(name)) name = name.replace(/\.+$/, '') + '.md'
  if (name.length > 120) {
    const ext = name.slice(name.lastIndexOf('.'))
    name = name.slice(0, 120 - ext.length).trimEnd() + ext
  }
  return name
}

/** A starting name for an untitled document: its first heading as kebab-case, else document.md. */
export function suggestFilename(content: string): string {
  const heading = content.match(/^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m)?.[1] ?? ''
  const slug = heading
    .replace(/[*_`~[\]()]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug ? `${slug}.md` : 'document.md'
}

/** The part of a file name before its extension (what a rename field selects). */
export function baseNameLength(name: string): number {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? dot : name.length
}

export function fallbackFilename(filename: string | null): string {
  return filename && filename.trim() !== '' ? filename : 'document.md'
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}