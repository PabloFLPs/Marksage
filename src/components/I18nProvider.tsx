import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadLang, saveLang, translate, type Lang, type Vars } from '../lib/i18n'
import { I18nContext } from '../hooks/useI18n'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang)
  useEffect(() => {
    document.documentElement.lang = lang // the tab's title (language + page) is set in App
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    saveLang(l)
  }, [])
  const t = useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
