/**
 * Bundle-size budget: what the first visit downloads before the app can paint — the scripts and styles
 * `dist/index.html` names (entry + modulepreloads + CSS), gzipped as a server would. Everything else (docs pages,
 * Mermaid, highlighting, the models) is lazy and not counted.
 *
 * Why gzip level 9 (measured 2026-11-12): Vercel serves Brotli, but compresses on the fly at a low quality — the
 * live entry (3.49.1) came at 103,625 bytes, what Brotli gives at quality 3 (103,654), not at 11 (85,826). gzip 9
 * lands within 1% of that (102,880), so the budget tracks what visitors download; Brotli 11 would read 17% low.
 * Deltas can mislead, though: a small change that makes the minifier rename short variables across the entry
 * compresses worse in gzip's 32 KB window. 3.49.1 added 1.4 KB raw and showed +2.9 KB here, while the live
 * download grew ~0.3 KB (Brotli 3: 103,339 → 103,654). When a small commit jumps, compare at Brotli 3 before
 * calling it weight (`zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 3 } })`).
 *
 *   npm run build && npm run size          # prints the sizes; fails when a budget is passed
 *
 * A budget is a tripwire, not a goal: raise it in the commit that needs more, with the reason in the message.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = { js: 110, css: 16 } // first-load JS / CSS, KB (1024 B) gzip — 2026-11-04: 96.8 / 12.5 (was 181.6 JS before the document view got its own chunk)

const dist = join(import.meta.dirname, '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(js|css))"/g)].map((m) => ({ path: m[1], kind: m[2] as 'js' | 'css' }))
if (!files.some((f) => f.kind === 'js')) throw new Error('size: no script in dist/index.html — run `npm run build` first')

const kb = (n: number) => n / 1024
const total = { js: 0, css: 0 }
for (const f of files) {
  const gz = gzipSync(readFileSync(join(dist, f.path)), { level: 9 }).length
  total[f.kind] += gz
  console.log(`${kb(gz).toFixed(1).padStart(7)} KB  ${f.path}`)
}
let failed = false
for (const kind of ['js', 'css'] as const) {
  const over = kb(total[kind]) > BUDGET_KB[kind]
  failed ||= over
  console.log(`${over ? '✗' : '✓'} first-load ${kind.toUpperCase()}: ${kb(total[kind]).toFixed(1)} KB gzip (budget ${BUDGET_KB[kind]} KB)`)
}
if (failed) process.exit(1)
