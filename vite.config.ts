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
  // AGPL: About links the exact source of the build people are using (the commit), and the site serves the
  // license text itself at /LICENSE.txt (launch QA #28).
  let commit = ''
  try {
    commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    // Not a git checkout: About links the repository instead.
  }
  return {
    define: { 'import.meta.env.VITE_SOURCE_COMMIT': JSON.stringify(commit) },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'marksage-site-url',
        transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
      },
      {
        name: 'marksage-license',
        apply: 'build',
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
