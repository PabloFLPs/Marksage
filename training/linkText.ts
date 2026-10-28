/**
 * Link text for a pasted URL — a rule, no model. Offline, the text can only come from the URL itself, and real
 * authors almost never write what a URL spells out: for a page they write its title, for a site its name. The one
 * exception is an issue or pull request — "owner/repo#123" is how GitHub itself names one, and the text authors
 * chose for about 9 in 10 such links in the dev repositories (training/eval-links.ts). So only those get a
 * suggestion; any other URL stays as pasted (GitHub-flavoured Markdown shows a bare URL as a link anyway).
 */

/** A pasted line that is a single http(s) URL and nothing else. */
export const URL_ONLY = /^\s*<?(https?:\/\/[^\s<>"'`]+)>?\s*$/

const ISSUE = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull|discussions)\/(\d+)(?:[/?#].*)?$/

/** `owner/repo#123` for a GitHub issue, pull request or discussion; null for anything else. */
export function linkTextFor(url: string): string | null {
  const m = ISSUE.exec(url.trim())
  return m ? `${m[1]}/${m[2]}#${m[4]}` : null
}
