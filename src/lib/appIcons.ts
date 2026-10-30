/** App icon variants — used for the favicon / tab icon and the header logo. */

export type AppIconId = 'classic' | 'mono' | 'outline' | 'sunset'

const M = 'M9 22V10l7 7 7-7v12'

export type IconTheme = 'light' | 'dark'

/** Mono and Outline follow the colour theme so they match the accent palette. */
const THEMED: Record<'mono' | 'outline', { label: string; svg: Record<IconTheme, string> }> = {
  mono: {
    label: 'Mono',
    svg: {
      light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#27272a"/><path d="${M}" fill="none" stroke="#fafafa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#e4e4e7"/><path d="${M}" fill="none" stroke="#0d1117" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
  },
  outline: {
    label: 'Line',
    svg: {
      light: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#ffffff" stroke="#0d9488" stroke-width="2"/><path d="${M}" fill="none" stroke="#0d9488" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      dark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#0d1117" stroke="#2dd4bf" stroke-width="2"/><path d="${M}" fill="none" stroke="#2dd4bf" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    },
  },
}

const ICONS: Record<'classic' | 'sunset', { label: string; svg: string }> = {
  classic: {
    label: 'Classic',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2563eb"/><path d="${M}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  sunset: {
    label: 'Sunset',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#db2777"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#s)"/><path d="${M}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
}

export const APP_ICON_IDS: AppIconId[] = ['classic', 'mono', 'outline', 'sunset']
/** i18n key of an icon style's name (`label` above is its English name). The `outline` style shows as "Line":
 * "Outline" is the panel's name (launch QA #24). */
export const appIconLabelKey = (id: AppIconId) => `icon.${id}` as const
export function appIconUrl(id: AppIconId, theme: IconTheme = 'light'): string {
  const svg = id === 'mono' || id === 'outline' ? THEMED[id].svg[theme] : ICONS[id].svg
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const KEY = 'marksage:app-icon'

export function loadAppIcon(): AppIconId {
  try {
    const v = localStorage.getItem(KEY) as AppIconId | null
    return v && APP_ICON_IDS.includes(v) ? v : 'classic'
  } catch {
    return 'classic'
  }
}

export function saveAppIcon(id: AppIconId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Ignore.
  }
}

/** Swap the tab/favicon (and apple-touch-icon) and the accent palette at runtime. */
export function applyAppIcon(id: AppIconId, theme: IconTheme = 'light'): void {
  if (id === 'classic') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = id
  const href = appIconUrl(id, theme)
  // Only the tab icon is swapped: apple-touch-icon must stay a PNG (iOS ignores SVG).
  for (const rel of ['icon']) {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
    if (!link) {
      link = document.createElement('link')
      link.rel = rel
      document.head.appendChild(link)
    }
    link.type = 'image/svg+xml'
    link.href = href
  }
}
