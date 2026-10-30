import type { DecisionEngine, Suggestion } from '../types.ts'
import { findStructureCandidates, type StructureCandidate, type StructureKind } from '../prefilter.ts'
import { hash } from './codeFence.ts'

const KEYS: Record<StructureKind, string> = {
  'heading-bold': 'suggest.structure.heading',
  'heading-nospace': 'suggest.structure.heading',
  'heading-wiki': 'suggest.structure.heading',
  'list-nospace': 'suggest.structure.list',
  'list-glyph': 'suggest.structure.list',
  'ordered-nospace': 'suggest.structure.ordered',
  'ordered-dash': 'suggest.structure.ordered',
  'link-space': 'suggest.structure.link',
}

const LABELS: Record<StructureKind, string> = {
  'heading-bold': 'Make this a heading?',
  'heading-nospace': 'Make this a heading?',
  'heading-wiki': 'Make this a heading?',
  'list-nospace': 'Make this a list item?',
  'list-glyph': 'Make this a list item?',
  'ordered-nospace': 'Make this a numbered item?',
  'ordered-dash': 'Make this a numbered item?',
  'link-space': 'Fix this link?',
}

/**
 * F3 — `noul` per candidate line; skips the line being typed unless `onLine` (after a longer pause, so a lone
 * `#Title` or the line you just finished still gets its hint — launch QA #22).
 */
export async function suggestStructure(
  text: string,
  cursor: number,
  engine: DecisionEngine,
  isDismissed: (key: string) => boolean,
  signal?: AbortSignal,
  threshold = 0.8,
  onLine = false,
): Promise<Suggestion | null> {
  const candidates = findStructureCandidates(text)
    .filter((c) => onLine || cursor < c.lineStart || cursor > c.lineEnd)
    .sort((a, b) => Math.abs(a.lineStart - cursor) - Math.abs(b.lineStart - cursor))

  for (const c of candidates.slice(0, 5)) {
    if (isDismissed(structureKey(c))) continue
    const s = await structureSuggestion(c, engine, threshold)
    if (signal?.aborted) return null
    if (s) return s
  }
  return null
}

/** Every near-miss line of the document that gets a suggestion — for the panel's Suggestions tab. */
export async function listStructureSuggestions(
  text: string,
  engine: DecisionEngine,
  isDismissed: (key: string) => boolean,
  signal?: AbortSignal,
  limit = 50,
  threshold = 0.8,
): Promise<Suggestion[]> {
  const out: Suggestion[] = []
  for (const c of findStructureCandidates(text)) {
    if (out.length >= limit) break
    if (isDismissed(structureKey(c))) continue
    const s = await structureSuggestion(c, engine, threshold)
    if (signal?.aborted) return []
    if (s) out.push(s)
  }
  return out
}

const structureKey = (c: StructureCandidate) => `structure:${hash(c.text)}`

async function structureSuggestion(c: StructureCandidate, engine: DecisionEngine, threshold: number): Promise<Suggestion | null> {
  const p = await engine.noul(c.context, c.statement)
  // Binary gate: p ≥ threshold implies margin over (1 - p) ≥ 0.6.
  if (p < threshold) return null
  return {
    key: structureKey(c),
    feature: 'structure',
    label: LABELS[c.kind],
    message: { key: KEYS[c.kind] },
    detail: `${c.text.trim()}  →  ${c.replacement.trim()}`,
    confidence: p,
    edit: { from: c.lineStart, to: c.lineEnd, insert: c.replacement },
    expected: c.text,
  }
}
