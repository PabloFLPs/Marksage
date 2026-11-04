import { describe, expect, it } from 'vitest'
import { CHUNK_MIN_CHARS, splitMarkdown } from '../../src/lib/chunks'

const section = (n: number) => `# Section ${n}\n\n${'Some text. '.repeat(250)}\n`
const big = (n = 12) => Array.from({ length: n }, (_, i) => section(i)).join('\n')

describe('long-document pieces', () => {
  it('leaves short documents whole', () => {
    expect(splitMarkdown('# a\n\ntext')).toBeNull()
    expect(big().length).toBeGreaterThan(CHUNK_MIN_CHARS)
  })

  it('splits at column-0 headings, keeping every line, with the right start lines', () => {
    const md = big()
    const pieces = splitMarkdown(md)!
    expect(pieces).toHaveLength(12)
    expect(pieces.map((p) => p.text).join('')).toContain('# Section 11')
    for (const p of pieces) expect(md.split('\n')[p.line]).toMatch(/^# Section \d+/)
  })

  it("doesn't split inside a fence", () => {
    const md = big(4) + '```\n# not a heading\n```\n' + big(4)
    const starts = splitMarkdown(md)!.map((p) => md.split('\n')[p.line])
    expect(starts).not.toContain('# not a heading')
  })

  it('copies reference definitions to every piece, and leaves documents with footnotes whole', () => {
    const md = big(8) + '\n[home]: https://example.com\n'
    for (const p of splitMarkdown(md)!) expect(p.text).toContain('[home]: https://example.com')
    expect(splitMarkdown(big(8) + '\n[^1]: a footnote\n')).toBeNull()
  })
})
