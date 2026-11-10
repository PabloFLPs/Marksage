import type { DocStats } from '../assist/docStats'
import { countKey, type MessageKey, type Vars } from './i18n'

type T = (key: string, vars?: Vars) => string

/** Why the document got its type, in words (also the document bar's tooltip). */
export function kindReason(kind: NonNullable<DocStats['kind']>, t: T): string {
  const [first] = kind.because
  if (first?.startsWith('file:')) return t('doc.because.file', { name: first.slice(5) })
  if (first?.startsWith('shape:')) {
    const [sections, tables, code] = first.slice(6).split(',')
    const count = (key: MessageKey, n: string) => t(countKey(key, Number(n)), { n })
    return t('doc.because.shape', { parts: [count('doc.n.sections', sections), count('doc.n.tables', tables), count('doc.n.code', code)].join(', ') })
  }
  if (first?.startsWith('steps:')) return t('doc.because.steps', { n: first.slice(6) })
  if (first === 'lists') return t('doc.because.lists')
  if (first === 'prose') return t('doc.because.prose')
  return t('doc.because.sections', { list: kind.because.join(', ') })
}
