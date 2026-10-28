/**
 * Document sections: splitting, section types from headings (EN + PT-BR), key sentences.
 * Shared by the Outline / Document panel and by training/build-sections.ts, so the categorizer
 * model is trained on exactly the sections the app sees. Pure TS, no platform APIs.
 */
import { splitLines } from './prefilter.ts'

export const SECTION_TYPES = [
  'overview',
  'setup',
  'guide',
  'reference',
  'config',
  'example',
  'troubleshooting',
  'changelog',
  'contributing',
  'legal',
  'security',
  'performance',
  'deployment',
  // Diátaxis' fourth kind (tutorial, how-to, reference, explanation): "How it works", "Architecture", "Concepts".
  'explanation',
  'glossary',
  'roadmap',
] as const
export type SectionType = (typeof SECTION_TYPES)[number]

/**
 * Types only the heading rule gives. Explanation: explanatory prose and ordinary topic prose share the same
 * words, and the model couldn't tell them apart. Glossary and roadmap: too few sections in the training
 * repositories to learn from (76 and 57 headings). See training/README.md.
 */
export const HEADING_ONLY_TYPES: readonly SectionType[] = ['explanation', 'glossary', 'roadmap']

/** The types the section model answers (plus "other"). */
export const MODEL_SECTION_TYPES = SECTION_TYPES.filter((t) => !HEADING_ONLY_TYPES.includes(t))

/** Heading phrases → type. Lower-case, accents kept (matching folds both sides). */
const PHRASES: Record<SectionType, string[]> = {
  overview: ['introduction', 'intro', 'overview', 'about', 'what is', 'why', 'motivation', 'features', 'key features', 'highlights', 'summary', 'introdução', 'visão geral', 'sobre', 'o que é', 'por que', 'por quê', 'motivação', 'recursos', 'funcionalidades', 'resumo'],
  setup: ['installation', 'install', 'installing', 'getting started', 'get started', 'quick start', 'quickstart', 'prerequisites', 'requirements', 'setup', 'set up', 'setting up', 'download', 'instalação', 'instalando', 'instalar', 'primeiros passos', 'começando', 'início rápido', 'requisitos', 'pré-requisitos'],
  guide: ['usage', 'how to', 'tutorial', 'guide', 'walkthrough', 'basic usage', 'using', 'uso', 'como usar', 'utilização', 'guia', 'passo a passo'],
  reference: ['api', 'reference', 'methods', 'functions', 'options', 'parameters', 'arguments', 'props', 'properties', 'commands', 'cli', 'flags', 'endpoints', 'syntax', 'return value', 'referência', 'métodos', 'funções', 'opções', 'parâmetros', 'argumentos', 'comandos', 'propriedades', 'sintaxe'],
  config: ['configuration', 'config', 'configuring', 'settings', 'environment variables', 'customization', 'customizing', 'configuração', 'configurações', 'configurando', 'variáveis de ambiente', 'personalização'],
  example: ['examples', 'example', 'demo', 'demos', 'samples', 'sample', 'recipes', 'cookbook', 'exemplos', 'exemplo', 'demonstração', 'receitas'],
  troubleshooting: ['troubleshooting', 'how to fix', 'faq', 'frequently asked questions', 'known issues', 'common issues', 'common problems', 'debugging', 'errors', 'caveats', 'gotchas', 'limitations', 'solução de problemas', 'perguntas frequentes', 'problemas conhecidos', 'problemas comuns', 'depuração', 'erros', 'limitações'],
  changelog: ['changelog', 'change log', 'unreleased', 'changes', 'release notes', "what's new", 'whats new', 'history', 'version history', 'migration', 'migrating', 'upgrading', 'upgrade guide', 'breaking changes', 'new features', 'notas de versão', 'novidades', 'histórico', 'migração', 'atualizando'],
  contributing: ['contributing', 'contribute', 'contribution', 'development', 'developing', 'building from source', 'running tests', 'testing', 'code of conduct', 'contribuindo', 'contribuir', 'contribuição', 'desenvolvimento', 'testes'],
  explanation: ['how it works', 'how does it work', 'how this works', 'architecture', 'design', 'design decisions', 'design principles', 'concepts', 'core concepts', 'key concepts', 'basic concepts', 'fundamentals', 'under the hood', 'internals', 'implementation details', 'theory', 'explanation', 'deep dive', 'principles', 'mental model', 'philosophy', 'rationale', 'background', 'como funciona', 'arquitetura', 'conceitos', 'conceitos básicos', 'principais conceitos', 'fundamentos', 'por dentro', 'princípios', 'filosofia', 'decisões de design', 'teoria', 'explicação', 'detalhes de implementação'],
  legal: ['license', 'licence', 'licensing', 'copyright', 'credits', 'acknowledgements', 'acknowledgments', 'authors', 'sponsors', 'licença', 'créditos', 'agradecimentos', 'autores', 'patrocinadores'],
  security: ['security', 'security policy', 'security considerations', 'security notes', 'security model', 'reporting a vulnerability', 'reporting vulnerabilities', 'reporting security issues', 'reporting security vulnerabilities', 'vulnerabilities', 'vulnerability disclosure', 'threat model', 'segurança', 'política de segurança', 'considerações de segurança', 'vulnerabilidades', 'reportando vulnerabilidades', 'relatando vulnerabilidades', 'modelo de ameaças'],
  performance: ['performance', 'benchmarks', 'benchmark', 'benchmarking', 'benchmark results', 'performance tips', 'optimization', 'optimizations', 'optimizing', 'profiling', 'desempenho', 'performance e otimização', 'otimização', 'otimizações', 'otimizando'],
  deployment: ['deployment', 'deploying', 'deploy', 'deploy to', 'deploying to', 'production', 'production deployment', 'running in production', 'going to production', 'hosting', 'self-hosting', 'self hosting', 'implantação', 'publicação', 'em produção', 'produção', 'hospedagem', 'implantando'],
  glossary: ['glossary', 'terminology', 'definitions', 'terms and definitions', 'glossário', 'terminologia', 'definições', 'termos e definições'],
  roadmap: ['roadmap', 'road map', 'future plans', 'future work', 'planned features', 'upcoming features', 'todo', 'to do', 'to-do', 'planos futuros', 'trabalhos futuros', 'funcionalidades planejadas', 'recursos planejados', 'a fazer'],
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Heading text without Markdown, numbering, emoji or trailing punctuation: "1. **Installing** 🚀:" → "installing". */
export function normalizeHeading(h: string): string {
  return fold(
    h
      .replace(/\{#[^}]*\}/g, '') // {#custom-id}
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .replace(/^\s*(?:step\s+\d+|passo\s+\d+|\d+(?:\.\d+)*)[.):\s-]*/i, '')
      .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
      .replace(/’/g, "'"),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Heading as plain text for display: Markdown links, code ticks and emphasis removed, case kept. */
export function plainHeading(h: string): string {
  return h
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const MATCHERS = SECTION_TYPES.flatMap((type) =>
  PHRASES[type].map((p) => ({ type, phrase: fold(p), re: new RegExp(`(^|\\s)${fold(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`) })),
)

/** A release heading: "v1.31.21 (2025-11-19)", "[2.0.0] - 2024-01-01", "1.4.0", "Version 3.2", "Versão 2.0". */
const VERSION_HEADING = /^\s*(?:(?:version|versão|versao|release)\s+)?\[?v?\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?\]?(?:\s*[-–—(:]\s*.*)?$/i

/** Navigation, not content: never typed (the model isn't asked either). */
const NAVIGATION = /^(see also|next steps?|what'?s next|related( \w+)?|learn more|further reading|more (info|information|resources)|resources|references|links|useful links|table of contents|contents|toc|veja tambem|proximos passos|saiba mais|leia mais|referencias|links uteis|sumario|indice)$/

/** Navigation headings ("See also", "Next steps", "Veja também"). */
export const isNavigationHeading = (heading: string) => NAVIGATION.test(normalizeHeading(heading))

/** Too broad to label training data with: "Features" heads READMEs (overview) and release notes (changelog) alike. */
const AMBIGUOUS = new Set(['features', 'highlights', 'using', 'changes', 'history', 'testing', 'download', 'about', 'design', 'theory', 'background', 'recursos', 'definitions', 'production', 'produção', 'hosting', 'optimization', 'profiling', 'todo'])

/**
 * Section type from the heading alone, or null when the heading doesn't say. A heading of up to 5 words
 * matches when it contains a known phrase covering at least half its words ("Basic usage" → guide,
 * "Perform the first migration" → null); a phrase inside a longer matching one ("how to" in "how to fix")
 * doesn't count, and phrases of different types ("Usage examples") cancel out — the text decides then.
 * `strict` (labels for training data) also refuses the ambiguous phrases above.
 */
export function headingType(heading: string, strict = false): SectionType | null {
  if (VERSION_HEADING.test(heading)) return 'changelog'
  const h = normalizeHeading(heading)
  if (NAVIGATION.test(h)) return null
  const words = h.split(' ').length
  if (!h || words > 5) return null
  const startOf = (re: RegExp) => {
    const i = h.search(re)
    return i > 0 ? i + 1 : i // the match includes the space before the phrase
  }
  let hits = MATCHERS.map((m) => ({ ...m, at: startOf(m.re) })).filter((m) => m.at >= 0)
  hits = hits.filter((m) => !hits.some((o) => o !== m && o.phrase.length > m.phrase.length && o.at <= m.at && o.at + o.phrase.length >= m.at + m.phrase.length))
  if (!hits.length || new Set(hits.map((x) => x.type)).size > 1) return null
  const top = hits.reduce((x, y) => (y.phrase.length > x.phrase.length ? y : x))
  if (top.phrase.split(' ').length * 2 < words) return null
  // Ambiguous words only count as the whole heading ("Background", not "Background colors"), and never label training data.
  if (AMBIGUOUS.has(top.phrase) && (strict || h !== top.phrase)) return null
  return top.type
}

export interface DocSection {
  heading: string
  level: number
  /** 0-based line of the heading in the source (the preview's `data-line` is this + 1). */
  line: number
  /** Text under the heading up to the next heading of the same or a higher level (sub-sections included). */
  body: string
  /** Text up to the very next heading of any level — what's directly under this heading. */
  own: string
}

const ATX = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/

/** Sections by ATX (`## Title`) and setext (`Title` / `-----`) headings, ignoring code. */
export function splitDocSections(text: string): DocSection[] {
  const lines = splitLines(text)
  const heads: { line: number; level: number; heading: string; end: number }[] = []
  // YAML front matter (--- … ---) at the very top isn't content; its closing --- isn't a setext underline.
  let start = 0
  if (/^---\s*$/.test(lines[0]?.text ?? '')) {
    const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l.text))
    if (close > 0) start = close + 1
  }
  for (let i = start; i < lines.length; i++) {
    const l = lines[i]
    if (l.inCode) continue
    const m = ATX.exec(l.text)
    if (m) {
      heads.push({ line: i, level: m[1].length, heading: m[2], end: i })
      continue
    }
    const next = lines[i + 1]
    if (next && !next.inCode && l.text.trim() && !/^\s*([-*+]|\d+[.)])\s/.test(l.text) && /^ {0,3}(=+|-+)\s*$/.test(next.text) && (i === 0 || !lines[i - 1].text.trim())) {
      heads.push({ line: i, level: next.text.trim()[0] === '=' ? 1 : 2, heading: l.text.trim(), end: i + 1 })
      i++
    }
  }
  return heads.map((h, k) => {
    const nextAny = heads[k + 1]?.line ?? lines.length
    let nextSame = lines.length
    for (let j = k + 1; j < heads.length; j++)
      if (heads[j].level <= h.level) {
        nextSame = heads[j].line
        break
      }
    const slice = (to: number) => lines.slice(h.end + 1, to).map((l) => l.text).join('\n').trim()
    return { heading: h.heading.replace(/\s*\{#[^}]*\}\s*$/, ''), level: h.level, line: h.line, body: slice(nextSame), own: slice(nextAny) }
  })
}

/** Characters of real content: template directives, comments, images and link targets don't count
 *  ({% include %}, {{< x >}}, [!code-…], <!-- -->, ![alt](url), the (url) of a link). */
export function meaningfulChars(md: string): number {
  return md
    .replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|\[!code[^\]]*\]\([^)]*\)|\[!INCLUDE[^\]]*\]\([^)]*\)|<!--[\s\S]*?-->/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)|<img\b[^>]*>/gi, '')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\s/g, '').length
}

/** Enough text under a heading to judge it by. */
export const MIN_SECTION_CHARS = 40

const LIST_MARK = '\u2022\u2063' // bullet + invisible separator: never typed by hand

/**
 * Prose only: code blocks, tables, HTML, images and Markdown markers dropped, link text kept.
 * Each list item becomes its own paragraph, prefixed with LIST_MARK so key sentences can tell them apart.
 */
export function proseOf(md: string): string {
  return splitLines(md)
    .filter((l) => !l.inCode && !/^\s*\|/.test(l.text) && !/^\s*</.test(l.text) && !ATX.test(l.text) && !/^ {0,3}(=+|-+)\s*$/.test(l.text))
    .map((l) => {
      const item = /^\s*(?:>\s*)?(?:[-*+]|\d+[.)])\s+/.test(l.text)
      const text = l.text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/^\s*(?:>\s*)?(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/[*_~]+/g, '')
      return item ? `\n${LIST_MARK}${text}\n` : text
    })
    .join('\n')
}

const STOP = new Set(
  'a an the and or but of to in on for with at by from as is are was were be been it this that these those you your we our they their i he she its not no can will would should may might do does did have has had if then than so such into about over also more most other some any each all just only very there here what which who when where how why o os a as um uma uns umas e ou mas de do da dos das em no na nos nas para por com sem que se é são foi ser este esta isso esse essa eles elas você vocês nós seu sua seus suas não sim mais muito como quando onde porque também'.split(' '),
)

export function sentencesOf(prose: string): string[] {
  return prose
    .replace(/\n{2,}/g, ' ¶ ')
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“(])|\s¶\s/u)
    .map((s) => s.replace(/¶/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * The sentence that best stands for a section: highest density of the section's own frequent words
 * (stop-words removed, EN + PT), with a nudge for appearing early and a sensible length (6–40 words).
 * Sentences from paragraphs win over list items; a list item is picked only when there's no paragraph.
 */
export function keySentence(md: string): string | null {
  const all = sentencesOf(proseOf(md))
    .map((s) => ({ text: s.replace(LIST_MARK, '').trim(), item: s.startsWith(LIST_MARK) }))
    .filter(({ text }) => {
      const n = text.split(' ').length
      return n >= 6 && n <= 40 && /\p{L}/u.test(text)
    })
  const paragraphs = all.filter((s) => !s.item)
  const sents = (paragraphs.length ? paragraphs : all).map((s) => s.text)
  if (!sents.length) return null
  const words = (s: string) => fold(s).match(/\p{L}[\p{L}\p{N}'-]+/gu)?.filter((w) => !STOP.has(w) && w.length > 2) ?? []
  const tf = new Map<string, number>()
  for (const s of sents) for (const w of new Set(words(s))) tf.set(w, (tf.get(w) ?? 0) + 1)
  let best = sents[0]
  let bestScore = -Infinity
  sents.forEach((s, i) => {
    const ws = words(s)
    if (!ws.length) return
    const score = ws.reduce((a, w) => a + (tf.get(w)! - 1), 0) / Math.sqrt(ws.length) + (i === 0 ? 0.6 : 0) - i * 0.05
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  })
  return best.length > 220 ? best.slice(0, 217).trimEnd() + '…' : best
}
