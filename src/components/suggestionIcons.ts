import type { ComponentType } from 'react'
import { Braces, Code2, Heading, Link, List, ListOrdered, Table } from 'lucide-react'
import type { Suggestion } from '../assist/types'

type Icon = ComponentType<{ className?: string }>

/** What kind of fix a suggestion is, by its message: same icons as the About page's feature list. */
const BY_MESSAGE: Record<string, Icon> = {
  'suggest.fence': Code2,
  'suggest.fencePair': Code2,
  'suggest.fencePick': Code2,
  'suggest.paste.csv': Table,
  'suggest.paste.tsv': Table,
  'suggest.paste.table': Table,
  'suggest.paste.list': List,
  'suggest.paste.json': Braces,
  'suggest.paste.jsonc': Braces,
  'suggest.paste.jsonFormat': Braces,
  'suggest.paste.code': Code2,
  'suggest.paste.codeLang': Code2,
  'suggest.structure.heading': Heading,
  'suggest.structure.list': List,
  'suggest.structure.ordered': ListOrdered,
  'suggest.structure.link': Link,
}

const BY_FEATURE: Record<Suggestion['feature'], Icon> = { codeFence: Code2, smartPaste: Table, structure: Heading }

export function suggestionIcon(s: Suggestion): Icon {
  return (s.message && BY_MESSAGE[s.message.key]) || BY_FEATURE[s.feature]
}

/** i18n key for the ✦ tooltip, or null when the rules decided alone. */
export function decidedByKey(s: Suggestion): string | null {
  return s.by === 'model' ? 'suggest.byModel' : s.by === 'agreement' ? 'suggest.byAgreement' : null
}
