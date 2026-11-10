/**
 * Tiny i18n: flat dictionaries + `{var}` interpolation. English is the source;
 * a missing key falls back to English, then to the key itself (so raw error
 * messages pass through untouched).
 */
import { en } from './locales/en'
import { pt } from './locales/pt-BR'

export type Lang = 'en' | 'pt-BR'
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'pt-BR', label: 'Português (BR)', short: 'PT' },
]

export type MessageKey = keyof typeof en
export type Vars = Record<string, string | number>

/** `key.one` when there's exactly one and that key exists ("1 char", not "1 chars"); `key` otherwise. */
export function countKey(key: MessageKey, n: number): MessageKey {
  const one = `${key}.one`
  return n === 1 && one in en ? (one as MessageKey) : key
}

const DICTS: Record<Lang, Partial<Record<MessageKey, string>>> = { en, 'pt-BR': pt }

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const raw = DICTS[lang][key as MessageKey] ?? en[key as MessageKey] ?? key
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw
}

const KEY = 'marksage:lang'

export function detectLang(): Lang {
  return typeof navigator !== 'undefined' && /^pt\b/i.test(navigator.language) ? 'pt-BR' : 'en'
}

export function loadLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'en' || v === 'pt-BR' ? v : detectLang()
  } catch {
    return detectLang()
  }
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // Ignore.
  }
}
