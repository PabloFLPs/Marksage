import { execSync } from 'node:child_process'
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
  // license text itself at /LICENSE.txt (launch QA #28).
  let commit = ''
  try {
    commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    // A build from uncommitted changes would link a commit that isn't what's deployed: say so (not an error).
    if (mode === 'production' && execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())
      console.warn('\n⚠ Uncommitted changes: About will link commit ' + commit.slice(0, 7) + ', which is not exactly this build.\n')
  } catch {
    // Not a git checkout (many hosts build from a copy without .git): their own commit variable, else About
    // links the repository (pre-launch review).
    const env = process.env
    commit = (env.VERCEL_GIT_COMMIT_SHA || env.CF_PAGES_COMMIT_SHA || env.COMMIT_REF || env.RENDER_GIT_COMMIT || env.GITHUB_SHA || '').trim()
  }
  return {
    build: {
      // Over Vite's 500 kB default: Mermaid's chunks (elk ~1.46 MB), fetched only on a docs diagram's Mermaid
      // switch, and the main script (~590 kB, ~183 kB gzip), whose size is the first-load item in ROADMAP §4. The
      // note said nothing new on every build, so it's raised past them.
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
    ],
    // training/data holds ~270k cloned files for the model pipeline — never watch or scan them.
    server: { watch: { ignored: ['**/training/data/**'] } },
    optimizeDeps: { entries: ['index.html'] },
  }
})
