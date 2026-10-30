/**
 * A comment in a `json` block — `//` or `/* … *​/` outside strings (JSONC / JSON5 style; labels.ts maps both tags
 * to json). Strings are removed first, so "packages/*" or "https://…" don't count.
 */
export const hasJsonComment = (code: string) => /\/\/|\/\*/.test(code.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""'))
