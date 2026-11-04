import { createContext, useContext } from 'react'
import { translate, type Lang, type MessageKey, type Vars } from '../lib/i18n'

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey | (string & {}), vars?: Vars) => string
}

/** Provided by components/I18nProvider.tsx (a file of its own, so Fast Refresh keeps working on both). */
export const I18nContext = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) })

export const useI18n = () => useContext(I18nContext)
