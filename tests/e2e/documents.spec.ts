import { expect, test } from '@playwright/test'
import { focused, newDocument, openSample, palette, storedRecent } from './helpers'

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

test('printing shows the whole rendered document, light, without the app around it (launch QA D07)', async ({ page }) => {
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
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  expect(await page.title()).toBe('pitwall-README')

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await expect(copy).toHaveCount(0)
  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})
