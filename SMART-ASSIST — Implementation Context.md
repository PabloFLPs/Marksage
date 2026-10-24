# Smart Assist — Implementation Context (Markdown Preview)

> Paste this into a new chat to start implementation. Origin: a case-study discussion
> (2026-09-25) on where "System 1" decision models (Jev / Laya) actually add value.

## 1. The concept in one paragraph

Decision models (Jev = closed, hosted API; **Laya** = Apache-2.0, open weights, ~322M/421M
params, ONNX exports) do **not** generate text. They answer typed questions over a set of options
that is fixed up front: `choice` (pick one option, with a probability per option), `score` (a place on an ordered scale),
`noul` (probability a statement is true). Output can't be malformed. **The model decides; our
TypeScript code acts.** If you can't list the possible answers up front, it's not a decision-model job.

## 2. Project state (as of this doc)

- React 19 + TS + Vite 8 + Tailwind 4, `react-markdown` + `remark-gfm`. Local-first, no backend.
- Editor is a plain `<textarea>` (`src/components/MarkdownEditor.tsx`) — **no inline decorations
  possible**; suggestions must be UI outside the text (suggestion bar / toast / gutter chip).
- Relevant files: `src/App.tsx`, `src/hooks/useMarkdownFile.ts`, `src/lib/storage.ts`,
  `src/components/MarkdownPreview.tsx`. Full product spec: `Markdown Preview Web Application —
  Product & Technical Specification.md`.
- Product promise: minimalist, local-first, "files never leave your machine". **Keep it.**

## 3. Scope — features to build

Each is optional, debounced, and fully functional without the model (heuristic fallback).

| # | Feature | Decision type | Trigger | Action (our code) |
|---|---------|---------------|---------|-------------------|
| F1 | **Code-fence language detection** | `choice` over ~20 languages + `plaintext` | A ```` ``` ```` fence without a language tag, when the cursor leaves it | Suggest `add "ts"` → inserts tag on accept |
| F2 | **Smart paste** | `choice`: `prose / table / csv / tsv / list / code / json` | `paste` event with multi-line text | Offer "Convert to Markdown table / list / code block"; default paste stays untouched |
| F3 | **Structure intent** | `noul` per candidate line | Lines like `1)`, `**Title**` alone on a line, `-item`, `Title` followed by `===` misuse | Suggest "Make this a heading / list item?" |
| F4 | **Readability signal** | `score` 0–4 per section | Idle > 2 s, per `##` section | Subtle dot in preview gutter; tooltip only |

**Build order:** F1 → F2 → F3 → F4. F1 is the easiest to measure and the best demo.

### Explicitly NOT doing

- Spelling/formatting via the model → use deterministic tools if ever wanted (`nspell`,
  `remark-lint`). Model adds nothing there.
- Generative autocomplete / rewriting. Out of scope for this feature.
- Auto-applying anything. Every action is a suggestion the user accepts (Tab/Enter) or dismisses (Esc).

## 4. Architecture

```
textarea ──(debounce 400ms)──► deterministic pre-filter (regex / remark AST)
                                   │  "is there a candidate?"  no → stop
                                   ▼
                           DecisionEngine interface
                         ┌─────────┴──────────┐
                  HeuristicEngine        LayaEngine (Web Worker)
                  (always available)     transformers.js / onnxruntime-web, WebGPU → WASM
                         └─────────┬──────────┘
                                   ▼
                   confidence gate (per-feature threshold)
                                   ▼
                     Suggestion UI  →  user accepts  →  our code edits text
```

```ts
// src/assist/types.ts
type Decision<T extends string> = { choice: T; probs: Record<T, number> };
interface DecisionEngine {
  ready(): Promise<void>;
  choice<T extends string>(state: string, q: string, options: Record<T, string>): Promise<Decision<T>>;
  score(state: string, q: string, scale: string[]): Promise<{ value: number; probs: number[] }>;
  noul(state: string, statement: string): Promise<number>;
}
```

Rules:
- Model inference **only in a Web Worker**; UI thread never blocks. Cancel stale requests on new input.
- **Pre-filter first.** The model runs only on candidates (a bare fence, a multi-line paste), never per keystroke.
- **Confidence gate**: show a suggestion only if top prob ≥ threshold (start 0.80) AND margin over
  2nd ≥ 0.2. Otherwise silent.
- `HeuristicEngine` must ship first and be good enough alone (e.g. F1 via keyword/regex scoring,
  F2 via delimiter consistency). Laya is an upgrade, not a dependency.

## 5. Model loading & UX

- **Opt-in** toggle in Header: "Smart Assist (local AI)" → Off / Heuristics / Local model.
- Model downloads **lazily** only when "Local model" is chosen; show size + progress; cache via
  browser Cache API (transformers.js default). Persist choice in `localStorage` (`storage.ts`).
- Detect `navigator.gpu`; fall back to WASM (slower) or suggest Heuristics mode.
- **Verify before committing:** the ONNX export's real size/quantization (reports of "428 MB at Q4"
  don't match 421M params — Q4 should be ~210–250 MB). Prefer the **322M multilingual** variant if
  quality holds. Record actual download size, cold-start time, and per-decision latency.

## 6. Validation (do this before shipping F1 with the model)

- Build a small labeled set in `src/assist/__fixtures__/` (e.g. 60 unlabeled code snippets, 30 pastes, 30 ambiguous lines).
- Script compares HeuristicEngine vs LayaEngine: accuracy, **calibration** (is 0.9 confidence ~90%
  correct?), latency. Laya has a documented failure mode of being *confidently wrong* on unfamiliar
  inputs — include pt-BR prose and mixed-language snippets.
- Ship the model path only where it beats heuristics meaningfully.

## 7. Suggested file layout

```
src/assist/
  types.ts              DecisionEngine, Decision, Suggestion
  prefilter.ts          candidate detection (pure, unit-tested)
  heuristicEngine.ts
  laya.worker.ts        model load + inference
  layaEngine.ts         worker client (postMessage, cancellation)
  features/codeFence.ts | smartPaste.ts | structure.ts | readability.ts
  useSmartAssist.ts     hook wiring textarea ↔ engine ↔ suggestions
src/components/SuggestionBar.tsx
```

## 8. Acceptance criteria (F1 — first milestone)

- [ ] Typing never lags; zero model work on the main thread.
- [ ] With assist Off, app behaves byte-for-byte as today.
- [ ] Heuristics mode suggests fence languages with no download.
- [ ] Local-model mode: lazy download with progress, works offline after first load.
- [ ] Suggestion appears only above the confidence gate; Tab accepts, Esc dismisses.
- [ ] Fixture eval results recorded in this doc (heuristic vs Laya).

## 9. Open questions for the implementation chat

1. Exact Laya ONNX repo/export to use, and its JS API with transformers.js vs raw onnxruntime-web.
2. Does a 322M model hit acceptable latency on WASM (no WebGPU)?
3. Keep `<textarea>` or migrate to CodeMirror 6 later (would enable inline chips/ghost text)?

## 10. Implementation status (2026-09-25)

- **Done (heuristics):** F1 code-fence language, F2 smart paste, F3 structure intent, F4 readability dots
  (LIX-based, language-agnostic). Header toggle Off / Heuristics, persisted in `localStorage`.
  Tab accepts, Esc dismisses; edits go through `execCommand('insertText')` so Cmd+Z still works.
- **Scaffolded:** `LayaEngine` worker client (cancellation, progress) + `laya.worker.ts` with a
  `loadModel()` TODO. "Local model" option is visible but disabled until open question #1 is resolved;
  if selected, the engine falls back to heuristics.
- **Eval:** `npm run eval:assist` (heuristic engine, fixtures in `src/assist/__fixtures__/`).

Two fixture sets per feature (`src/assist/__fixtures__/README.md`): **authored** (written with the rules —
regression tests) and **real** (excerpts from real docs, wikis and command output — held out, never tune against it).

| Feature | Set | n | Accuracy | Shown past gate | Precision when shown | Latency |
|---|---|---|---|---|---|---|
| F1 fence language | authored | 42 | 100% | 29/42 | 100% | ~0.2 ms |
| F1 fence language | **real** | 64 | **59%** | **14/64** | **93%** (1 error: Ruby array that is also valid JSON) | ~0.2 ms |
| F2 smart paste | authored | 15 | 100% | 11/15 | 100% | ~0.3 ms |
| F2 smart paste | **real** | 31 | **81%** | **17/31** | **100%** | ~0.5 ms |
| F3 structure | authored | 10 | 100% | 6/10 | 100% | ~0.1 ms |
| F3 structure | **real** | 30 | **67%** | **22/30** | **55%** (10 false positives) | <0.1 ms |
| Laya | real | — | pending | — | — | — |

Reading the real-set numbers (2026-10-23):
- **F1** — the gate does its job (shown ⇒ ~93% right), but coverage is low: 50/64 real blocks get no
  suggestion. Misses are short snippets (`php artisan …`, `#include <x.h>`, one-line SQL/Python), C#/PHP/C++
  read as Java/Rust/TS, and diffs of code. This is where a model could actually earn its download.
- **F2** — never wrong when shown. Misses: a list copied from a rendered page (no bullets, sentence-like
  items) reads as prose; `pip list` / `rails routes` (separator row, empty cells) aren't seen as tables;
  JSON with `//` comments before the object.
- **F3** — the weak one. Every true case is caught, but half the shown suggestions are wrong:
  `-flag` lines inside **indented code blocks** (CLI help, terminal output, CSS) and bold labels
  (`**Note**`, `**Likelihood Of Impact: Very Low**`) pass at 0.80–0.86, and the 0.8–0.9 bucket is only
  44% correct (miscalibrated). Likely fixes: skip 4-space indented code in the pre-filter; penalise
  `-` + flag-like token; lower bold-label confidence when the next block is a list/table or the line
  carries a value. Build those against a separate dev set, not the held-out one.
