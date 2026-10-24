/**
 * Featurizer for Marksage's code-language model. Shared, byte for byte, by the trainer
 * (training/train.ts, Node) and the app (browser) — so what the model sees at run time is exactly
 * what it saw in training. Pure TS, no platform APIs.
 *
 * A snippet becomes a *set* of hashed string features (presence, not counts, so long blocks don't
 * drown short ones):
 *   T:tok   every token               ("def", "=>", "$this", "<?php")
 *   B:a b   adjacent token pairs on a line
 *   F:tok   first token of a line      ("FROM", "$", "import", "-", "+")
 *   P:a b   first two tokens of a line
 *   E:c     last character of a line   (";", "{", ":", ",")
 *   I:x     indentation style          (tab, 2, 4, 8+)
 *   G:abc   character trigrams inside words ≥ 4 chars (helps unseen identifiers, short snippets)
 */

export const MAX_CHARS = 2000

// Identifiers (incl. $vars, @decorators, #directives, --flags), numbers, then punctuation runs.
const TOKEN_RE = /--?[A-Za-z][\w-]*|[$@#]?[A-Za-z_][\w$]*|\d+(?:\.\d+)?|<\?php|<\/|\/>|=>|->|::|:=|\|\||&&|===?|!==?|<=|>=|<<|>>|\+\+|--|\.\.\.?|[^\s\w]/g

export function tokenize(line: string): string[] {
  return line.match(TOKEN_RE) ?? []
}

/** 32-bit FNV-1a. */
export function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function featureStrings(code: string): Set<string> {
  const out = new Set<string>()
  const text = code.slice(0, MAX_CHARS).replace(/\r\n?/g, '\n')
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    const ws = /^[ \t]*/.exec(line)![0]
    if (ws) out.add(ws.includes('\t') ? 'I:t' : ws.length >= 8 ? 'I:8' : ws.length >= 4 ? 'I:4' : 'I:2')
    out.add('E:' + t[t.length - 1])
    const toks = tokenize(t)
    if (!toks.length) continue
    out.add('F:' + toks[0])
    if (toks.length > 1) out.add('P:' + toks[0] + ' ' + toks[1])
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i]
      out.add('T:' + tok)
      if (i + 1 < toks.length) out.add('B:' + tok + ' ' + toks[i + 1])
      if (tok.length >= 4 && /^[$@#]?[A-Za-z_]/.test(tok)) {
        const w = '<' + tok.toLowerCase() + '>'
        for (let j = 0; j + 3 <= w.length; j++) out.add('G:' + w.slice(j, j + 3))
      }
    }
  }
  return out
}

/** Hashed bucket ids (deduplicated). */
export function featureIds(code: string, buckets: number): Uint32Array {
  const ids = new Set<number>()
  for (const f of featureStrings(code)) ids.add(hash(f) % buckets)
  return Uint32Array.from(ids)
}
