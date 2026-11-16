/**
 * Replace part of the editor's text as one native undo step (⌘Z takes it back whole): select the range, then
 * `insertText`. Where a browser refuses `insertText`, `fallback` sets the whole text instead (no native undo step).
 * `select` is the selection afterwards; by default the caret goes after the inserted text.
 */
export function insertInEditor(
  el: HTMLTextAreaElement,
  edit: { from: number; to: number; insert: string; select?: [number, number] },
  fallback: (next: string) => void,
): void {
  const { from, to, insert } = edit
  const [selStart, selEnd] = edit.select ?? [from + insert.length, from + insert.length]
  el.focus({ preventScroll: true })
  el.setSelectionRange(from, to)
  const native = typeof document.execCommand === 'function' && document.execCommand('insertText', false, insert)
  if (native) {
    el.setSelectionRange(selStart, selEnd)
    return
  }
  fallback(el.value.slice(0, from) + insert + el.value.slice(to))
  requestAnimationFrame(() => el.setSelectionRange(selStart, selEnd))
}
