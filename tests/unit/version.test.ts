import { describe, expect, it } from 'vitest'
import { bumpOf } from '../../scripts/version'

describe('versions from the history', () => {
  it('feat → minor, fix / perf → patch, the rest unchanged', () => {
    expect(bumpOf('feat(palette): ⌘K')).toBe('minor')
    expect(bumpOf('fix(theme): no flash')).toBe('patch')
    expect(bumpOf('perf(editor): smooth')).toBe('patch')
    expect(bumpOf('feat!: breaking')).toBe('minor')
    for (const s of ['docs(story): x', 'chore: y', 'refactor(i18n): z', 'ci: w', 'Merge branch main']) expect(bumpOf(s)).toBeNull()
  })
})
