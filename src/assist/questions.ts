/** Stable question ids — every engine routes on these. */
export const Q = {
  fenceLanguage: 'fence.language',
  pasteKind: 'paste.kind',
  readability: 'section.readability',
} as const

export const LANGUAGES = {
  ts: 'TypeScript',
  js: 'JavaScript',
  python: 'Python',
  bash: 'Shell / Bash',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  ruby: 'Ruby',
  php: 'PHP',
  yaml: 'YAML',
  markdown: 'Markdown',
  diff: 'Diff / patch',
  dockerfile: 'Dockerfile',
  plaintext: 'Plain text / not code',
} as const
export type Language = keyof typeof LANGUAGES

export const PASTE_KINDS = {
  prose: 'Prose / regular text',
  table: 'Whitespace-aligned table',
  csv: 'Comma-separated values',
  tsv: 'Tab-separated values (e.g. from a spreadsheet)',
  list: 'A list of items',
  code: 'Source code',
  json: 'JSON data',
} as const
export type PasteKind = keyof typeof PASTE_KINDS

export const READABILITY_SCALE = ['very easy', 'easy', 'moderate', 'hard', 'very hard']
