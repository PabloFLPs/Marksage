import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadLang, saveLang, translate, type Lang, type MessageKey, type Vars } from '../lib/i18n'

interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey | (string & {}), vars?: Vars) => string
}

const I18nContext = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang)
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'app.title') // the tab's name follows the language too (launch QA #26)
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    saveLang(l)
  }, [])
  const t = useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
