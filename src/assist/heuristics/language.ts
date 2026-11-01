import type { Language } from '../questions.ts'
import { parseJsonLike } from '../json.ts'

type Rule = [RegExp, number]

/**
 * Weighted evidence per language. Scores behave like logits: each matching
 * rule adds its weight once. Keep rules distinctive — shared syntax (braces,
 * semicolons) belongs to several languages at small weights.
 */
const RULES: Record<Exclude<Language, 'plaintext'>, Rule[]> = {
  ts: [
    [/\b(interface|type)\s+[A-Z]\w*\s*(<[^>]*>)?\s*[={]/, 3],
    [/\w\s*:\s*(string|number|boolean|void|unknown|any|never)\b/, 3],
    [/\b(const|let|var)\s+\w+\s*:\s*[A-Z]?\w+/, 2],
    [/\bas\s+(const|string|number|[A-Z]\w*)\b/, 2],
    [/\b(import|export)\s+type\b/, 3],
    [/\b(public|private|protected|readonly)\s+\w+\s*[:(]/, 1.5],
    [/\)\s*:\s*(Promise<|[A-Z]\w*|string|number|void|boolean)/, 2.5],
    [/\b(const|let)\s+\w+\s*=/, 1],
    [/=>/, 0.8],
    [/\bimport\s+.*\s+from\s+['"]/, 1.2],
    [/<\w+(\s+\w+(=\{|="))?[^>]*\/?>/, 0.3],
  ],
  js: [
    [/\b(const|let|var)\s+\w+\s*=/, 2],
    [/=>/, 1],
    [/\bfunction\s*\w*\s*\(/, 1.5],
    [/\bconsole\.(log|error|warn)\(/, 1.5],
    [/\brequire\(['"]/, 2.5],
    [/\bmodule\.exports\b/, 3],
    [/\bimport\s+.*\s+from\s+['"]/, 1.5],
    [/\b(document|window)\.\w+/, 1.5],
    [/\basync\s+(function|\()/, 1],
    [/===|!==/, 1],
    [/`[^`]*\$\{[^}]+\}[^`]*`/, 1],
  ],
  python: [
    [/^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w[\], ]+)?\s*:\s*$/m, 4],
    [/^\s*(from\s+[\w.]+\s+)?import\s+[\w.]+(\s+as\s+\w+)?\s*$/m, 2],
    [/^\s*class\s+\w+(\(.*\))?\s*:\s*$/m, 3],
    [/^\s*(if|elif|while|for)\s+.*:\s*$/m, 2],
    [/\bprint\(/, 1.5],
    [/\bself\.\w+/, 2.5],
    [/\b(None|True|False)\b/, 1.5],
    [/^\s*@\w+/m, 0.5],
    [/\bf["'][^"']*\{/, 2],
    [/^\s*#(?!!)\s/m, 0.5],
    [/__\w+__/, 2],
    [/\blambda\s+\w*:/, 2],
  ],
  bash: [
    [/^#!\/(usr\/)?bin\/(env\s+)?(ba|z)?sh/m, 5],
    [/^\s*\$\s+\w+/m, 3],
    [/^\s*(sudo|npm|npx|pnpm|yarn|brew|apt(-get)?|git|cd|ls|mkdir|rm|cp|mv|curl|wget|docker|kubectl|pip|export|echo|chmod|source)\b/m, 3],
    [/\s--?[a-z][\w-]*/, 1],
    [/\|\s*(grep|awk|sed|xargs|sort|head|tail|wc)\b/, 2.5],
    [/\$\{?\w+\}?/, 0.5],
    [/\b(fi|done|esac)\b/, 2],
    [/&&|\|\|/, 0.5],
  ],
  json: [
    [/^\s*[{[]/, 1],
    [/"[\w$@-]+"\s*:/, 2.5],
    [/^\s*[}\]]\s*$/m, 0.5],
  ],
  html: [
    [/<!DOCTYPE html>/i, 5],
    [/<\/?(html|head|body|div|span|p|a|ul|li|section|script|style|meta|link|button|form|input|img)\b[^>]*>/i, 3],
    [/<\/\w+>/, 1.5],
    [/\s(class|id|href|src)="[^"]*"/, 1],
  ],
  css: [
    [/^\s*[.#:@]?[\w-][\w\s.#:,>+~()-]{0,80}\{\s*$/m, 1.5],
    [/^\s*[\w-]+\s*:\s*[^;{}]+;\s*$/m, 2.5],
    [/@(media|import|keyframes|font-face|tailwind|apply)\b/, 3],
    [/\b\d+(px|rem|em|vh|vw|%)\b/, 1],
    [/#[0-9a-f]{3,8}\b/i, 1],
  ],
  sql: [
    [/\bSELECT\b[\s\S]+\bFROM\b/i, 4],
    [/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW)|ALTER\s+TABLE|DROP\s+TABLE)\b/i, 4],
    [/\b(WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|LIMIT|VALUES)\b/, 1.5],
  ],
  go: [
    [/^\s*package\s+\w+\s*$/m, 4],
    [/\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\(/, 3],
    [/:=/, 2],
    [/\bfmt\.\w+\(/, 3],
    [/\bif\s+err\s*!=\s*nil\b/, 4],
    [/^\s*import\s+\(/m, 2],
  ],
  rust: [
    [/\bfn\s+\w+\s*(<[^>]*>)?\(/, 3],
    [/\blet\s+mut\s+\w+/, 3],
    [/\b(impl|trait|pub\s+fn|pub\s+struct|use\s+std::)\b/, 3],
    [/\w+!\(/, 1.5],
    [/::\w+/, 1],
    [/->\s*(Self|Result<|Option<|&?\w+)/, 1],
    [/&(mut\s+)?\w+/, 0.3],
  ],
  java: [
    [/\bpublic\s+(static\s+)?(class|void|interface|final)\b/, 3],
    [/\bSystem\.out\.print/, 4],
    [/\b(private|protected|public)\s+\w+(<[\w<>, ]+>)?\s+\w+\s*[;=(]/, 2],
    [/^\s*import\s+java\./m, 4],
    [/@Override\b/, 3],
    [/\bnew\s+[A-Z]\w*(<[^>]*>)?\(/, 1],
  ],
  c: [
    [/^\s*#include\s*<\w+\.h>/m, 4],
    [/\b(int|void|char)\s+main\s*\(/, 2.5],
    [/\bprintf\s*\(/, 2.5],
    [/\b(malloc|free|sizeof)\s*\(/, 2],
    [/\w+\s*->\s*\w+/, 0.8],
  ],
  cpp: [
    [/^\s*#include\s*<\w+>/m, 4],
    [/\bstd::\w+/, 4],
    [/\b(cout|cin|endl)\b/, 2.5],
    [/\btemplate\s*</, 3],
    [/\b(class|namespace)\s+\w+/, 0.5],
  ],
  csharp: [
    [/^\s*using\s+System(\.\w+)*;/m, 5],
    [/\bnamespace\s+[\w.]+/, 1.5],
    [/\bConsole\.Write(Line)?\(/, 4],
    [/\bpublic\s+(async\s+)?(Task|string|int|void|bool)\b/, 1.5],
    [/\{\s*get;\s*(set;)?\s*\}/, 4],
    [/\bvar\s+\w+\s*=\s*new\b/, 1.5],
  ],
  ruby: [
    [/^\s*def\s+\w+[?!]?(\(.*\))?\s*$/m, 3],
    [/^\s*end\s*$/m, 2.5],
    [/\b(puts|require|attr_accessor|do\s*\|)\b/, 2.5],
    [/:\w+\s*=>/, 2],
    [/\.each\s+do\b/, 3],
  ],
  php: [
    [/<\?php/, 6],
    [/\$\w+\s*=/, 1.5],
    [/\$this->\w+/, 3],
    [/\becho\s+['"$]/, 1],
    [/\bfunction\s+\w+\s*\(\s*\$/, 3],
  ],
  yaml: [
    [/^[\w.-]+:\s*$/m, 1.5],
    [/^\s*[\w.-]+:\s+[^\s{]/m, 1.5],
    [/^\s*-\s+[\w.-]+:\s*/m, 2],
    [/^---\s*$/m, 1],
    [/^\s{2,}[\w.-]+:/m, 1],
  ],
  markdown: [
    [/^#{1,6}\s+\S/m, 2],
    [/^\s*[-*+]\s+\S/m, 1],
    [/\[[^\]]+\]\([^)]+\)/, 2],
    [/\*\*[^*]+\*\*/, 1.5],
    [/^>\s/m, 1],
  ],
  diff: [
    [/^(---|\+\+\+)\s+(a\/|b\/)?\S/m, 4],
    [/^@@\s+-\d+(,\d+)?\s+\+\d+(,\d+)?\s+@@/m, 5],
    [/^diff --git\b/m, 5],
    [/^[+-](?![+-])\S/m, 1],
  ],
  dockerfile: [
    [/^\s*FROM\s+[\w./:-]+(\s+AS\s+\w+)?\s*$/im, 4],
    [/^\s*(RUN|COPY|ADD|WORKDIR|EXPOSE|ENV|CMD|ENTRYPOINT|ARG)\s+/m, 2.5],
  ],
}

/** Penalties for evidence that contradicts a language. */
const NEGATIVE: Partial<Record<Language, Rule[]>> = {
  js: [[/\w\s*:\s*(string|number|boolean)\b/, -2]],
  c: [[/\bstd::/, -3]],
  markdown: [[/[;{}]\s*$/m, -2]],
  yaml: [[/[;{}()]\s*$/m, -2], [/^\s*(def|class|if|for)\s/m, -3]],
}

function codeLikeness(text: string): number {
  const symbols = (text.match(/[{}()[\];=<>$:]/g) ?? []).length
  const words = (text.match(/[A-Za-zÀ-ÿ]+/g) ?? []).length
  const sentences = (text.match(/[A-Za-zÀ-ÿ]{3,}[.!?](\s|$)/g) ?? []).length
  return symbols / Math.max(1, words) - sentences * 0.15
}

/** Returns a logit-like score per language (plaintext included). */
export function classifyLanguage(code: string): Record<Language, number> {
  const scores = {} as Record<Language, number>
  for (const [lang, rules] of Object.entries(RULES) as [Exclude<Language, 'plaintext'>, Rule[]][]) {
    let s = 0
    for (const [re, w] of rules) if (re.test(code)) s += w
    for (const [re, w] of NEGATIVE[lang] ?? []) if (re.test(code)) s += w
    scores[lang] = s
  }

  // Structural overrides.
  // JSON (strict or with comments / trailing commas, as in config files).
  const json = parseJsonLike(code)
  if (json) scores.json += json.strict ? 6 : 5
  else scores.json = Math.min(scores.json, 1)

  // TS is a superset of JS: if TS-only evidence exists, it should win; if not, JS should.
  const tsOnly = RULES.ts.slice(0, 7).some(([re]) => re.test(code))
  if (!tsOnly) scores.ts = Math.min(scores.ts, scores.js - 1.5)
  else scores.js = Math.min(scores.js, scores.ts - 1.5)

  // C++ includes can be <iostream> without .h; C uses .h — disambiguate.
  if (/#include\s*<\w+\.h>/.test(code) && !/std::|cout|template/.test(code)) scores.cpp -= 2

  const cl = codeLikeness(code)
  scores.plaintext = 2.5 - cl * 6
  return scores
}
