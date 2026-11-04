import { describe, expect, it } from 'vitest'
import { baseNameLength, isMarkdownFile, looksBinary, normalizeFilename, suggestFilename } from '../../src/lib/file'

describe('files', () => {
  it('opens Markdown only — .txt is refused on purpose', () => {
    for (const name of ['a.md', 'A.MARKDOWN', 'b.mdx', 'c.mdown', 'd.mkd', 'e.mkdn', 'f.mdwn']) expect(isMarkdownFile(name)).toBe(true)
    for (const name of ['notes.txt', 'image.png', 'md', 'readme']) expect(isMarkdownFile(name)).toBe(false)
  })

  it('spots a renamed binary by a NUL anywhere, even after the first 8 KB', () => {
    expect(looksBinary('# fine\n')).toBe(false)
    expect(looksBinary('x'.repeat(20_000) + '\u0000')).toBe(true)
  })

  it('makes a typed name safe', () => {
    expect(normalizeFilename('  My: notes?  ')).toBe('My- notes-.md')
    expect(normalizeFilename('...hidden')).toBe('hidden.md')
    expect(normalizeFilename('draft.markdown')).toBe('draft.markdown')
    expect(normalizeFilename('   ')).toBeNull()
    expect(normalizeFilename('x'.repeat(200))!.length).toBe(120)
  })

  it('suggests a name from the first heading, accents folded', () => {
    expect(suggestFilename('# Meeting Notes\n\ntext')).toBe('meeting-notes.md')
    expect(suggestFilename('## Relatório **anual**')).toBe('relatorio-anual.md')
    expect(suggestFilename('no heading')).toBe('document.md')
  })

  it('selects the name without its extension', () => {
    expect(baseNameLength('meeting-notes.md')).toBe('meeting-notes'.length)
    expect(baseNameLength('.env')).toBe(4)
  })
})
