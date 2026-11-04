import { describe, expect, it } from 'vitest'
import { shortcut } from '../../src/lib/keyStyle'

describe('shortcut labels', () => {
  it('reads as macOS symbols or Windows names', () => {
    expect(shortcut(['mod', 'shift', 'c'], 'mac')).toBe('⌘⇧C')
    expect(shortcut(['mod', 'shift', 'c'], 'windows')).toBe('Ctrl + Shift + C')
    expect(shortcut(['mod', 'k'], 'windows')).toBe('Ctrl + K')
  })
})
