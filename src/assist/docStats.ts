/**
 * The Document tab's data: facts, what kind of document it looks like, readability, tone signals and
 * things worth a look — all computed from the text on the device. Pure TS (runs in the eval too).
 *
 * Kind and tone are *signals*, shown with their reasons; nothing here edits the document.
 * The kind builds on the Outline's section types (heading rule + section model), so it improves
 * whenever those do.
 */
import { lix } from './heuristics/readability.ts'
import type { OutlineItem } from './outline.ts'
import { splitLines } from './prefilter.ts'
import { plainHeading, proseOf, SECTION_TYPES, sentencesOf, splitDocSections, type SectionType } from './sections.ts'

export type DocKind = 'readme' | 'changelog' | 'guide' | 'reference' | 'docs' | 'article' | 'notes'
/** Display order of the kinds (labels, docs). */
export const DOC_KINDS: DocKind[] = ['readme', 'changelog', 'guide', 'reference', 'docs', 'article', 'notes']
export type FlagKind =
  | 'untaggedCode'
  | 'headingJump'
  | 'multipleH1'
  | 'emptySection'
  | 'duplicateHeading'
  | 'imageNoAlt'
  | 'vagueLink'
  | 'longSentence'
  | 'longSection'
/** Display order: structure first, then content. */
export const FLAG_ORDER: FlagKind[] = ['headingJump', 'multipleH1', 'emptySection', 'duplicateHeading', 'untaggedCode', 'imageNoAlt', 'vagueLink', 'longSection', 'longSentence']

export interface DocFlag {
  kind: FlagKind
  /** 0-based source line. */
  line: number
  /** Short context: "H2 → H4", the heading, the start of the sentence, the link text. */
  detail?: string
}

export interface DocStats {
  /** Whitespace-separated words, as the editor footer counts them. */
  words: number
  /** Words outside code, for reading time and tone rates. */
  proseWords: number
  readingMinutes: number
  sections: number
  codeBlocks: number
  /** Language tag → count, most used first ("" = no language). */
  codeLanguages: [string, number][]
  tables: number
  links: number
  images: number
  /** null: too little prose to tell; 'unknown': enough prose, but not English or Portuguese. */
  language: 'en' | 'pt' | 'mixed' | 'unknown' | null
  /** Whole document (prose only); null when there's too little text to judge. */
  readability: { lix: number; value: number } | null
  hardestSection: { heading: string; line: number; value: number } | null
  avgSentenceWords: number
  kind: { id: DocKind; because: string[] } | null
  tone: Tone | null
  sectionTypes: [SectionType, number][]
  flags: DocFlag[]
}

export interface Tone {
  register: 'formal' | 'neutral' | 'conversational'
  /** Counts that led there (only the non-zero ones are shown). */
  signals: { contractions: number; exclamations: number; emoji: number; questions: number; slang: number }
  /** Who the text talks as / to. */
  voice: 'you' | 'we' | 'i' | 'impersonal'
}

const WPM = 230
const MIN_WORDS_READABILITY = 80
const MIN_WORDS_TONE = 60
const LONG_SENTENCE = 40
const LONG_SECTION = 1000
const READABILITY_EDGES = [30, 40, 50, 60] // LIX → 0 very easy … 4 very hard (as the readability dots)

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)/
const EN_STOP = new Set('the and of to is are was in that it for with as on be this you your by or from not can will have an at which'.split(' '))
const PT_STOP = new Set('de que o a os as e do da dos das em no na para com um uma por não se é são mais como você seu sua pelo pela ao'.split(' '))
const CONTRACTION = /\b\w+n['’]t\b|\b(?:i|you|we|they|it|that|there|what|let|he|she)['’](?:m|re|ve|ll|d|s)\b/gi
const PT_SLANG = /\b(?:pra|pro|tá|tô|né|vc|vcs|cê|beleza|valeu|bora|tipo assim|galera|massa)\b/gi
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/gu
const VAGUE_LINK = /^(?:click here|here|link|this|this link|read more|more|aqui|clique aqui|este link|esse link|leia mais|saiba mais)$/i

const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0
const words = (s: string) => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []

export function computeDocStats(text: string, outline: OutlineItem[], filename?: string | null): DocStats {
  const lines = splitLines(text)
  const sections = splitDocSections(text)
  const flags: DocFlag[] = []

  // ---- code blocks, tables, links, images ----
  const langs = new Map<string, number>()
  let codeBlocks = 0
  let tables = 0
  let open: { marker: string } | null = null
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE.exec(lines[i].text)
    if (m && !open) {
      open = { marker: m[2] }
      codeBlocks++
      const tag = m[3].toLowerCase()
      langs.set(tag, (langs.get(tag) ?? 0) + 1)
      if (!tag) flags.push({ kind: 'untaggedCode', line: i })
    } else if (m && open && m[2][0] === open.marker[0] && m[2].length >= open.marker.length && !m[3]) open = null
    const t = lines[i].text
    if (!lines[i].inCode && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(t)) tables++
  }
  let links = 0
  let images = 0
  lines.forEach((l, i) => {
    if (l.inCode) return
    const t = l.text.replace(/`[^`]*`/g, '')
    for (const m of t.matchAll(/(!?)\[([^\]]*)\]\([^)]*\)/g)) {
      if (m[1]) {
        images++
        if (!m[2].trim()) flags.push({ kind: 'imageNoAlt', line: i })
      } else {
        links++
        if (VAGUE_LINK.test(m[2].replace(/[*_`]/g, '').trim())) flags.push({ kind: 'vagueLink', line: i, detail: m[2] })
      }
    }
    for (const m of t.matchAll(/<img\b[^>]*>/gi)) {
      images++
      if (!/\balt\s*=\s*["'][^"']+["']/i.test(m[0])) flags.push({ kind: 'imageNoAlt', line: i })
    }
  })

  // ---- words, language, sentences ----
  const allWords = text.trim().match(/\S+/g)?.length ?? 0 // same count as the footer
  const prose = proseOf(text)
  const proseWordList = words(prose)
  const lower = proseWordList.map((w) => w.toLowerCase())
  const en = lower.filter((w) => EN_STOP.has(w)).length
  const pt = lower.filter((w) => PT_STOP.has(w)).length
  // English and Portuguese prose is ~20–35% stopwords; another language (Spanish shares a few) or filler text
  // scores far less (~1–12% on samples) — then it says "not detected" instead of guessing.
  const coverage = (en + pt) / Math.max(1, lower.length)
  const language =
    en + pt < 15 ? (lower.length >= 120 && coverage < 0.14 ? 'unknown' : null)
    : coverage < 0.14 ? 'unknown'
    : en / (en + pt) > 0.7 ? 'en' : en / (en + pt) < 0.3 ? 'pt' : 'mixed'
  const sentences = sentencesOf(prose).filter((s) => words(s).length >= 3)
  const avgSentenceWords = sentences.length ? Math.round(sentences.reduce((a, s) => a + words(s).length, 0) / sentences.length) : 0

  // Long sentences, with the line of the paragraph they're in.
  let para: { start: number; text: string[] } | null = null
  const flushPara = () => {
    if (!para) return
    for (const s of sentencesOf(proseOf(para.text.join('\n'))))
      if (words(s).length > LONG_SENTENCE) flags.push({ kind: 'longSentence', line: para.start, detail: words(s).slice(0, 8).join(' ') + '…' })
    para = null
  }
  lines.forEach((l, i) => {
    const t = l.text.trim()
    if (l.inCode || !t || /^(#{1,6}\s|\||<|[-*+]\s|\d+[.)]\s|>)/.test(t) || /^(=+|-+)$/.test(t)) return flushPara()
    if (!para) para = { start: i, text: [] }
    para.text.push(l.text)
  })
  flushPara()

  // ---- headings: jumps, extra H1s, empty, duplicates, long ----
  let prevLevel = 0
  let h1s = 0
  const parents: { level: number; line: number }[] = []
  const seen = new Set<string>()
  for (const s of sections) {
    if (prevLevel && s.level > prevLevel + 1) flags.push({ kind: 'headingJump', line: s.line, detail: `H${prevLevel} → H${s.level}` })
    prevLevel = s.level
    if (s.level === 1 && ++h1s > 1) flags.push({ kind: 'multipleH1', line: s.line, detail: plainHeading(s.heading) })
    if (!s.body.trim()) flags.push({ kind: 'emptySection', line: s.line, detail: plainHeading(s.heading) })
    while (parents.length && parents[parents.length - 1].level >= s.level) parents.pop()
    const key = `${parents[parents.length - 1]?.line ?? -1}|${s.level}|${plainHeading(s.heading).toLowerCase()}`
    if (seen.has(key)) flags.push({ kind: 'duplicateHeading', line: s.line, detail: plainHeading(s.heading) })
    seen.add(key)
    parents.push({ level: s.level, line: s.line })
    if (words(proseOf(s.own)).length > LONG_SECTION) flags.push({ kind: 'longSection', line: s.line, detail: plainHeading(s.heading) })
  }

  // ---- readability ----
  const bucket = (v: number) => READABILITY_EDGES.filter((e) => v >= e).length
  const whole = proseWordList.length >= MIN_WORDS_READABILITY ? lix(prose) : null
  let hardestSection: DocStats['hardestSection'] = null
  for (const s of sections) {
    const own = proseOf(s.own)
    if (words(own).length < MIN_WORDS_READABILITY) continue
    const v = lix(own).lix
    if (!hardestSection || v > hardestSection.value) hardestSection = { heading: plainHeading(s.heading), line: s.line, value: v }
  }

  // ---- section types (from the Outline) and the document kind ----
  const typeCounts = new Map<SectionType, number>()
  for (const item of outline) if (item.type && !item.tentative) typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1)
  const sectionTypes = SECTION_TYPES.filter((t) => typeCounts.has(t)).map((t) => [t, typeCounts.get(t)!] as [SectionType, number]).sort((a, b) => b[1] - a[1])
  const listLines = lines.filter((l) => !l.inCode && /^\s*([-*+]|\d+[.)])\s/.test(l.text)).length
  const contentLines = lines.filter((l) => !l.inCode && l.text.trim()).length
  const kind = kindFromFilename(filename) ?? guessKind({ typeCounts, outline, sections: sections.length, words: proseWordList.length, codeBlocks, tables, listShare: contentLines ? listLines / contentLines : 0, avgSentenceWords })
  // Changelogs often give every release its own H1 under a bare "# Changelog" title — the convention there, not a mistake.
  const finalFlags =
    kind?.id === 'changelog' ? flags.filter((f) => f.kind !== 'multipleH1' && !(f.kind === 'emptySection' && f.line === sections[0]?.line)) : flags

  // ---- tone ----
  let tone: Tone | null = null
  if (proseWordList.length >= MIN_WORDS_TONE) {
    const signals = {
      contractions: count(prose, CONTRACTION),
      exclamations: count(prose, /!(?=\s|$)/g),
      emoji: count(prose, EMOJI),
      questions: count(prose, /\?(?=\s|$)/g),
      slang: count(prose, PT_SLANG),
    }
    const per1k = (n: number) => (1000 * n) / proseWordList.length
    // Contractions count half: modern technical style guides recommend them ("don't", "you'll").
    const casual = 0.5 * per1k(signals.contractions) + 2 * per1k(signals.exclamations) + 3 * per1k(signals.emoji) + 3 * per1k(signals.slang)
    const evidence = signals.contractions + signals.exclamations + signals.emoji + signals.slang
    const register = casual >= 12 && evidence >= 3 ? 'conversational' : casual < 2 && avgSentenceWords >= 16 ? 'formal' : 'neutral'
    const you = count(prose, /\b(?:you|your|yours|você|vocês|te|teu|tua)\b/gi)
    const we = count(prose, /\b(?:we|our|ours|us|nós|nosso|nossa|nossos|nossas|a gente|vamos)\b/gi)
    const i = count(prose, /\b(?:I|my|mine|eu|meu|minha|meus|minhas)\b/g)
    const top = Math.max(you, we, i)
    const voice = per1k(top) < 4 ? 'impersonal' : top === you ? 'you' : top === we ? 'we' : 'i'
    tone = { register, signals, voice }
  }

  return {
    words: allWords,
    proseWords: proseWordList.length,
    readingMinutes: Math.max(1, Math.round(proseWordList.length / WPM)),
    sections: sections.length,
    codeBlocks,
    codeLanguages: [...langs.entries()].sort((a, b) => b[1] - a[1]),
    tables,
    links,
    images,
    language,
    readability: whole ? { lix: Math.round(whole.lix), value: bucket(whole.lix) } : null,
    hardestSection: hardestSection && { ...hardestSection, value: bucket(hardestSection.value) },
    avgSentenceWords,
    kind,
    tone,
    sectionTypes,
    flags: finalFlags.sort((a, b) => FLAG_ORDER.indexOf(a.kind) - FLAG_ORDER.indexOf(b.kind) || a.line - b.line),
  }
}

/** The file name says it outright: README.md, CHANGELOG.md, docs/guide.md … */
function kindFromFilename(filename?: string | null): DocStats['kind'] {
  const base = (filename ?? '').split(/[\\/]/).pop()?.replace(/\.(md|markdown|mdx)$/i, '').toLowerCase() ?? ''
  const id: DocKind | null = /^readme\b/.test(base)
    ? 'readme'
    : /^(changelog|changes|history|releases?|release-notes|news)\b/.test(base)
      ? 'changelog'
      : /^(guide|tutorial|getting-started|quickstart|contributing|install(ation)?)\b/.test(base)
        ? 'guide'
        : /^(api|reference|cli|options|config(uration)?)\b/.test(base)
          ? 'reference'
          : /^(architecture|design|internals|docs?|documentation|spec(ification)?|adr)\b/.test(base)
            ? 'docs'
            : null
  return id && { id, because: [`file:${filename!.split(/[\\/]/).pop()}`] }
}

/**
 * What the document looks like, with the reasons (section headings or facts) — first match wins.
 * Needs real evidence: three or more typed sections (two changelog ones), or a clear shape; otherwise no guess.
 */
function guessKind(d: {
  typeCounts: Map<SectionType, number>
  outline: OutlineItem[]
  sections: number
  words: number
  codeBlocks: number
  tables: number
  listShare: number
  avgSentenceWords: number
}): DocStats['kind'] {
  const n = (t: SectionType) => d.typeCounts.get(t) ?? 0
  const typed = [...d.typeCounts.values()].reduce((a, b) => a + b, 0)
  // Enough typed sections to judge by: at least 3, and a quarter of the document.
  const enough = typed >= 3 && typed >= d.outline.length / 4
  // A top-level title with an intro paragraph is a README's overview, even without an "Overview" heading.
  const top = Math.min(...d.outline.map((i) => i.level))
  const intro = d.outline[0]?.level === top && !!d.outline[0].key
  const named = (...types: SectionType[]) => {
    const out: string[] = []
    // Headings that name their type are the clearest reasons; then the model's confident ones.
    const ranked = [...d.outline].sort((a, b) => (a.source === 'heading' ? 0 : 1) - (b.source === 'heading' ? 0 : 1))
    for (const item of ranked) if (item.type && !item.tentative && types.includes(item.type) && out.length < 3) out.push(plainHeading(item.heading))
    return out
  }
  if (n('changelog') >= 2 && n('changelog') >= typed / 2) return { id: 'changelog', because: named('changelog') }
  const readmeParts = (['overview', 'setup', 'guide', 'example', 'legal', 'contributing'] as SectionType[]).filter((t) => n(t) > 0 || (t === 'overview' && intro))
  if (n('setup') > 0 && readmeParts.length >= 3) return { id: 'readme', because: named('setup', 'guide', 'example', 'legal', 'contributing', 'overview') }
  if (enough && n('reference') + n('config') >= typed * 0.6) return { id: 'reference', because: named('reference', 'config') }
  const steps = d.outline.filter((i) => /^(step|passo|etapa)\s*\d+/i.test(plainHeading(i.heading))).length
  if (steps >= 3) return { id: 'guide', because: [`steps:${steps}`] }
  if (enough && n('setup') + n('guide') + n('example') + n('troubleshooting') >= typed * 0.6) return { id: 'guide', because: named('setup', 'guide', 'example', 'troubleshooting') }
  // Technical documentation (design docs, "how it works", model cards…): mostly explanation, reference or config
  // sections — or, since such headings are usually the doc's own topics ("The confidence gate") and name no type,
  // its shape: long, nested sections, and tables or code to back the prose.
  if (enough && n('explanation') + n('reference') + n('config') + n('performance') + n('security') >= typed * 0.5)
    return { id: 'docs', because: named('explanation', 'reference', 'config', 'performance', 'security') }
  const levels = new Set(d.outline.map((i) => i.level)).size
  if (d.words >= 800 && d.sections >= 8 && levels >= 2 && d.tables + d.codeBlocks >= 3 && d.listShare < 0.5 && d.avgSentenceWords >= 10)
    return { id: 'docs', because: [`shape:${d.sections},${d.tables},${d.codeBlocks}`] }
  if (d.listShare >= 0.5 && d.words >= 40) return { id: 'notes', because: ['lists'] }
  if (d.words >= 120 && d.codeBlocks <= 1 && d.tables === 0 && d.listShare < 0.3 && d.avgSentenceWords >= 12) return { id: 'article', because: ['prose'] }
  return null
}
