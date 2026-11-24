import { expect, test } from '@playwright/test'
import { focused, newDocument, openSample, palette, storedRecent, stubPrint } from './helpers'

test('two tabs on different documents keep both in Recent (the pre-launch blocker)', async ({ context, page }) => {
  await page.goto('/')
  await newDocument(page, '# Doc A\n\nfrom tab A')
  await expect.poll(() => storedRecent(page)).toEqual(['# Doc A'])
  const b = await context.newPage()
  await b.goto('/')
  await b.locator('header button', { hasText: /^New$/ }).click()
  await b.locator('textarea').fill('# Doc B\n\nfrom tab B')
  await expect.poll(() => storedRecent(b)).toEqual(['# Doc B', '# Doc A'])
  await page.locator('textarea').press('End')
  await page.keyboard.type(' more')
  await expect.poll(() => storedRecent(page)).toEqual(['# Doc A', '# Doc B'])
  await b.close()
  await expect.poll(() => storedRecent(page)).toEqual(['# Doc A', '# Doc B'])
})

test('Export: the first ⌘S selects the suggested name; a download keeps typing in the editor', async ({ page }) => {
  await page.goto('/')
  await newDocument(page, '# Meeting Notes\n\ntext')
  await page.keyboard.press('ControlOrMeta+s')
  const name = page.locator('#export-name')
  await expect(name).toHaveValue('meeting-notes.md')
  await expect.poll(() => name.evaluate((i: HTMLInputElement) => [i.selectionStart, i.selectionEnd])).toEqual([0, 'meeting-notes'.length])
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
  expect(download.suggestedFilename()).toBe('meeting-notes.md')
  await expect.poll(() => focused(page)).toBe('editor')
  await page.keyboard.type('!')
  await expect(page.locator('textarea')).toHaveValue(/text!$/)
})

test('closing a menu with Esc gives focus back to the editor', async ({ page }) => {
  await page.goto('/')
  await newDocument(page, 'abc')
  await page.keyboard.press('ControlOrMeta+s')
  await page.keyboard.press('Escape')
  await expect.poll(() => focused(page)).toBe('editor')
  await page.getByRole('button', { name: /Smart Assist/ }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => focused(page)).toBe('editor')
})

test('Recent: 1–9 open a document while the search is empty', async ({ page }) => {
  await page.goto('/')
  for (const n of ['Alpha', 'Bravo', 'Charlie']) await newDocument(page, `# ${n}\n\ntext`)
  await expect.poll(() => storedRecent(page)).toHaveLength(3)
  await page.keyboard.press('ControlOrMeta+Shift+h')
  await page.keyboard.press('2')
  // Opened from Recent → the preview, on desktop
  await expect(page.locator('.markdown-body h1')).toHaveText('Alpha')
  await page.keyboard.press('ControlOrMeta+Shift+h')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.keyboard.type('a1')
  await expect(page.getByRole('searchbox')).toHaveValue('a1')
})

test('Close document goes to the start screen and keeps it in Recent', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Close document' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'The Markdown editor that notices.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'The Markdown editor that notices.' })).toBeVisible()
  await page.getByText('pitwall-README.md').first().click()
  await expect(page.locator('header')).toContainText('pitwall-README.md')
})

test('the sample follows the language while untouched, and keeps your edits', async ({ page }) => {
  await openSample(page)
  await palette(page, 'portug')
  await expect(page.locator('textarea')).toHaveValue(/Tour do Smart Assist/)
  await palette(page, 'english')
  await expect(page.locator('textarea')).toHaveValue(/Smart Assist tour/)
  await page.locator('textarea').press('ControlOrMeta+End')
  await page.keyboard.type('\nmy note')
  await palette(page, 'portug')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR') // the UI switched…
  await expect(page.locator('textarea')).toHaveValue(/Smart Assist tour[\s\S]*my note/) // …the edited sample didn't
})

test('Delete all Marksage data leaves nothing behind', async ({ page }) => {
  await openSample(page)
  await page.goto('/#privacy')
  await page.getByRole('button', { name: 'Delete all Marksage data' }).click()
  await page.getByRole('button', { name: 'Delete everything' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'The Markdown editor that notices.' })).toBeVisible()
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('marksage:')))).toEqual([])
})

test('the Portuguese sample offers exactly what the English one does (Suggestions tab, Outline types)', async ({ page }) => {
  await openSample(page)
  const rows = async (lineWord: RegExp) => {
    const list = page.locator('#panel-suggestions li')
    await expect(list.first()).toBeVisible()
    await expect.poll(() => list.count()).toBeGreaterThan(5)
    return (await list.allInnerTexts()).map((t) => `${t.match(lineWord)?.[1]} ${t.match(/(\d+)%/)?.[1] ?? 'pick'}`)
  }
  const types = async () => page.locator('#panel-outline li').evaluateAll((lis) => lis.map((li) => (li.querySelector('[title]') ? 'typed' : '—')))
  const bar = (name: string) => page.locator('[role="group"]').first().getByRole('button', { name: new RegExp(`^${name}`) })
  await bar('Suggestions').click()
  const en = await rows(/Line (\d+)/)
  await bar('Outline').click()
  const enTypes = await types()
  await palette(page, 'portug')
  await expect(page.locator('textarea')).toHaveValue(/Tour do Smart Assist/)
  await bar('Sugestões').click()
  await expect.poll(() => rows(/Linha (\d+)/)).toEqual(en)
  await bar('Estrutura').click()
  await expect.poll(types).toEqual(enTypes)
  expect(en).toHaveLength(12)
})

test('printing shows the whole rendered document, in the app\'s theme, without the app around it (launch QA D07)', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('marksage:theme', 'dark')
    } catch {}
  })
  await openSample(page)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await page.emulateMedia({ media: 'print' })
  const copy = page.locator('#print-root')
  await expect(copy.getByRole('heading', { level: 1, name: 'Pitwall' })).toBeVisible()
  await expect(copy.getByRole('heading', { name: 'Why is a lap missing?' })).toBeAttached() // the end, not one cut-off page
  await expect(page.locator('#root')).toBeHidden()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/) // a dark theme prints dark
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(13, 17, 23)')
  expect(await page.title()).toBe('pitwall-README')

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await expect(copy).toHaveCount(0)
  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})

test('Export → Save as PDF prints the rendered document under the name in the panel', async ({ page }) => {
  const printed = await stubPrint(page)
  await openSample(page)
  await page.locator('header').getByRole('button', { name: 'Export Markdown' }).click()
  await page.locator('#export-name').fill('race-notes')
  await page.getByRole('button', { name: 'Save as PDF' }).click()
  await expect.poll(printed).toEqual({ title: 'race-notes', rendered: true, source: false, frame: true })
  await expect(page.locator('iframe')).toHaveCount(0) // the print frame is gone after the dialog
  await expect(page.locator('header')).toContainText('race-notes')
})

test('the palette saves as PDF too', async ({ page }) => {
  const printed = await stubPrint(page)
  await openSample(page)
  await palette(page, 'pdf')
  await expect.poll(printed).toEqual({ title: 'pitwall-README', rendered: true, source: false, frame: true })
})

test('⌘/Ctrl + P prints the rendered document from the hidden frame, so the page never switches layout', async ({ page }) => {
  const printed = await stubPrint(page)
  await openSample(page)
  await page.locator('textarea').focus()
  await page.keyboard.press('ControlOrMeta+p')
  await expect.poll(printed).toEqual({ title: 'pitwall-README', rendered: true, source: false, frame: true })
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(await page.title()).not.toBe('pitwall-README')
})

test('the Suggestions count shows on the document bar without opening the Outline', async ({ page }) => {
  await openSample(page)
  const tabs = page.getByRole('group', { name: 'Outline and document insights' }).first()
  await expect(tabs.getByRole('button', { name: 'Outline', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(tabs.getByRole('button', { name: /^Suggestions \d+$/ })).toBeVisible()
})

test('Recent goes back to the current document from About', async ({ page }) => {
  await openSample(page)
  await page.goto('/#about')
  await expect(page.locator('textarea')).toHaveCount(0)
  await page.getByRole('button', { name: 'Recent documents' }).click()
  await page.getByRole('button', { name: /pitwall-README/ }).click()
  await expect(page.locator('textarea')).toBeVisible()
  await expect(page.locator('textarea')).toHaveValue(/^# Pitwall/)
  expect(new URL(page.url()).hash).toBe('')
})

/** Lines of plain text with an untagged code block (one suggestion) at `fenceAt`. */
function documentWithFence(lines: number, fenceAt: number) {
  const out = ['# A long document', '']
  for (let i = out.length; i < lines; i++) {
    if (i === fenceAt) out.push('```', 'const total = items.reduce((sum, x) => sum + x.price, 0)', 'console.log(total)', '```')
    else out.push(`Line ${i} of a long document, long enough to wrap once the editor is narrow.`)
  }
  return out.join('\n')
}

// 250 lines: the split view's panes still grow and shrink with the slide (under 12,000 characters); 700: they don't.
for (const lines of [250, 700]) {
  test(`a suggestion picked in the Suggestions tab opens the editor on its line (${lines} lines, from the preview)`, async ({ page }) => {
    await page.goto('/')
    await newDocument(page, documentWithFence(lines, lines - 60))
    await page.locator('header').getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.locator('textarea')).toHaveCount(0)
    await page.getByRole('group', { name: 'Outline and document insights' }).first().getByRole('button', { name: /^Suggestions/ }).click()
    await page.getByRole('tabpanel').getByRole('button', { name: /Code block without a language/ }).click()
    const editor = page.locator('textarea')
    await expect(editor).toBeFocused()
    // The caret is on the fence, and that line is on screen (it used to land near the end: measured mid-slide).
    const fenceLine = lines - 60 + 1
    await expect.poll(() => editor.evaluate((ta: HTMLTextAreaElement) => ta.value.slice(0, ta.selectionStart).split('\n').length)).toBe(fenceLine)
    await expect
      .poll(
        () =>
          page.evaluate((n) => {
            const ta = document.querySelector('textarea')!
            const row = document.querySelector<HTMLElement>(`.line-mirror > div[data-n="${n}"]`)
            if (!row) return null
            const y = row.offsetTop - ta.scrollTop
            return y >= 0 && y < ta.clientHeight - 28
          }, fenceLine),
        { timeout: 5_000 },
      )
      .toBe(true)
  })
}

test('a mermaid block draws its diagram, its code a click away; one with a mistake shows the code and why', async ({ page }) => {
  await page.goto('/')
  await newDocument(
    page,
    ['# Diagrams', '', '```mermaid', 'flowchart LR', '  A[Write] --> B[Preview]', '```', '', '```mermaid', 'flowchart LR', '  A --> B -->', '```', ''].join('\n'),
  )
  const [good, bad] = [page.locator('.mermaid-block').nth(0), page.locator('.mermaid-block').nth(1)]
  await expect(good.getByRole('img', { name: 'Mermaid diagram (flowchart)' }).locator('svg')).toBeVisible({ timeout: 30_000 })
  await expect(good.getByRole('img')).toContainText('Preview')
  await good.getByRole('button', { name: 'Code', exact: true }).click()
  await expect(good.locator('pre')).toContainText('A[Write] --> B[Preview]')
  await expect(good.getByRole('img')).toBeHidden()
  await good.getByRole('button', { name: 'Diagram', exact: true }).click()
  await expect(good.getByRole('img')).toBeVisible()

  await expect(bad.getByRole('note')).toContainText('Mermaid couldn’t draw this diagram — Parse error on line 3')
  await expect(bad.locator('pre')).toContainText('A --> B -->')
  // Fixed in the editor, it draws once the text rests.
  await page.locator('textarea').evaluate((ta: HTMLTextAreaElement) => {
    const at = ta.value.indexOf('B -->') + 5
    ta.focus()
    ta.setSelectionRange(at, at)
  })
  await page.keyboard.type(' C')
  await expect(bad.getByRole('img', { name: 'Mermaid diagram (flowchart)' })).toBeVisible({ timeout: 10_000 })
  await expect(bad.getByRole('note')).toHaveCount(0)
})

test('a diagram just below the screen is drawn before it’s scrolled to, then shows at once when the preview mounts again', async ({ page }) => {
  await page.goto('/')
  // Short one-line paragraphs (~44 px each) for about 1.25 screens: below the fold, within the 600 px margin.
  const count = Math.ceil(((page.viewportSize()?.height ?? 720) * 1.25) / 44)
  const filler = Array.from({ length: count }, (_, i) => `Paragraph ${i + 1}.\n`)
  await newDocument(page, ['# Below the fold', '', ...filler, '```mermaid', 'flowchart LR', '  A --> B', '```', ''].join('\n'))
  await page.locator('header').getByRole('button', { name: 'Preview', exact: true }).click()
  const block = page.locator('.mermaid-block')
  // Not on screen, but within 600 px of it: drawn already (the margin used to never apply — drawn only once visible).
  await expect(block.locator('.doc-diagram-mermaid svg')).toHaveCount(1, { timeout: 30_000 })
  expect(await block.evaluate((el) => el.getBoundingClientRect().top > window.innerHeight)).toBe(true)
  // Opening the editor mounts the preview again: the drawing comes back without a loading box in between.
  await page.locator('header').getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('textarea')).toBeVisible()
  expect(await page.locator('.mermaid-skeleton').count()).toBe(0)
  await expect(block.locator('.doc-diagram-mermaid svg')).toHaveCount(1)
})
