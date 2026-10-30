/**
 * v3 report: "decisive syntax" for the near-superset pairs. TypeScript is a superset of JavaScript and C++ (mostly) of
 * C, so a `ts` block without any TypeScript-only syntax is valid JavaScript — its tag says which project it came from,
 * not what the code can be told apart by. These approximate markers split each pair language into blocks that can be
 * told from their sibling by their text and blocks that can't (measured on train: 42% of `ts` blocks have one).
 */
export const TS_ONLY =
  /:\s*(string|number|boolean|any|unknown|void|never|[A-Z]\w*)(\[\])?\s*[,)=;{>|]|\binterface\s+\w|\btype\s+\w+\s*=|\benum\s+\w|\bimplements\b|\b(private|public|protected|readonly)\s+\w|<\w+(,\s*\w+)*>\s*\(|\bas\s+(const|[A-Z]\w*|string|number|any)\b|\w!\.|\bdeclare\s|\bnamespace\s|\bsatisfies\s/
export const CPP_ONLY =
  /::|\btemplate\s*<|\bclass\s+\w|\bnamespace\s|\bstd::|#include\s*<(iostream|vector|string|memory|map|algorithm|utility|thread|array|optional|functional)>|\bnew\s+\w|\bdelete\s|\bnullptr\b|\bauto\s+\w|\bconstexpr\b|\bpublic:|\bprivate:|\bvirtual\s|\boverride\b|\w&\s+\w+\s*[=,)]|\bcout\b/

/** The block's language has syntax its near-superset sibling (or subset) doesn't. */
export function decisive(label: string, code: string): boolean {
  if (label === 'ts') return TS_ONLY.test(code)
  if (label === 'cpp') return CPP_ONLY.test(code)
  return false
}
