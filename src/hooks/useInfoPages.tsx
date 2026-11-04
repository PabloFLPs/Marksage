import { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from './useI18n'
import { loadDocsPage } from '../lib/docsContent'
import { loadStoryPage } from '../lib/storyContent'
import type { TechDocsPageProps } from '../components/TechDocsPage'
import type { StoryPageProps } from '../components/StoryPage'

/** How long a page, the editor or the Outline takes to play its exit animation. */
export const EXIT_MS = 220

export type InfoPage = 'about' | 'docs' | 'models' | 'story'
function pageFromHash(): InfoPage | null {
  const h = window.location.hash.toLowerCase() // "#ABOUT" works too (launch QA #36)
  return h === '#about' || h === '#privacy' ? 'about' : h === '#smart-assist' ? 'docs' : h === '#models' ? 'models' : h === '#story' ? 'story' : null
}

/**
 * Each history entry Marksage has seen carries `{ ms: 1, from }`: the screen it was opened from ('app', a page),
 * or null when it was the first one (a direct link). The in-app Back goes back in history when there is an
 * in-app previous screen — so it always agrees with the browser's Back — and otherwise to the parent page.
 */
type CameFrom = InfoPage | 'app' | null
interface NavState {
  ms: 1
  from: CameFrom
}
function navState(): NavState | null {
  const s = window.history.state as Partial<NavState> | null
  return s?.ms === 1 ? (s as NavState) : null
}

/**
 * The info pages — About (#about, #privacy), the two docs pages (#smart-assist, #models) and the story (#story):
 * which one is open, where its Back goes, their exit animation, the tab's title, and the docs and story pages'
 * lazy loading (About's is in App.tsx, a component of its own).
 */
export function useInfoPages() {
  const { t, lang } = useI18n()
  const [infoPage, setInfoPage] = useState<InfoPage | null>(pageFromHash)
  const [cameFrom, setCameFrom] = useState<CameFrom>(() => {
    const st = navState()
    if (st) return st.from // a reload keeps history.state, so Back still knows where it goes
    window.history.replaceState({ ms: 1, from: null } satisfies NavState, '')
    return null
  })
  const [aboutClosing, setAboutClosing] = useState(false)
  const infoRef = useRef(infoPage)
  infoRef.current = infoPage
  const aboutTimer = useRef<number | null>(null)
  // Play the current page's exit animation, then show `next` (or nothing) with where it was opened from. The
  // Back label changes with the page, not before: the leaving page used to flash the next one's label ("Marksage")
  // during its exit.
  const goToInfo = useCallback((next: InfoPage | null, from: CameFrom) => {
    if (infoRef.current === next) return setCameFrom(from)
    if (infoRef.current === null) {
      setCameFrom(from)
      setInfoPage(next)
      return
    }
    if (aboutTimer.current) window.clearTimeout(aboutTimer.current)
    setAboutClosing(true)
    aboutTimer.current = window.setTimeout(() => {
      aboutTimer.current = null
      setAboutClosing(false)
      setCameFrom(from)
      setInfoPage(next)
    }, EXIT_MS)
  }, [])
  useEffect(() => {
    const onHash = () => {
      // A new entry (a button, a link between the docs, the address bar): remember where it was opened from.
      if (!navState()) window.history.replaceState({ ms: 1, from: infoRef.current ?? 'app' } satisfies NavState, '')
      goToInfo(pageFromHash(), navState()?.from ?? null)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [goToInfo])
  const openAbout = useCallback(() => {
    window.location.hash = 'about'
  }, [])
  const openPrivacy = useCallback(() => {
    window.location.hash = 'privacy' // About, scrolled to "Privacy & storage"
  }, [])
  const openDocs = useCallback(() => {
    window.location.hash = 'smart-assist'
  }, [])
  const openModelsDocs = useCallback(() => {
    window.location.hash = 'models'
  }, [])
  const openStory = useCallback(() => {
    window.location.hash = 'story'
  }, [])
  const closeAbout = useCallback(() => {
    // Opened from inside the app → the previous screen, exactly like the browser's Back.
    if (navState()?.from) {
      window.history.back()
      return
    }
    // A direct link: the docs pages → About, About → the app (replacing this entry, not adding one).
    const parent: InfoPage | null = infoRef.current === 'about' ? null : 'about'
    const url = window.location.pathname + window.location.search + (parent ? '#about' : '')
    window.history.replaceState({ ms: 1, from: null } satisfies NavState, '', url)
    goToInfo(parent, null)
  }, [goToInfo])
  // The Back label names where Back goes.
  const backLabel =
    cameFrom === 'docs' ? t('docs.backToDocs') : cameFrom === 'models' ? t('docs.backToModels') : cameFrom === 'story' ? t('story.back') : cameFrom === 'app' && infoPage !== 'about' ? t('app.name') : t('docs.backToAbout')

  // The docs page + its language's content, lazily. A failed download (slow or dropped connection, an old tab
  // after a deploy) shows Try again, which reloads the page: browsers remember a failed module download, so
  // importing it again in place would fail again. Nothing is lost — the document is saved on the way out.
  const TechDocs = useMemo(
    () =>
      lazy(async () => {
        const [{ TechDocsPage }, content] = await loadDocsPage(lang)
        const Page = (props: Omit<TechDocsPageProps, 'content'>) => <TechDocsPage {...props} content={content.default} />
        return { default: Page }
      }),
    [lang],
  )
  const retryDocs = useCallback(() => window.location.reload(), [])
  // The story page (#story) + its language's content, lazily, the same way.
  const Story = useMemo(
    () =>
      lazy(async () => {
        const [{ StoryPage }, content] = await loadStoryPage(lang)
        const Page = (props: Omit<StoryPageProps, 'content'>) => <StoryPage {...props} content={content.default} />
        return { default: Page }
      }),
    [lang],
  )
  // While About is open, fetch the docs page in the background (unless the user asked to save data), so
  // "How it works" is usually ready before the click.
  useEffect(() => {
    if (infoPage !== 'about') return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const id = idle(() => void loadDocsPage(lang).catch(() => {}))
    return () => cancel(id)
  }, [infoPage, lang])
  // The tab's title follows the page and the language (launch QA #26): a shared #story link, a bookmark or the
  // history list says which page it is.
  useEffect(() => {
    const page = infoPage === 'about' ? t('title.about') : infoPage === 'docs' ? t('palette.docs') : infoPage === 'models' ? t('palette.models') : infoPage === 'story' ? t('story.back') : null
    window.document.title = page ? t('title.page', { page }) : t('app.title')
  }, [infoPage, t])

  // Logo / app name: leave About or the docs straight back to the app — the open document, or the start screen
  // when there is none. Already there → nothing to do.
  const goHome = useCallback(() => {
    if (infoRef.current === null) return
    window.history.replaceState({ ms: 1, from: null } satisfies NavState, '', window.location.pathname + window.location.search)
    goToInfo(null, null)
  }, [goToInfo])

  return {
    infoPage,
    showAbout: infoPage !== null,
    aboutClosing,
    backLabel,
    openAbout,
    openPrivacy,
    openDocs,
    openModelsDocs,
    openStory,
    closeAbout,
    goHome,
    TechDocs,
    Story,
    retryDocs,
  }
}
