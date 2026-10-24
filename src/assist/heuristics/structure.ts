/**
 * Heuristic `noul` for F3. `state` is the local context (±2 lines),
 * `statement` names the candidate line in quotes and the intended structure.
 */

/** Sentence-ending punctuation, incl. CJK (。！？), Devanagari (।) and Khmer (។). */
const SENTENCE_END = /[.!?。！？।។]$/
/** Admonition / Q&A labels — bold, but a callout, not a section title. EN + PT-BR. */
const ADMONITION =
  /^(note|notes|nb|warning|caution|danger|tip|hint|important|attention|info|q|a|nota|notas|aviso|atenção|atencao|cuidado|dica|importante|obs|observação|observacao|p|r)\b/i

export function structureProbability(state: string, statement: string): number {
  const m = /"(.*)"/.exec(statement)
  if (!m) return 0.5
  const line = m[1]
  const others = state.split('\n').filter((l) => l !== line && l.trim() !== '')
  const words = line.replace(/[*#=\-+\d.)]/g, ' ').trim().split(/\s+/).filter(Boolean).length

  if (/heading/.test(statement)) {
    if (line.startsWith('**')) return clamp(boldHeading(line, words))
    if (/^={2,}/.test(line)) return 0.9
    if (/^#{2,}/.test(line)) return 0.93
    if (line.startsWith('#')) return words >= 2 ? 0.88 : 0.55
  }

  if (/bullet list/.test(statement)) {
    const t = line.trim()
    if (/^-\d/.test(t)) return 0.2 // "-5 degrees" — negative number
    if (/^\*[^*\s][^*]*\*/.test(t)) return 0.1 // *emphasis*
    if (/^-[a-z](?=[\s,)=]|$)/i.test(t)) return 0.15 // "-p)", "-s, --search": a CLI flag
    if (/^-(webkit|moz|ms|o)-/.test(t) || /^[-+*][\w-]+\s*:\s*[^:]+;$/.test(t)) return 0.05 // CSS declaration
    if (/^[-+]\S+(\s+[-+]\S+)+/.test(t)) return 0.15 // "+SIMD +AVX", "-Wall -Wextra": flags, not items
    const listNeighbors = others.filter((l) => /^\s*[-+*]\s?\S/.test(l)).length
    // A lone `*`/`+` line is more often a footnote or broken emphasis than a list item.
    if (listNeighbors === 0) return t.startsWith('-') ? 0.72 : 0.55
    return clamp(0.8 + listNeighbors * 0.07)
  }

  if (/numbered list/.test(statement)) {
    const numNeighbors = others.filter((l) => /^\s*\d{1,3}[.)]\s?\S/.test(l)).length
    return clamp(0.78 + numNeighbors * 0.08)
  }
  return 0.5
}

/** `**Title**` alone on a line: a heading, or a bold label / emphasised sentence? */
function boldHeading(line: string, words: number): number {
  const inner = line.replace(/^\*\*/, '').replace(/\*\*:?\s*$/, '').trim()
  // Scripts written without spaces (CJK, Thai, Khmer…) — count characters instead of words.
  const long = words > 10 || (words <= 2 && inner.length > 40)
  let p = 0.86
  if (long) p -= 0.35
  if (SENTENCE_END.test(inner)) p -= 0.4
  if (/:\s*$|:\*\*\s*$|\*\*:\s*$/.test(line)) p -= 0.12 // "**Returns:**" introduces something — a label
  if (ADMONITION.test(inner.replace(/^[^\p{L}]+/u, ''))) p -= 0.5
  if (/^\[[^\]]*\]\([^)]*\)$/.test(inner)) p -= 0.6 // "**[⬆ back to top](#toc)**" — a bold link
  return p
}

function clamp(p: number): number {
  return Math.max(0.01, Math.min(0.97, p))
}
