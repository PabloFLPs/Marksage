import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Link previews need absolute URLs (WhatsApp/Slack ignore relative og:image).
  // Set VITE_SITE_URL (e.g. https://marksage.app) in .env or your host's env vars.
  const siteUrl = (loadEnv(mode, process.cwd(), '').VITE_SITE_URL ?? '').replace(/\/+$/, '')
  // Without it, og:image / og:url stay relative and link previews show no image (launch QA #34): say so at build.
  if (mode === 'production' && !siteUrl)
    console.warn('\n⚠ VITE_SITE_URL is not set — link previews (og:image, og:url) will be relative. See .env.example.\n')
  // AGPL: About links the exact source of the build people are using (the commit), and the site serves the
  // license text itself at /LICENSE.txt (launch QA #28).
  let commit = ''
  try {
    commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    // Not a git checkout: About links the repository instead.
  }
  return {
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
