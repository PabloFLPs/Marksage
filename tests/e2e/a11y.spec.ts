import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openSample } from './helpers'

/** WCAG 2.1 A + AA rules; the report lists what fails, with the elements. */
async function scan(page: Page, what: string) {
  // Entrance animations fade text in: measured mid-fade its contrast is lower than it ends up.
  // (Only time-based ones that end: not the blinking/looping ones, nor the scroll-driven line-number gutter.)
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || !(a.timeline instanceof DocumentTimeline) || a.effect?.getTiming().iterations === Infinity),
  )
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const report = violations.map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(report, `${what}: accessibility violations`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ context }) => {
      if (theme === 'dark') await context.addInitScript(() => localStorage.setItem('marksage:theme', 'dark'))
    })

    test('start screen', async ({ page }) => {
      await page.goto('/')
      await scan(page, 'start screen')
    })

    test('the sample in the editor, with the Outline open', async ({ page }) => {
      await openSample(page)
      await page.getByRole('group', { name: 'Outline and document insights' }).getByRole('button', { name: 'Outline', exact: true }).click()
      await scan(page, 'editor + Outline')
    })

    for (const hash of ['#about', '#smart-assist', '#models', '#story']) {
      test(`page ${hash}`, async ({ page }) => {
        await page.goto('/' + hash)
        await page.waitForLoadState('networkidle')
        await scan(page, hash)
      })
    }

    test('command palette', async ({ page }) => {
      await page.goto('/')
      await page.keyboard.press('ControlOrMeta+k')
      await expect(page.getByRole('combobox')).toBeFocused()
      await scan(page, 'palette')
    })
  })
}

// The other accent palettes (each app icon re-themes the accent, index.css): the screens with the most accent text.
for (const icon of ['mono', 'outline', 'sunset'] as const)
  for (const theme of ['light', 'dark'] as const)
    test.describe(`${icon} palette, ${theme}`, () => {
      test.beforeEach(async ({ context }) => {
        await context.addInitScript(
          ([i, t]) => {
            localStorage.setItem('marksage:app-icon', i)
            if (t === 'dark') localStorage.setItem('marksage:theme', 'dark')
          },
          [icon, theme],
        )
      })

      test('the sample with the Outline open', async ({ page }) => {
        await openSample(page)
        await page.getByRole('group', { name: 'Outline and document insights' }).getByRole('button', { name: 'Outline', exact: true }).click()
        await scan(page, `${icon} ${theme}: editor + Outline`)
      })

      test('About', async ({ page }) => {
        await page.goto('/#about')
        await page.waitForLoadState('networkidle')
        await scan(page, `${icon} ${theme}: About`)
      })
    })
