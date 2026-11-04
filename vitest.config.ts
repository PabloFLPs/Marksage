import { defineConfig } from 'vitest/config'

// Unit tests: the pure logic (Recent, storage, files, preview pieces, the pre-filter, versions), and the hooks and
// components rendered in happy-dom with Testing Library (tests/unit/*.test.tsx). The browser flows are the Playwright
// suite (tests/e2e); Smart Assist's accuracy is `npm run eval:assist`.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'happy-dom', // localStorage and the DOM, as in the browser
    restoreMocks: true,
    // `npm run test:coverage` (CI): lines of src/ these tests run. Smart Assist's rules and models are covered by
    // `eval:assist` too (~93% of assist/), which this doesn't count. The floor catches a suite that stopped testing.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__fixtures__/**', 'src/main.tsx'],
      reporter: ['text-summary'],
      thresholds: { lines: 50 },
    },
  },
})
