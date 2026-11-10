import { expect, test, type Page } from '@playwright/test'
import { openSample, palette } from './helpers'

/**
 * The built page runs under a Content-Security-Policy (a <meta> from vite.config.ts, plus vercel.json's headers,
 * which `vite preview` sends too). Every flow that loads or runs something — the start screen, the sample, the model
 * download, the Outline, the docs pages with a Mermaid diagram, the story, About, Export, printing — must not trip it
 * (launch QA D17). A violation fires `securitypolicyviolation` on the document, collected here.
 */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = []
    ;(window as unknown as { __csp: string[] }).__csp = seen
    document.addEventListener('securitypolicyviolation', (e) => seen.push(`${e.violatedDirective} ← ${e.blockedURI || 'inline'}`))
  })
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
}

test('the page carries the CSP and the security headers', async ({ page }) => {
  const response = await page.goto('/')
  const headers = response!.headers()
  expect(headers['content-security-policy']).toBe("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-frame-options']).toBe('DENY')
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(meta).toContain("default-src 'self'")
  expect(meta).toMatch(/script-src 'self'( 'sha256-[^']+'){3}/)
})

test('no flow trips the Content-Security-Policy', async ({ page }) => {
  test.setTimeout(90_000)
  const violations = await watchViolations(page)
  await openSample(page)
  await page.getByRole('group', { name: 'Outline and document insights' }).getByRole('button', { name: 'Outline', exact: true }).click()

  await palette(page, 'rules ai')
  await page.getByRole('button', { name: 'Download and turn on' }).click()
  await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 30_000 }).toContain('marksage-models-v1')

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))

  await page.goto('/#smart-assist')
  await page.getByRole('group', { name: 'Diagram style' }).first().getByRole('button', { name: 'Mermaid' }).click()
  await expect(page.locator('.doc-diagram-mermaid svg').first()).toBeVisible({ timeout: 30_000 })
  for (const hash of ['#models', '#story', '#about']) {
    await page.goto('/' + hash)
    await page.waitForLoadState('networkidle')
  }
  expect(await violations()).toEqual([])
})
