/** How keyboard shortcuts are displayed: macOS symbols or Windows/Linux names. */

export type KeyStyle = 'mac' | 'windows'
export type KeyToken = 'mod' | 'shift' | 'alt' | 'tab' | 'esc' | 'enter' | (string & {})

const KEY = 'marksage:key-style'

export function detectKeyStyle(): KeyStyle {
  return typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? 'mac' : 'windows'
}

export function loadKeyStyle(): KeyStyle {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'mac' || v === 'windows' ? v : detectKeyStyle()
  } catch {
    return detectKeyStyle()
  }
}

export function saveKeyStyle(style: KeyStyle): void {
  try {
    localStorage.setItem(KEY, style)
  } catch {
    // Ignore.
  }
}

const LABELS: Record<KeyStyle, Record<string, string>> = {
  mac: { mod: '⌘', shift: '⇧', alt: '⌥', tab: '⇥ Tab', esc: 'esc', enter: '↩' },
  windows: { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', tab: 'Tab', esc: 'Esc', enter: 'Enter' },
}

export function keyLabel(token: KeyToken, style: KeyStyle): string {
  return LABELS[style][token] ?? token.toUpperCase()
}

/** A shortcut for tooltips and hints, in the chosen key style: "⌘⇧C" or "Ctrl + Shift + C" (launch QA #26). */
export function shortcut(tokens: KeyToken[], style: KeyStyle): string {
  const keys = tokens.map((t) => keyLabel(t, style))
  return style === 'mac' ? keys.join('') : keys.join(' + ')
}
