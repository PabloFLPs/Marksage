import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Link previews need absolute URLs (WhatsApp/Slack ignore relative og:image).
  // Set VITE_SITE_URL (e.g. https://marksage.app) in .env or your host's env vars. On Vercel it isn't needed: the
  // project's production domain (VERCEL_PROJECT_PRODUCTION_URL, set on every build, previews included) is used.
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const siteUrl = (loadEnv(mode, process.cwd(), '').VITE_SITE_URL || (vercelProd ? `https://${vercelProd}` : '')).replace(/\/+$/, '')
  // Without it, og:image / og:url stay relative. The Open Graph spec asks for absolute URLs; some apps resolve
  // relative ones anyway (WhatsApp does — Pablo checked, 2026-11-01), stricter crawlers may not: say so at build.
  if (mode === 'production' && !siteUrl)
    console.warn('\n⚠ VITE_SITE_URL is not set — link previews (og:image, og:url) will be relative. See .env.example.\n')
  // AGPL: About links the exact source of the build people are using (the commit), and the site serves the
  // license text itself at /LICENSE.txt (development check #28).
  let commit = ''
  try {
    commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    // A build from uncommitted changes would link a commit that isn't what's deployed: say so (not an error), with
    // the files. Not on Vercel: a build from git there is exactly the pushed commit — what changes during it is the
    // build environment's own doing (it warned on every deploy, 2026-11-04) — and a `vercel deploy` from a laptop
    // uploads no .git, so it never gets here.
    // Each line is "XY path" — two status columns, a space — so no trim() before the split (it ate the first one's).
    const files = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean).map((l) => l.slice(3))
    if (mode === 'production' && files.length && !process.env.VERCEL) {
      const list = files.slice(0, 5).join(', ') + (files.length > 5 ? ` (+${files.length - 5} more)` : '')
      console.warn(`\n⚠ Uncommitted changes (${list}): About will link commit ${commit.slice(0, 7)}, which is not exactly this build.\n`)
    }
  } catch {
    // Not a git checkout (many hosts build from a copy without .git): their own commit variable, else About
    // links the repository (pre-launch review).
    const env = process.env
    commit = (env.VERCEL_GIT_COMMIT_SHA || env.CF_PAGES_COMMIT_SHA || env.COMMIT_REF || env.RENDER_GIT_COMMIT || env.GITHUB_SHA || '').trim()
  }
  return {
    build: {
      // Over Vite's 500 kB default: Mermaid's chunks (elk ~1.46 MB), fetched only on a docs diagram's Mermaid
      // switch. (The main script is ~330 kB since the document view got its own chunk; `npm run size` guards it.)
      // The note said nothing new on every build, so it's raised past them.
      chunkSizeWarningLimit: 1500,
    },
    define: {
      'import.meta.env.VITE_SOURCE_COMMIT': JSON.stringify(commit),
      // Shown in About next to the commit; package.json's version is checked against the git history
      // (scripts/version.ts --check).
      'import.meta.env.VITE_APP_VERSION': JSON.stringify((JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        // The document view is its own chunk (App.tsx, first load). A visitor with a stored document needs it at
        // once: this inline script asks for it (and its own chunks) in parallel with the main script, instead of
        // after it has run. With nothing stored, nothing is fetched here — App prefetches it after the first paint.
        name: 'marksage-document-preload',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(html, ctx) {
            const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk')
            const view = chunks.find((c) => c.facadeModuleId?.endsWith('/src/components/DocumentView.tsx'))
            if (!view) throw new Error('marksage-document-preload: no DocumentView chunk — was it renamed?')
            const entry = new Set(chunks.filter((c) => c.isEntry).flatMap((c) => [c.fileName, ...c.imports]))
            const files: string[] = []
            const add = (name: string) => {
              if (entry.has(name) || files.includes(name)) return
              files.push(name)
              for (const dep of chunks.find((c) => c.fileName === name)?.imports ?? []) add(dep)
            }
            add(view.fileName)
            const script = `<script>try{var d=JSON.parse(localStorage.getItem('marksage:doc')||'null');if(d&&(d.content||d.filename))${JSON.stringify(files.map((f) => '/' + f))}.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})}catch(e){}</script>`
            // Before the stylesheet: an inline script after one waits for it to load (it cost ~2.5 s on slow 3G).
            const at = html.indexOf('<link rel="stylesheet"')
            if (at < 0) throw new Error('marksage-document-preload: no stylesheet link in index.html')
            return `${html.slice(0, at)}${script}\n    ${html.slice(at)}`
          },
        },
      },
      {
        name: 'marksage-site-url',
        transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
        // Said again as the build's last line: the first warning scrolls away under the bundle list, and a deploy
        // without it shows link previews with no image (pre-launch review).
        closeBundle: () => {
          if (mode === 'production' && !siteUrl)
            console.warn('\n⚠ Built WITHOUT VITE_SITE_URL: og:image and og:url are relative. Open Graph asks for absolute URLs, so\n  some link previews may show no image. Set it (see .env.example) or build on Vercel, where it is automatic.\n')
        },
      },
      {
        // The license as plain text — verbatim, readable without the app — in the build and in `npm run dev` (where
        // it used to fall through to the app: About's "here" opened Marksage at /LICENSE.txt).
        name: 'marksage-license',
        configureServer(server) {
          server.middlewares.use('/LICENSE.txt', (_req, res) => {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(readFileSync('LICENSE', 'utf8'))
          })
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'LICENSE.txt', source: readFileSync('LICENSE', 'utf8') })
        },
      },
      {
        // The Content-Security-Policy of the built page (launch QA D17), as a <meta>: the hashes of index.html's inline
        // scripts (the theme pre-paint, the key migration, the document preload above) come from the final HTML, so
        // they can't drift when one changes. Last of the 'post' transforms, first thing in <head>. What a <meta> can't
        // carry (frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy) is in vercel.json, which `vite preview`
        // also sends (below), so the E2E suite runs under the same rules as production.
        name: 'marksage-csp',
        apply: 'build',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
            const hashes = inline.map((code) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`)
            const csp = [
              "default-src 'self'",
              `script-src 'self' ${hashes.join(' ')}`,
              "style-src 'self' 'unsafe-inline'", // Mermaid and React set inline styles
              "img-src 'self' data: blob: https: http:", // images from the web, when the reader allows them
              "font-src 'self' data:",
              "connect-src 'self'", // the model files
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; ')
            const charset = html.match(/<meta charset="[^"]*"\s*\/?>/)
            if (!charset || charset.index == null) throw new Error('marksage-csp: no <meta charset> in index.html')
            const at = charset.index + charset[0].length
            return `${html.slice(0, at)}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />${html.slice(at)}`
          },
        },
      },
    ],
    // `vite preview` sends vercel.json's headers for every page, as production does.
    preview: { headers: pageHeaders() },
    // training/data holds ~270k cloned files for the model pipeline — never watch or scan them.
    server: { watch: { ignored: ['**/training/data/**'] } },
    optimizeDeps: { entries: ['index.html'] },
  }
})

/** vercel.json's headers for every path ("/(.*)"), for `vite preview`. */
function pageHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }
  const all = config.headers?.find((h) => h.source === '/(.*)')?.headers ?? []
  return Object.fromEntries(all.map((h) => [h.key, h.value]))
}
