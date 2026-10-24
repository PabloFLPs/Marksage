# Smart Assist — Implementation Context (Markdown Preview)

> Paste this into a new chat to start implementation. Origin: a case-study discussion
> (2026-09-25) on where "System 1" decision models (Laya) actually add value.

## 1. The concept in one paragraph

Decision models (**Laya** = Apache-2.0, open weights, ~322M/421M params,
ONNX exports) do **not** generate text. They answer typed questions over a set of options
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
| F1 fence language | dev | 280 | 62% | 98/280 | 90% | ~0.2 ms |
| F1 fence language | **real** | 314 (was 64) | **57%** (was 59%) | **75/314** (24%) | **97%** (was 93%) | ~0.1 ms |
| F2 smart paste | authored | 15 | 100% | 11/15 | 100% | ~0.3 ms |
| F2 smart paste | dev | 27 | 93% (was 78%) | 19/27 | 100% | ~0.4 ms |
| F2 smart paste | **real** | 31 | **94%** (was 81%) | **23/31** (was 17) | **100%** | ~0.5 ms |
| F3 structure | authored | 23 | 100% | 9/23 | 100% | ~0.1 ms |
| F3 structure | dev | 36 | 94% (was 69%) | 13/36 | 100% (was 58%) | <0.1 ms |
| F3 structure | **real** | 30 | **93%** (was 67%) | **14/30** | **86%** (was 55%; 12/12 true cases caught) | <0.1 ms |
| Laya | real | — | pending | — | — | — |

Reading the real-set numbers (2026-10-23):
- **F1** — the gate does its job (shown ⇒ ~93% right), but coverage is low: 50/64 real blocks get no
  suggestion. Misses are short snippets (`php artisan …`, `#include <x.h>`, one-line SQL/Python), C#/PHP/C++
  read as Java/Rust/TS, and diffs of code. This is where a model could actually earn its download.
- **F2** — never wrong when shown. Misses: a list copied from a rendered page (no bullets, sentence-like
  items) reads as prose; `pip list` / `rails routes` (separator row, empty cells) aren't seen as tables;
  JSON with `//` comments before the object.
- **F3** — was the weak one (55% precision: `-flag` lines in indented code, CSS, CLI help, bold
  labels like `**Note**`). Fixed 2026-10-23, tuned only on `lines.dev.json` (36 lines from 23 *other*
  repos/wikis), then the held-out set was run once: the pre-filter now skips indented code blocks
  (list-aware) and raw HTML blocks, and ignores `*/`, `->`, `*...`; the scorer recognises CLI flags,
  flag sets, CSS declarations, callout words (EN + PT-BR), sentence endings in CJK/Indic/Khmer,
  bold links, and keeps lone `*`/`-` lines (no list neighbours) below the gate. Remaining misses:
  a bold metadata line (`**Likelihood Of Impact: Very Low**`) and a settings-field label.

## 11. Own model for F1 (in progress)

Laya stays an option, but F1 is a fixed-answer question with ~250k free, author-labelled examples on
GitHub, so a small purpose-trained classifier is the better fit for a fast, local-first app.

- **Model:** fastText-style — hashed character n-grams + word tokens → small embedding → softmax over the
  21 languages. Trained in TypeScript (same tokenizer at train and run time), shipped as a few hundred KB
  of int8 weights, inference in plain TS (no ONNX/WebGPU), loaded only in "Local model" mode.
- **Data (phase 1, done 2026-10-23):** `training/` — 265 public sources → 250k blocks; split by repo:
  train 55k blocks (155 repos + source-file windows), dev 280 (28 repos), test 314 (66 repos, incl. the
  original 64). Leak guard on exact text and first-three-lines. See `training/README.md`.
- **Bar to ship (on fences.real.json, run once per candidate):** precision when shown ≥ heuristics (97%),
  shown ≫ 24% (target ≥ 50%), calibrated confidence. A hybrid (model only where heuristics are silent)
  is a valid outcome.
- **Phase 2 (done 2026-10-23):** `training/train.ts` + `src/assist/model/` (shared featurizer and
  inference). v1 = 8-dim × 32,768 buckets, 385 KB int8, ~0.1 ms/decision, temperature 1.85 fitted on dev.
  Size sweep (8–24 dims, 16k–131k buckets) stayed within dev noise → smallest good model. Strategy locked
  on dev before the held-out run: **model alone, usual gate** (hybrids lost precision on dev).

  | Held-out (314, run once) | Accuracy | Shown | Precision when shown | Right / wrong shown |
  |---|---|---|---|---|
  | Heuristics | 57.3% | 75 (24%) | 97.3% | 73 / 2 |
  | Model v1 | 75.8% | 141 (45%) | 94.3% | 133 / 8 |

  Mixed against the bar: ~1.8× the right suggestions and +18 points accuracy, but precision 3 points
  lower (within noise at these sizes) and coverage just under the 50% target. 6 of the 8 wrong ones are
  1–3 line snippets; 2 are label noise. Details and v2 ideas: `training/README.md`.
- **Phase 3 (done 2026-10-23):** v1 shipped as the opt-in **Local model** mode. `assist/modelEngine.ts`
  answers `fence.language` (F1 + the tag on code pastes) with the model and delegates everything else
  to the heuristics. Runs on the main thread — the old "worker only" rule was written for a 300M-param
  model; at ~0.1 ms a worker costs more than inference. Lazy `fetch` with progress, one load shared by
  every engine instance, stored in the Cache API (no re-download; the app itself has no service worker,
  so this is "downloaded once", not "offline"). Failure → `fallback` status, heuristics keep working.
  Verified in a browser: heuristics silent on an untagged Python block, model suggests `python` (99 %),
  Tab applies; 1 request on first load, 0 on the next; 404 → fallback. Docs §4 rewritten (EN + PT-BR).
- **Next (v2):** short snippets (≤ 3 lines), TS-vs-JS cues, more SQL/C#/Markdown one-liners — tuned on dev,
  claimed only on a fresh held-out set built from new repos.

## 12. Privacy & storage (2026-10-24)

Checked against the EU ePrivacy rule (Art. 5(3) — per EDPB Guidelines 2/2023 it covers local storage and
caches, not just cookies) and the Brazilian ANPD cookie guide. Everything Marksage stores is strictly
necessary for something the user asked for — their document and Recent list, their settings, and the model
file only after they pick Local model — so **no consent banner is needed**, but users must be told clearly.
There are no cookies, analytics or third-party requests (system fonts only).

- First pick of Local model shows a short notice (385 KB download, kept in the browser, nothing you write is
  sent) with "Download and turn on" / "Cancel"; seen once (`marksage:model-notice`).
- About → **Privacy & storage**: what is kept and where, why there's no cookie banner, hosting logs note,
  **Remove downloaded model** and **Delete all Marksage data** (every `marksage:*` key + `marksage-*` caches).
- Theme is stored only when the user changes it (it used to be written on every load).
- Not legal advice — the hosting provider's own terms/logs still apply.

- 2026-10-24: the unused `LayaEngine` / `laya.worker.ts` scaffold and `PROMPTS` were removed (still in git history); Laya remains a documented option for future questions without training data.

## 13. Model v2 and smart-paste fixes (2026-10-24)

- **Smart paste:** new dev set (`pastes.dev.json`, 27 pastes, other sources). Fixed copied lists, CLI tables
  (rule rows, right-aligned columns), CSV with multi-line quoted cells / ragged headers, padded TSV, JSONC
  (```` ```jsonc ````). Held-out: 81% → 94% accuracy, 17 → 23 shown, precision 100%.
- **Model v2** (details: `training/README.md`): +45 training repos (dev/test frozen), temperature fitted on
  out-of-repo predictions from 5 repo folds (short snippets separately, 95% precision target), agreement
  hybrid with the heuristics. Measured once on a **fresh** held-out set (`fences.real2.json`, 284 blocks,
  67 new repos): heuristics 58.5% / 70 shown / 92.9%, v1 71.5% / 151 / 88.1%, **v2 74.3% / 158 / 91.8%**
  (145 right, 13 wrong). Shipped: beats v1 on everything; still ~1 point under the heuristics' precision
  on unfamiliar repos, so the mode stays opt-in.
- Vite ignores `training/data/**` (the dev server ran out of file watchers with the clones present).

- 2026-10-24: **two-option suggestion** (`fencePair`, model mode only): top-2 ≥ 85 % together, second ≥ 20 %, neither passing the gate → chips, Tab / Alt+2. Dev: 15 offers, 13 right-among-two; held-out real: 15/15; real2: 17/17.
