import { expect, test } from '@playwright/test'
import { focused, newDocument, openSample, palette } from './helpers'

test('the command palette runs commands and hands focus back', async ({ page }) => {
  await openSample(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox').fill('exp')
  await expect(page.getByRole('option')).toHaveText([/Export Markdown/, /Save as PDF/])
  await page.keyboard.press('Enter')
  await expect(page.locator('#export-name')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => focused(page)).toBe('editor')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect.poll(() => focused(page)).toBe('editor')
})

test('Rules + AI from the palette never skips the download notice', async ({ page }) => {
  await openSample(page)
  await palette(page, 'rules ai')
  await expect(page.getByText('Download Marksage’s models?')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('marksage:assist'))).not.toBe('model')
})

test('the document bar: one icon per tab, a second click closes; the header Outline steps aside at the top', async ({ page }) => {
  await openSample(page)
  const bar = page.getByRole('group', { name: 'Outline and document insights' })
  const headerOutline = page.locator('header button[title="Outline and document insights"]')
  await expect(headerOutline).toHaveCount(0)
  await bar.getByRole('button', { name: 'Outline', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^Outline/ })).toHaveAttribute('aria-selected', 'true')
  await bar.getByRole('button', { name: 'Outline', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await page.locator('[data-split-pane]').evaluate((el) => (el.scrollTop = 1500))
  await expect(headerOutline).toHaveCount(1)
})

test('a first visit is light whatever the system says; a chosen dark theme is dark before the app runs', async ({ browser }) => {
  const light = await browser.newContext({ colorScheme: 'dark' })
  const p = await light.newPage()
  await p.goto('/')
  await expect(p.locator('html')).not.toHaveClass(/dark/)
  await expect(p.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#ffffff')
  await light.close()
  const dark = await browser.newContext()
  await dark.addInitScript(() => localStorage.setItem('marksage:theme', 'dark'))
  const q = await dark.newPage()
  await q.route(/\/assets\/index-.*\.js$/, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue() })
  await q.goto('/', { waitUntil: 'commit' })
  await expect(q.locator('html')).toHaveClass(/dark/)
  await expect(q.locator('html')).toHaveCSS('background-color', 'rgb(13, 17, 23)')
  await dark.close()
})

test('docs pages: Back names its target and matches the browser; a direct link goes to the parent', async ({ page }) => {
  await page.goto('/#about')
  await page.getByRole('button', { name: /How Smart Assist works/ }).click()
  await expect(page).toHaveURL(/#smart-assist$/)
  await page.getByRole('button', { name: 'About' }).first().click()
  await expect(page).toHaveURL(/#about$/)
  await page.goto('/#models')
  await expect(page).toHaveTitle('How the models work — Marksage')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/#about$/)
})

test('Document tab: a section-type chip goes to its section', async ({ page }) => {
  await openSample(page)
  await page.getByRole('group', { name: 'Outline and document insights' }).getByRole('button', { name: 'Document', exact: true }).click()
  const faq = page.locator('.markdown-body h2', { hasText: 'FAQ' })
  await expect(faq).not.toBeInViewport()
  await page.getByRole('tabpanel').getByRole('button', { name: /^Troubleshooting 1/ }).click()
  await expect(faq).toBeInViewport()
})

test('Document tab: "+N more" shows the rest of a flag group, "Show fewer" hides it', async ({ page }) => {
  await page.goto('/')
  await newDocument(page, '# Code\n\n' + '```\nx = 1\n```\n\n'.repeat(8))
  await page.getByRole('group', { name: 'Outline and document insights' }).getByRole('button', { name: 'Document', exact: true }).click()
  const panel = page.getByRole('tabpanel')
  const lines = panel.getByRole('button', { name: /^Line \d+$/ })
  await expect(lines).toHaveCount(6)
  await panel.getByRole('button', { name: '+2 more' }).click()
  await expect(lines).toHaveCount(8)
  await panel.getByRole('button', { name: 'Show fewer' }).click()
  await expect(lines).toHaveCount(6)
})

test('About: "Try it on a sample document" in Reading & writing opens the sample', async ({ page }) => {
  await page.goto('/#about')
  const feature = page.locator('section', { hasText: 'Open anything Markdown' })
  await feature.getByRole('button', { name: 'Try it on a sample document' }).click()
  await expect(page.locator('header')).toContainText('pitwall-README.md')
})

test('About: the Smart Assist intro links to the sample; no big button competes with the start screen', async ({ page }) => {
  await page.goto('/#about')
  const smartAssist = page.locator('section', { hasText: 'local · on by default' })
  await expect(smartAssist.getByRole('button', { name: 'Try it on a sample document' })).toHaveCount(1)
  await smartAssist.getByRole('button', { name: 'Try it on a sample document' }).click()
  await expect(page.locator('header')).toContainText('pitwall-README.md')
})
