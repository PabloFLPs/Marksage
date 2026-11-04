import { expect, test } from '@playwright/test'
import { openSample } from './helpers'

test('the start screen says what Marksage is and leads to the sample and the story', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'The Markdown editor that notices.' })).toBeVisible()
  await expect(page.locator('main img').first()).toBeVisible() // the logo
  await page.getByRole('button', { name: /The story/ }).click()
  await expect(page).toHaveURL(/#story$/)
  await expect(page).toHaveTitle('The story — Marksage')
  await page.goBack()
  await expect(page.getByRole('heading', { level: 1, name: 'The Markdown editor that notices.' })).toBeVisible()
})

test('the sample shows Smart Assist in Rules mode: suggestions, Tab accepts, nothing auto-applies', async ({ page }) => {
  await openSample(page)
  const bar = page.getByText(/Add language “bash” to code block/)
  await expect(bar).toBeVisible()
  const before = await page.locator('textarea').inputValue()
  expect(before).not.toContain('```bash')
  await page.locator('textarea').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('textarea')).toHaveValue(/```bash/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('textarea')).toHaveValue(before)
})

test('the Suggestions tab lists every fix in the sample', async ({ page }) => {
  await openSample(page)
  await page.getByRole('group', { name: 'Outline and document insights' }).getByRole('button', { name: /^Suggestions/ }).click()
  await expect(page.getByRole('tab', { name: /Suggestions/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel')).toContainText('Add language “json” to code block')
  await expect(page.getByRole('tabpanel')).toContainText('Fix this link?')
})

test('first load: only a stored document makes index.html ask for the document view', async ({ page }) => {
  // The main script blocked: whatever asks for the document view then is index.html's own script.
  const asked = async () => {
    const urls: string[] = []
    const onRequest = (r: { url: () => string }) => urls.push(r.url())
    page.on('request', onRequest)
    await page.reload({ waitUntil: 'load' })
    page.off('request', onRequest)
    return urls.some((u) => u.includes('DocumentView'))
  }
  await page.goto('/')
  await page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.abort())
  expect(await asked()).toBe(false)
  await page.evaluate(() => localStorage.setItem('marksage:doc', JSON.stringify({ id: 'd1', filename: 'kept.md', content: '# Kept' })))
  expect(await asked()).toBe(true)

  // And with the app running, it opens on the stored document; with nothing stored, the start screen prefetches the
  // view after its first paint (for the next click).
  await page.unroute(/\/assets\/index-[^/]+\.js$/)
  await page.reload()
  await expect(page.locator('.markdown-body h1')).toHaveText('Kept')
  await page.evaluate(() => localStorage.clear())
  const later: string[] = []
  page.on('request', (r) => later.push(r.url()))
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'The Markdown editor that notices.' })).toBeVisible()
  await expect.poll(() => later.some((u) => u.includes('DocumentView'))).toBe(true)
})
