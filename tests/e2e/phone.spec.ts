import { expect, test } from '@playwright/test'
import { overflow, stubPrint } from './helpers'

for (const [width, lang] of [[320, 'en'], [390, 'en'], [320, 'pt-BR'], [390, 'pt-BR']] as const) {
  test(`no sideways scrolling at ${width} px on any page (${lang})`, async ({ page }) => {
    // Portuguese labels run longer: the same pages in both languages.
    if (lang !== 'en') await page.addInitScript((l) => localStorage.setItem('marksage:lang', l), lang)
    await page.setViewportSize({ width, height: 800 })
    for (const hash of ['', '#about', '#smart-assist', '#models', '#story']) {
      await page.goto('/' + hash)
      await page.waitForLoadState('networkidle')
      expect(await overflow(page), `overflow on "${hash || 'start'}" at ${width}px (${lang})`).toBe(0)
    }
  })
}

test('the phone menu closes the document', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try it on a sample document' }).click()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Close document' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('Save as PDF while editing on a phone prints the rendered document, not its source', async ({ page }) => {
  const printed = await stubPrint(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Try it on a sample document' }).click()
  await expect(page.locator('textarea')).toBeVisible()
  await page.getByRole('button', { name: 'Export Markdown' }).click()
  await page.getByRole('button', { name: 'Save as PDF' }).click()
  await expect.poll(printed).toEqual({ title: 'pitwall-README', rendered: true, source: false })
})
