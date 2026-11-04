import { expect, type Page } from '@playwright/test'

/** The start screen's sample document, opened in the editor (Rules mode, a first visit). */
export async function openSample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try it on a sample document' }).click()
  await expect(page.locator('textarea')).toHaveValue(/# Pitwall/)
}

/** A new document with this text, through the header's New. */
export async function newDocument(page: Page, text: string) {
  const startWriting = page.getByRole('button', { name: 'Start writing' })
  if (await startWriting.isVisible()) await startWriting.click()
  else await page.locator('header button', { hasText: /^New$/ }).click()
  const editor = page.locator('textarea')
  await editor.fill(text)
  // fill() sends several input events for one insert (a real paste sends one); about one run in ten React put the
  // value back once more in between and the caret landed inside the text. The caret goes to the end, as after typing.
  await expect
    .poll(() => editor.evaluate((ta: HTMLTextAreaElement) => (ta.setSelectionRange(ta.value.length, ta.value.length), ta.selectionStart === ta.value.length)))
    .toBe(true)
}

/** Runs a command palette entry, found by typing `query`. */
export async function palette(page: Page, query: string) {
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByRole('combobox').fill(query)
  await page.keyboard.press('Enter')
}

/** What has focus: "editor" for the textarea, else the element's accessible name. */
export const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null
    return a?.tagName === 'TEXTAREA' ? 'editor' : (a?.getAttribute('aria-label') ?? a?.tagName ?? '')
  })

/** Recent, as stored: each entry's first line. */
export const storedRecent = (page: Page) =>
  page.evaluate(() => (JSON.parse(localStorage.getItem('marksage:history') ?? '[]') as { content: string }[]).map((e) => e.content.split('\n')[0]))

/** Horizontal overflow of the page, in px (0 = none). */
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
