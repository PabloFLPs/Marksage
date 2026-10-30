import type { DecisionEngine, Suggestion } from '../types.ts'
import { passesGate } from '../types.ts'
import { isPasteCandidate } from '../prefilter.ts'
import { LANGUAGES, PASTE_KINDS, Q, type Language, type PasteKind } from '../questions.ts'
import { alignedToTable, csvToTable, toCodeBlock, toList, tsvToTable } from '../convert.ts'
import { hash } from './codeFence.ts'
import { parseJsonLike, prettyJson } from '../json.ts'

/** F2 — the paste already happened untouched; offer to convert the pasted range. */
export async function suggestPasteConversion(
  pasted: string,
  from: number,
  engine: DecisionEngine,
  signal?: AbortSignal,
): Promise<Suggestion | null> {
  if (!isPasteCandidate(pasted)) return null
  // Already Markdown structure? Nothing to offer.
  if (/^\s*(\|.*\||```|~~~|#{1,6}\s|[-*+]\s)/.test(pasted)) return null

  const d = await engine.choice<PasteKind>(pasted, Q.pasteKind, PASTE_KINDS)
  if (signal?.aborted) return null
  if (!passesGate(Object.values(d.probs) as number[], 0.8, 0.2)) return null

  let insert: string | null = null
  let label = ''
  let msgKey: string = `suggest.paste.${d.choice}`
  let msgVars: Record<string, string> | undefined
  let by: Suggestion['by']
  switch (d.choice) {
    case 'csv':
      insert = csvToTable(pasted)
      label = 'Convert CSV to Markdown table'
      break
    case 'tsv':
      insert = tsvToTable(pasted)
      label = 'Convert to Markdown table'
      break
    case 'table':
      insert = alignedToTable(pasted)
      label = 'Convert to Markdown table'
      break
    case 'list':
      insert = toList(pasted)
      label = 'Convert to Markdown list'
      break
    case 'json': {
      const pretty = prettyJson(pasted)
      // Comments / trailing commas aren't JSON: tag it `jsonc` (JSON with Comments) so it stays honest.
      const tag = parseJsonLike(pasted)?.strict === false ? 'jsonc' : 'json'
      insert = toCodeBlock(pretty, tag)
      const formatted = pretty !== pasted.trim()
      label = formatted ? 'Format JSON into a ```json code block' : `Wrap in \`\`\`${tag} code block`
      if (formatted) msgKey = 'suggest.paste.jsonFormat'
      else if (tag === 'jsonc') msgKey = 'suggest.paste.jsonc'
      break
    }
    case 'code': {
      const lang = await engine.choice<Language>(pasted, Q.fenceLanguage, LANGUAGES)
      const ok = passesGate(Object.values(lang.probs) as number[], 0.8, 0.2)
      const tag = ok ? lang.choice : 'plaintext'
      if (ok) by = lang.by
      insert = toCodeBlock(pasted, tag)
      label = tag === 'plaintext' ? 'Wrap in code block' : `Wrap in \`\`\`${tag} code block`
      if (tag !== 'plaintext') {
        msgKey = 'suggest.paste.codeLang'
        msgVars = { lang: tag }
      }
      break
    }
    case 'prose':
      return null
  }
  if (!insert || insert === pasted) return null
  // Keep the paste's own line break(s) at the end: the converters return trimmed blocks, so the next thing typed
  // landed on the table's last row or the closing fence (launch QA #31).
  const trailing = /\n+$/.exec(pasted)?.[0] ?? ''
  if (trailing && !insert.endsWith('\n')) insert += trailing
  return {
    key: `smartPaste:${hash(pasted)}`,
    feature: 'smartPaste',
    label,
    detail: PASTE_KINDS[d.choice],
    message: { key: msgKey, vars: msgVars },
    detailKey: `paste.kind.${d.choice}`,
    confidence: d.probs[d.choice],
    by,
    edit: { from, to: from + pasted.length, insert },
    expected: pasted,
  }
}
