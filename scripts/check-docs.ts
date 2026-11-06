/**
 * Marksage's own documents, checked by Marksage: every Smart Assist and Document-tab feature, run with the app's
 * own functions, in Rules and in Rules + AI.
 *   node --experimental-strip-types scripts/check-docs.ts          # report + checks (CI)
 *   … --quiet                                                       # only the failures and the totals
 *
 * Two kinds of document:
 * - The ones we ship to be read (README, the docs pages, EN + PT-BR) must be clean: no suggestion and no "Worth a
 *   look" flag, unless it's listed in ALLOWED with the reason Pablo approved. Fix the document, never the rules:
 *   a flag that's wrong is a rules finding (ROADMAP), not something to tune against these files.
 * - The sample (Pitwall, lib/sampleDocument.ts) is the inverse: every slip left in on purpose must trigger its
 *   feature, in EN and PT-BR, nothing else may show — and once every suggestion is accepted, only the two slips
 *   that have no automatic fix (the vague link and the long sentence) may remain.
 */
import { readFileSync } from 'node:fs'
import { HeuristicEngine } from '../src/assist/heuristicEngine.ts'
import { Q } from '../src/assist/questions.ts'
import type { DecisionEngine, Suggestion } from '../src/assist/types.ts'
import { loadModel, type LangModel } from '../src/assist/model/model.ts'
import { combineFence, toChoice } from '../src/assist/model/hybrid.ts'
import { listFenceSuggestions } from '../src/assist/features/codeFence.ts'
import { listStructureSuggestions } from '../src/assist/features/structure.ts'
import { scoreReadability } from '../src/assist/features/readability.ts'
import { buildOutline } from '../src/assist/outline.ts'
import { computeDocStats, type DocStats } from '../src/assist/docStats.ts'
import { SAMPLE_DOCUMENT, SAMPLE_DOCUMENT_PT_BR, getSampleFilename } from '../src/lib/sampleDocument.ts'

const quiet = process.argv.includes('--quiet')
const root = new URL('../', import.meta.url)
const read = (f: string) => readFileSync(new URL(f, root), 'utf8')
const bin = (f: string) => new Uint8Array(readFileSync(new URL(`public/models/${f}`, root))).buffer

// The two engines, as the app builds them (modelEngine.ts needs the browser; this is its logic, like eval-assist).
const rules = new HeuristicEngine()
const langModel = loadModel(bin('lang-v2.bin'))
const sectionModel = loadModel(bin('sections-v2.bin'))
const rulesAI: DecisionEngine = {
  kind: 'model',
  choice: (state, q, options) =>
    q === Q.fenceLanguage ? combineFence(toChoice(langModel.predict(state), options), () => rules.choice(state, q, options)) : rules.choice(state, q, options),
  score: (state, q, scale) => rules.score(state, q, scale),
  noul: (state, statement) => rules.noul(state, statement),
}
type Mode = 'Rules' | 'Rules + AI'
const MODES: [Mode, DecisionEngine, LangModel | null][] = [
  ['Rules', rules, null],
  ['Rules + AI', rulesAI, sectionModel],
]

interface Result {
  suggestions: string[]
  flags: string[]
  types: string[]
  dots: string[]
  stats: DocStats
  all: Suggestion[]
}

const lineOf = (text: string, pos: number) => text.slice(0, pos).split('\n').length
function describe(s: Suggestion, text: string): string {
  const where = `L${lineOf(text, s.edit.from)}`
  if (s.feature === 'codeFence') {
    if (s.choices?.length) return `${where} code: ${s.choices.map((c) => c.id).join(' or ')}${s.unsure ? ' (not sure)' : ''}`
    return `${where} code: ${s.edit.insert}`
  }
  return `${where} ${s.message?.key.replace('suggest.structure.', '') ?? s.feature}`
}

async function evaluate(text: string, filename: string, engine: DecisionEngine, model: LangModel | null): Promise<Result> {
  const fences = await listFenceSuggestions(text, engine, () => false, undefined, 50, true)
  const lines = await listStructureSuggestions(text, engine, () => false)
  const all = [...fences, ...lines].sort((a, b) => a.edit.from - b.edit.from)
  const outline = buildOutline(text, model)
  const stats = computeDocStats(text, outline, filename)
  const dots = await scoreReadability(text, engine)
  return {
    suggestions: all.map((s) => describe(s, text)),
    flags: stats.flags.map((f) => `L${f.line + 1} ${f.kind}`),
    types: outline.filter((o) => o.type && !o.tentative).map((o) => `L${o.line + 1} ${o.type}${o.source === 'model' ? ' ✦' : ''}`),
    dots: dots.map((d) => `${d.heading.slice(0, 32)}: ${d.label}`),
    stats,
    all,
  }
}

/** Accept every suggestion (the first choice of a two-option offer), bottom up so positions stay valid. */
function acceptAll(text: string, all: Suggestion[]): string {
  for (const s of [...all].sort((a, b) => b.edit.from - a.edit.from)) {
    const e = s.choices?.[0]?.edit ?? s.edit
    text = text.slice(0, e.from) + e.insert + text.slice(e.to)
  }
  return text
}

let failures = 0
const fail = (msg: string) => {
  failures++
  console.log(`  ✗ ${msg}`)
}
const same = (what: string, got: string[], want: string[]) => {
  const missing = want.filter((w) => !got.includes(w))
  const extra = got.filter((g) => !want.includes(g))
  if (missing.length) fail(`${what}: missing ${missing.join(' · ')}`)
  if (extra.length) fail(`${what}: unexpected ${extra.join(' · ')}`)
}

function report(r: Result) {
  if (quiet) return
  const s = r.stats
  const tone = s.tone ? `${s.tone.register} · ${s.tone.voice}` : '—'
  console.log(`  kind ${s.kind?.id ?? '—'} · language ${s.language ?? '—'} · ${s.words} words · readability ${s.readability ? `LIX ${s.readability.lix} (${s.readability.value}/4)` : '—'} · avg sentence ${s.avgSentenceWords} · tone ${tone}`)
  console.log(`  section types (${r.types.length}): ${r.types.join(' · ') || '—'}`)
  console.log(`  readability dots: ${r.dots.join(' · ') || '—'}`)
  console.log(`  suggestions (${r.suggestions.length}): ${r.suggestions.join(' · ') || '—'}`)
  console.log(`  worth a look (${r.flags.length}): ${r.flags.join(' · ') || '—'}`)
}

// ---- 1. The documents we ship: clean ----
/**
 * Approved remainders: `doc|mode|item`, each with Pablo's reason. Untyped sections aren't failures (the docs name
 * their sections after their own topics; Pablo, 2026-11-05: accepted for now, to revisit with the section models).
 */
const ALLOWED: Record<string, string> = {}
const SHIPPED: [string, string][] = [
  ['README.md', 'readme'],
  ['docs/SMART-ASSIST.md', 'docs'],
  ['docs/MODELS.md', 'docs'],
  ['docs/SMART-ASSIST.pt-BR.md', 'docs'],
  ['docs/MODELS.pt-BR.md', 'docs'],
]
for (const [file, kind] of SHIPPED) {
  const text = read(file)
  for (const [mode, engine, model] of MODES) {
    console.log(`\n## ${file} — ${mode}`)
    const r = await evaluate(text, file.split('/').pop()!, engine, model)
    report(r)
    if (r.stats.kind?.id !== kind) fail(`kind ${r.stats.kind?.id ?? '—'}, expected ${kind}`)
    for (const item of [...r.suggestions, ...r.flags]) if (!ALLOWED[`${file}|${mode}|${item}`]) fail(`${item}`)
  }
}

// ---- 2. The sample: every deliberate slip, nothing else ----
/**
 * The slips (lines of the document, the same in both languages — keep EN and PT-BR in step):
 *  17 Installation: untagged shell block        → code: bash
 *  26 Usage: untagged import/await block         → code: js (Rules) · "Which language?" JS or TS (Rules + AI)
 *  35–37 `-item` ×3                              → list item
 *  41 `**Options**` under ## Configuration       → heading (### Options)
 *  45 `• item` pasted from a document            → list item
 *  49 Configuration: untagged JSON               → code: json
 *  61–64 a raw CSV                               → smart paste, only when pasted (not listed here)
 *  67 "Keeping your data private" (no type word) → the section model reads it: Security ✦ (EN only — it reads
 *                                                  Portuguese poorly, ROADMAP §4)
 *  73 How it works: one 90-word sentence + "click here" → readability "very hard", the hardest section, the
 *                                                  long-sentence and vague-link flags (no automatic fix)
 *  81–82 `1)item` ×2                             → numbered item
 *  84 `[text] (#examples)`                       → link fixed
 *  86 `##License`                                → heading
 */
const CODE_RULES = ['L17 code: bash', 'L26 code: js', 'L49 code: json']
const CODE_AI = ['L17 code: bash', 'L26 code: ts or js', 'L49 code: json']
const LINES = ['L35 list', 'L36 list', 'L37 list', 'L41 heading', 'L45 list', 'L81 ordered', 'L82 ordered', 'L84 link', 'L86 heading']
const FLAGS = ['L17 untaggedCode', 'L26 untaggedCode', 'L49 untaggedCode', 'L73 vagueLink', 'L73 longSentence']
const TYPES = ['L13 setup', 'L22 guide', 'L39 config', 'L57 example', 'L71 explanation', 'L75 troubleshooting']
const AFTER = ['L73 vagueLink', 'L73 longSentence']
const SAMPLES: [string, string, string][] = [
  ['en', SAMPLE_DOCUMENT, 'How it works'],
  ['pt-BR', SAMPLE_DOCUMENT_PT_BR, 'Como funciona'],
]
const dotLevels: Record<string, string> = {}
for (const [lang, text, hardest] of SAMPLES) {
  for (const [mode, engine, model] of MODES) {
    console.log(`\n## sample (${lang}) — ${mode}`)
    const r = await evaluate(text, getSampleFilename(), engine, model)
    report(r)
    const ai = mode === 'Rules + AI'
    same('suggestions', r.suggestions, [...(ai ? CODE_AI : CODE_RULES), ...LINES].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))))
    same('flags', r.flags, FLAGS)
    same('section types', r.types, ai && lang === 'en' ? [...TYPES, 'L67 security ✦'] : TYPES)
    if (r.stats.kind?.id !== 'readme') fail(`kind ${r.stats.kind?.id ?? '—'}, expected readme`)
    if (r.stats.hardestSection?.heading !== hardest) fail(`hardest section ${r.stats.hardestSection?.heading}, expected ${hardest}`)
    if (!r.dots.some((d) => d.startsWith(hardest) && d.endsWith('very hard'))) fail(`no "very hard" dot on ${hardest}`)
    // The same sections get a readability dot, at the same level, in both languages.
    const levels = r.dots.map((d) => d.slice(d.lastIndexOf(': ') + 2)).join(' · ')
    if (lang === 'en') dotLevels[mode] = levels
    else if (levels !== dotLevels[mode]) fail(`readability dots ${levels}, the English sample has ${dotLevels[mode]}`)
    if (r.stats.tone?.voice !== 'you') fail(`voice ${r.stats.tone?.voice}, expected you`)
    // The tour done: nothing new may appear, and only the slips without a fix remain.
    const after = await evaluate(acceptAll(text, r.all), getSampleFilename(), engine, model)
    if (after.suggestions.length) fail(`after accepting everything, suggestions left: ${after.suggestions.join(' · ')}`)
    same('flags after accepting everything', after.flags, AFTER)
    if (!quiet) console.log(`  after accepting everything: ${after.flags.join(' · ') || '—'}`)
  }
}

console.log(`\n${failures === 0 ? '✓ documents clean, sample as designed' : `✗ ${failures} problem${failures === 1 ? '' : 's'}`}`)
process.exit(failures ? 1 : 0)
