import { expect, test } from '@playwright/test'
import { overflow } from './helpers'

for (const width of [320, 390]) {
  test(`no sideways scrolling at ${width} px on any page`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    for (const hash of ['', '#about', '#smart-assist', '#models', '#story']) {
      await page.goto('/' + hash)
      await page.waitForLoadState('networkidle')
      expect(await overflow(page), `overflow on "${hash || 'start'}" at ${width}px`).toBe(0)
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
