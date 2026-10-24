import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Link previews need absolute URLs (WhatsApp/Slack ignore relative og:image).
  // Set VITE_SITE_URL (e.g. https://marksage.app) in .env or your host's env vars.
  const siteUrl = (loadEnv(mode, process.cwd(), '').VITE_SITE_URL ?? '').replace(/\/+$/, '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'marksage-site-url',
        transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
      },
    ],
    // training/data holds ~270k cloned files for the model pipeline — never watch or scan them.
    server: { watch: { ignored: ['**/training/data/**'] } },
    optimizeDeps: { entries: ['index.html'] },
  }
})
