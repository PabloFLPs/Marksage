import { describe, expect, it } from 'vitest'
import { countLines, countWords, formatBytes, utf8Bytes } from '../../src/lib/docStats'

describe('docStats (the footer)', () => {
  it('counts words and lines', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  one two\n\nthree  ')).toBe(3)
    expect(countLines('')).toBe(1)
    expect(countLines('a\nb\n')).toBe(3)
  })

  it('counts UTF-8 bytes like TextEncoder', () => {
    for (const s of ['plain', 'café', 'ação — “quotes”', 'emoji 🏁 and 𝔸', '日本語'])
      expect(utf8Bytes(s)).toBe(new TextEncoder().encode(s).length)
  })

  it('writes sizes in decimal units, in the language', () => {
    expect(formatBytes(999, 'en')).toBe('999 B')
    expect(formatBytes(1500, 'en')).toBe('1.5 KB')
    expect(formatBytes(1500, 'pt-BR')).toBe('1,5 KB')
    expect(formatBytes(123_456, 'en')).toBe('123 KB')
    expect(formatBytes(3_400_000, 'en')).toBe('3.4 MB')
  })
})
