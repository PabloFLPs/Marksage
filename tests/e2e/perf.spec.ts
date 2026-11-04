import { expect, test, type Page } from '@playwright/test'
import { newDocument } from './helpers'

/** Per-key budget, ms. Before the long-document fixes a key cost 378–587 ms here; after, ~80 (2 vCPUs, Rules mode). */
const BUDGET = { median: 150, max: 500 }

/**
 * Typing on a long document: the 400-section, ~250 KB file of IMPLEMENTATION-CONTEXT §36/§40 (its real causes of
 * lag: the whole preview re-parsed per key, the caret line read per newline). Each key's time is the browser's own
 * (Event Timing: from the key press to the next frame painted after it), so the test's round-trips don't count.
 */
function longDocument(sections = 400) {
  const parts = ['# Long document', '']
  for (let i = 1; i <= sections; i++) {
    parts.push(
      `## Section ${i}`,
      '',
      `This section ${i} explains one part of the tool, with **bold**, *italic*, \`inline code\` and a [link](https://example.com/${i}). `.repeat(3),
      '',
      `- First point of section ${i}`,
      `- Second point, a little longer so it wraps on a narrow editor at ${i}`,
      `- [ ] A task left open`,
      '',
      '```ts',
      `export function section${i}(x: number): number {`,
      `  return x * ${i} + 1`,
      '}',
      '```',
      '',
      `| Column | Value |`,
      `|---|---|`,
      `| ${i} | ${i * 2} |`,
      '',
    )
  }
  return parts.join('\n')
}

/** Types `keys` one at a time at the caret; the slowest and the median key, in ms. */
async function typeAndTime(page: Page, keys: string) {
  await page.evaluate(() => {
    const w = window as unknown as { __keys: number[]; __obs?: PerformanceObserver }
    w.__obs?.disconnect()
    w.__keys = []
    w.__obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'keydown') w.__keys.push(e.duration)
    })
    w.__obs.observe({ type: 'event', durationThreshold: 0 } as PerformanceObserverInit)
  })
  for (const k of keys) {
    await page.keyboard.press(k === ' ' ? 'Space' : k)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))))
  }
  await page.waitForTimeout(500) // the last entries arrive after their frame
  const times = await page.evaluate(() => (window as unknown as { __keys: number[] }).__keys)
  const sorted = [...times].sort((a, b) => a - b)
  return { n: times.length, median: sorted[Math.floor(sorted.length / 2)] ?? 0, max: sorted.at(-1) ?? 0 }
}

test('typing on a 400-section document stays quick', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Event Timing: Chromium only')
  test.setTimeout(90_000)
  const text = longDocument()
  await page.goto('/')
  await newDocument(page, '')
  const editor = page.locator('textarea')
  // One input event, like a paste (Playwright's fill() takes over a minute on 250 KB).
  await editor.evaluate((ta: HTMLTextAreaElement, value) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, value)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
  await expect(page.locator('.markdown-body h2')).toHaveCount(400, { timeout: 30_000 })

  await editor.evaluate((ta: HTMLTextAreaElement) => ta.setSelectionRange(ta.value.length, ta.value.length))
  const end = await typeAndTime(page, 'end typing ok')
  await editor.evaluate((ta: HTMLTextAreaElement) => ta.setSelectionRange(20, 20))
  const start = await typeAndTime(page, 'start typing ok')
  console.log(`${(text.length / 1024).toFixed(0)} KB — end: median ${end.median} ms, max ${end.max} ms (${end.n} keys); start: median ${start.median} ms, max ${start.max} ms (${start.n} keys)`)
  for (const [where, r] of [['end', end], ['start', start]] as const) {
    expect(r.n, `${where}: keys measured`).toBeGreaterThan(8)
    expect(r.median, `${where}: median ms per key`).toBeLessThanOrEqual(BUDGET.median)
    expect(r.max, `${where}: slowest key, ms`).toBeLessThanOrEqual(BUDGET.max)
  }
})
