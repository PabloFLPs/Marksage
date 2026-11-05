import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library unmounts after each test only when Vitest runs with `globals: true`; this project doesn't, so it's
// done here for every file. Without it, a hook rendered in one test stayed mounted and React's scheduler sometimes
// ran its work after happy-dom was torn down ("window is not defined", about one run in four).
afterEach(cleanup)
