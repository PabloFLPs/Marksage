/**
 * Author info strings → the app's LANGUAGES keys. Shared by the collector and the eval builders so
 * every set is labelled the same way. Tags not listed here are out of vocabulary and dropped.
 */
import { LANGUAGES, type Language } from '../src/assist/questions.ts'

const ALIASES: Record<Language, string[]> = {
  ts: ['ts', 'typescript', 'tsx', 'mts', 'cts'],
  js: ['js', 'javascript', 'jsx', 'mjs', 'cjs', 'node', 'es6'],
  python: ['py', 'python', 'python3', 'py3'],
  bash: ['sh', 'bash', 'shell', 'console', 'zsh', 'shell-session', 'shellsession', 'terminal', 'sh-session'],
  json: ['json', 'jsonc', 'json5'],
  html: ['html', 'htm', 'xhtml'],
  css: ['css'],
  sql: ['sql', 'postgresql', 'postgres', 'psql', 'pgsql', 'mysql', 'sqlite', 'plsql', 'tsql'],
  go: ['go', 'golang'],
  rust: ['rust', 'rs'],
  java: ['java'],
  c: ['c', 'h'],
  cpp: ['cpp', 'c++', 'cc', 'hpp', 'cxx', 'hxx'],
  csharp: ['csharp', 'cs', 'c#'],
  ruby: ['ruby', 'rb'],
  php: ['php'],
  yaml: ['yaml', 'yml'],
  markdown: ['markdown', 'md', 'gfm'],
  diff: ['diff', 'patch', 'udiff'],
  dockerfile: ['dockerfile', 'docker', 'containerfile'],
  plaintext: ['text', 'txt', 'plaintext', 'plain', 'output', 'none', 'nohighlight'],
}

const TAG_TO_LABEL = new Map<string, Language>()
for (const [label, tags] of Object.entries(ALIASES) as [Language, string[]][]) for (const t of tags) TAG_TO_LABEL.set(t, label)

/** First word of a fence info string, lowercased: "rust,ignore" → "rust", "js title=a.js" → "js", "{.python}" → "python". */
export function infoTag(info: string): string {
  return (info.trim().toLowerCase().replace(/^\{\.?/, '').split(/[\s,{}:]/)[0] ?? '').replace(/^\./, '')
}

export function labelForTag(tag: string): Language | null {
  return TAG_TO_LABEL.get(tag) ?? null
}

export const LABELS = Object.keys(LANGUAGES) as Language[]
