import { defineConfig } from 'vitest/config'

// Unit tests: the pure logic (Recent, storage, files, preview pieces, the pre-filter, versions). The browser flows are
// the Playwright suite (tests/e2e); Smart Assist's accuracy is `npm run eval:assist`.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom', // localStorage and the DOM, as in the browser
    restoreMocks: true,
  },
})
