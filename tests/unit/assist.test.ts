import { describe, expect, it } from 'vitest'
import { findStructureCandidates } from '../../src/assist/prefilter'
import { listStructureSuggestions } from '../../src/assist/features/structure'
import { HeuristicEngine } from '../../src/assist/heuristicEngine'

const replacement = (line: string) => findStructureCandidates(`${line}\n\ntext`).map((c) => c.replacement)
/** What the Suggestions tab would offer for this document, in Rules mode. */
const offered = async (doc: string) => (await listStructureSuggestions(doc, new HeuristicEngine(), () => false)).map((s) => s.label)

describe('structure hints', () => {
  it('pre-filter: wiki headings map like MediaWiki', () => {
    expect(replacement('== Usage ==')).toEqual(['## Usage'])
    expect(replacement('=== Options ===')).toEqual(['### Options'])
  })

  it('pre-filter: catches the near-misses the docs list', () => {
    expect(replacement('#Heading')).toEqual(['# Heading'])
    expect(replacement('-item')).toEqual(['- item'])
  })

  it('suggests the near-miss, and not code that only looks like one', async () => {
    expect(await offered('#Getting started\n\ntext')).toHaveLength(1)
    expect(await offered('#include <stdio.h>\n\nint main() {}')).toEqual([])
    expect(await offered('-5 degrees outside\n\ntext')).toEqual([])
  })
})
