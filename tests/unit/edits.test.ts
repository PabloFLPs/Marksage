import { describe, expect, it } from 'vitest'
import { bulletList, codeBlock, headingDown, headingUp, linesToTable, numberedList, quote, removeInlineFormatting, taskList, touchedLines, type EditTransform } from '../../src/commands/edits'

/** `«` and `»` mark the selection (one `|` = the caret); returns the text after the edit, or null. */
function run(edit: EditTransform, marked: string): string | null {
  const caret = marked.indexOf('|')
  const start = caret >= 0 ? caret : marked.indexOf('«')
  const text = caret >= 0 ? marked.replace('|', '') : marked.replace('«', '').replace('»', '')
  const end = caret >= 0 ? caret : marked.indexOf('»') - 1
  const result = edit({ text, start, end })
  return result && text.slice(0, result.from) + result.insert + text.slice(result.to)
}

describe('touchedLines', () => {
  it('a selection ending at the start of a line leaves that line out', () => {
    const text = 'a\nb\nc'
    expect(touchedLines(text, 0, 2)).toEqual({ from: 0, to: 1 })
    expect(touchedLines(text, 2, 2)).toEqual({ from: 2, to: 3 })
  })
})

describe('lists', () => {
  it('bullets every touched line, keeping blanks and indentation, and toggles back', () => {
    expect(run(bulletList, '«milk\n\n  eggs»\nrest')).toBe('- milk\n\n  - eggs\nrest')
    expect(run(bulletList, '«- milk\n- eggs»')).toBe('milk\neggs')
  })
  it('the caret line alone when nothing is selected', () => {
    expect(run(bulletList, 'one\ntw|o\nthree')).toBe('one\n- two\nthree')
  })
  it('numbered and task lists replace other markers', () => {
    expect(run(numberedList, '«- a\n- b\n- c»')).toBe('1. a\n2. b\n3. c')
    expect(run(numberedList, '«1. a\n2. b»')).toBe('a\nb')
    expect(run(taskList, '«1. a\n* b»')).toBe('- [ ] a\n- [ ] b')
    expect(run(bulletList, '«- [ ] a»')).toBe('- a')
  })
})

describe('a marker missing its space', () => {
  it('becomes a proper one: "-item" is a list item someone typed without the space', () => {
    expect(run(bulletList, '-i|tem')).toBe('- item')
    expect(run(bulletList, '«-milk\n*eggs\n+bread»')).toBe('- milk\n- eggs\n- bread')
    expect(run(numberedList, '«-milk\n-eggs»')).toBe('1. milk\n2. eggs')
    expect(run(taskList, '-mi|lk')).toBe('- [ ] milk')
  })
  it('what only looks like one stays text: negative numbers, flags, emphasis, bold, ls -l, CSS', () => {
    expect(run(bulletList, '-5 gr|aus')).toBe('- -5 graus')
    expect(run(bulletList, '-v, --ver|bose')).toBe('- -v, --verbose')
    expect(run(bulletList, '--fl|ag')).toBe('- --flag')
    expect(run(bulletList, '*empha|sis*')).toBe('- *emphasis*')
    expect(run(bulletList, '**bo|ld**')).toBe('- **bold**')
    expect(run(bulletList, '-rw-r--r-- 1 ana staff 2048 no|tes.md')).toBe('- -rw-r--r-- 1 ana staff 2048 notes.md')
    expect(run(bulletList, '-webkit-line-clamp: 2|;')).toBe('- -webkit-line-clamp: 2;')
  })
})

describe('headings', () => {
  it('one level up or down; a plain line becomes ##; the ends stay', () => {
    expect(run(headingUp, '## Inst|all')).toBe('# Install')
    expect(run(headingDown, '## Inst|all')).toBe('### Install')
    expect(run(headingUp, 'Inst|all')).toBe('## Install')
    expect(run(headingUp, '# T|op')).toBeNull()
    expect(run(headingDown, '###### D|eep')).toBeNull()
  })
})

describe('quote', () => {
  it('quotes the lines (a blank line stays inside the quote) and toggles back', () => {
    expect(run(quote, '«a\n\nb»')).toBe('> a\n>\n> b')
    expect(run(quote, '«> a\n>\n> b»')).toBe('a\n\nb')
  })
})

describe('needs a selection', () => {
  it('lines to a table: tabs, aligned columns, commas', () => {
    expect(run(linesToTable, '«name\tqty\nmilk\t2»')).toBe('| name | qty |\n| --- | --- |\n| milk | 2 |')
    expect(run(linesToTable, '«name,qty\nmilk,2»')).toBe('| name | qty |\n| --- | --- |\n| milk | 2 |')
    expect(run(linesToTable, '«name   qty   price\nmilk   2     3.50\neggs   12    4.00»')).toBe('| name | qty | price |\n| --- | --- | --- |\n| milk | 2 | 3.50 |\n| eggs | 12 | 4.00 |')
    expect(run(linesToTable, '«just one line»')).toBeNull()
    expect(run(linesToTable, 'na|me,qty\nmilk,2')).toBeNull()
  })
  it('a code block around the touched lines, no language', () => {
    expect(run(codeBlock, 'before\n«npm i\nnpm test»\nafter')).toBe('before\n```\nnpm i\nnpm test\n```\nafter')
    expect(run(codeBlock, 'np|m i')).toBeNull()
  })
  it('remove inline formatting keeps the words', () => {
    expect(run(removeInlineFormatting, '«**bold**, _it_, *em*, ~~old~~, `code`, [link](https://x.y), ![alt](i.png)»')).toBe('bold, it, em, old, code, link, alt')
    expect(run(removeInlineFormatting, '«snake_case_name and 2*3*4»')).toBeNull()
  })
})
