/**
 * The Outline panel's data: every heading of the document with its section type and key sentence.
 *
 * Type, in order: the heading rule (sections.ts — "Installation" → setup), then, in Local model mode,
 * the section model reading the text under the heading (never the heading itself; it was trained that
 * way, see training/train-sections.ts). The model's answer is used only when it isn't "other" and
 * passes LABEL_GATE (below the usual gate it's marked tentative); otherwise the section stays untyped.
 * Navigation sections ("See also", "Next steps") are never typed.
 */
import type { LangModel } from './model/model.ts'
import { passesGate } from './types.ts'
import {
  headingType,
  isNavigationHeading,
  keySentence,
  meaningfulChars,
  MIN_SECTION_CHARS,
  SECTION_TYPES,
  splitDocSections,
  type SectionType,
} from './sections.ts'

export interface OutlineItem {
  heading: string
  level: number
  /** 0-based source line of the heading. */
  line: number
  type: SectionType | null
  /** Where the type came from. */
  source: 'heading' | 'model' | null
  /** Model confidence (0–1) when `source` is "model". */
  confidence?: number
  /** Model type below the usual gate but above the label gate: shown as "probably". */
  tentative?: boolean
  /** The sentence that best stands for the section, when it has prose. */
  key: string | null
}

const isType = (x: string): x is SectionType => (SECTION_TYPES as readonly string[]).includes(x)

/**
 * A type badge changes nothing in the document, so it may show below the 0.8 gate that edits use:
 * from 0.6 it's shown as "probably" (chosen on the dev repos: agreement 90% at 0.8, 87% from 0.6).
 */
export const LABEL_GATE = 0.6

export function sectionTypeByModel(model: LangModel, text: string): { type: SectionType; confidence: number; tentative: boolean } | null {
  if (meaningfulChars(text) < MIN_SECTION_CHARS) return null
  const p = model.predict(text)
  const ranked = Object.entries(p).sort((a, b) => b[1] - a[1])
  const [top, conf] = ranked[0]
  const probs = ranked.map(([, v]) => v)
  if (!isType(top) || !passesGate(probs, LABEL_GATE, 0.2)) return null
  return { type: top, confidence: conf, tentative: !passesGate(probs) }
}

export function buildOutline(text: string, model?: LangModel | null): OutlineItem[] {
  return splitDocSections(text).map((s) => {
    const base = { heading: s.heading, level: s.level, line: s.line, key: keySentence(s.own) ?? keySentence(s.body) }
    const byHeading = headingType(s.heading)
    if (byHeading) return { ...base, type: byHeading, source: 'heading' }
    const byModel = model && !isNavigationHeading(s.heading) ? sectionTypeByModel(model, s.own) : null
    if (byModel) return { ...base, type: byModel.type, source: 'model', confidence: byModel.confidence, tentative: byModel.tentative }
    return { ...base, type: null, source: null }
  })
}
