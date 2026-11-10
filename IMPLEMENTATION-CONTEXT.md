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
  `src/components/MarkdownPreview.tsx`. Full product spec: `PRODUCT-SPEC.md`.
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

## 14. Outline panel + section model (2026-10-24)

- **Idea (from Pablo):** a categorizer — "hovering blocks pre-analyzed, showing a summary, a category" — and
  later a whole-document analytics view. Decision: a side panel (Outline) instead of hover popups — hover
  can't work on touch and hides what you're reading; the panel lists every section at once, and hovering a row
  marks the heading in the preview. A bottom sheet on mobile. The Document tab (analytics) goes in the same panel next.
- **Ten types:** overview, setup, guide, reference, configuration, example, troubleshooting, changelog,
  contributing, license & credits. Heading rule first (EN + PT phrases, coverage ≥ half the heading, competing
  types cancel, version headings → changelog, navigation never typed).
- **Section model** (`sections-v1.bin`, 385 KB): same fastText recipe as the language model, new prose
  featurizer; trained on ~26k sections labelled by the strict heading rule, *without* the heading, plus an
  `other` class. First version without `other` looked fine on labelled data (87% when shown) but a hand check
  on untyped sections was ~2 in 3 — the real job. Adding `other` fixed it (~9 in 10). Held-out (133 repos, run
  once): 91.5% agreement at 0.8 (15% of sections typed), 87.1% from 0.6 (27%).
- **Lower gate for labels:** a badge edits nothing, so 0.6–0.8 is shown as a muted "Configuration?" badge.
- **Key sentence:** extractive (word overlap with the rest of the section), paragraphs before list items. No
  generated summaries — nothing to hallucinate.
- Shared training code moved to `training/fasttext.ts` (lang-v2 retrains byte-identically).
- Model cache purge is now per model family, so the two files coexist; the notice, About and the privacy list
  name both files.

## 15. Document tab (2026-10-24)

- Second tab in the Outline panel (Pablo's "analytics modal": readability, professional vs informal, the
  categorizer applied to the whole document). A tab, not a modal — it sits next to the text it describes.
- **Kind** (README / changelog / guide / reference / article / notes) = file name first, then the Outline's section
  types (needs ≥ 3 typed and ≥ 1/4 of sections), then shape (Step headings, list share, long prose). Reason shown.
  Tuned on real files: ripgrep README/CHANGELOG/GUIDE, typer README, our own docs. Numbered headings ("## 1.")
  are not steps; an underlined top title counts as a README intro.
- **Tone** = counted signals, shown: contractions at half weight (ripgrep's docs read "conversational" otherwise),
  exclamations, emoji (© ® ™ excluded), PT informal words; "conversational" needs ≥ 3 signals. Voice: you / we / I / impersonal.
- **Flags**: heading jumps, extra H1s (not in changelogs), empty sections, repeated headings under one parent,
  untagged code, images without alt, "click here" links, very long sections, sentences > 40 words. Click → jump.
- Word count matches the footer (whitespace words). Nothing stored; the tab is session state.

## 16. Docs diagram + code highlighting (2026-10-24)

- The ASCII architecture diagram had mixed arrows and predated the Outline. Measured options: Prism 37 KB gzip,
  highlight.js 51, Shiki 287 (21 langs), Mermaid ~930 total (≈ 630 actually loaded for one flowchart).
- Pablo chose **both** diagram styles with a reader switch: a generated, theme-aware SVG (two lanes: suggestions,
  Outline) as default, plus Mermaid lazy-loaded on demand. A stacked SVG variant serves phones. GitHub shows the SVG
  and the Mermaid version under <details>.
- **Highlighting:** Prism (refractor, ~30 languages) in the preview and the docs, lazy chunk ~30 KB gzip, colors from
  the theme (keywords = accent), copy button on every code block. Untagged blocks stay plain (Pablo: no auto-detect).
- Fixed on the way: the readability-dot `h2` override dropped `data-line`, breaking scroll sync / Outline jumps on
  those headings.

## 17. "How the two models work" page (2026-10-24)

- Pablo asked for a deep, from-zero explanation of both models (he didn't design them and hasn't trained models
  before). `docs/MODELS.md` + PT-BR, in-app at `#models` (About → "How the models work", and a link from the
  Smart Assist docs §4).
- One real snippet (`def greet(name): …`) traced through the shipped `lang-v2.bin`: 55 clues → slot 23,610 for
  `T:def` → 8-number average → logits (python 16.66) → softmax at T 1 (99.7%) vs calibrated 2.55 (82.7%) → gate.
  Also: real loss curve (1.31 → 0.06 over 8 epochs), int8 row of `T:def`, file layout, calibration before/after
  (210 shown at 87.6% vs 157 at 94.9% on dev), class weights, overfitting story, limits (`x = 1` → Python 97%).
- Two new single-column diagrams (inference, training) from `scripts/diagrams.py` (renamed from
  diagram-architecture.py), drawn + Mermaid like the architecture one.

## 18. Why decision models, in the docs + dogfooding (2026-10-24)

- Pablo: decision models were an option because of the recent releases (Laya, open weights), but the real reason is
  engineering — specialised models are cheaper, faster and contained. Added SMART-ASSIST §1.1 (generative vs decision
  vs our models: output, work per answer, size, latency, cost, failure modes, measurability, privacy) and §1.2 (the
  "smallest tool that works" ladder: rules → tiny trained model → general decision model → never generative).
  Kept Jev out of the docs (Pablo's rule); Laya is named.
- Ran the Outline + Document tab over our own docs: 9 untagged code blocks and several 40+ word sentences in
  today's text → fixed (blocks tagged `text`). Findings for later: SMART-ASSIST.md gets 0 typed sections (the 10
  types are README-shaped; explanation docs fall in "other"); the sentence splitter misses sentences starting
  with inline code.

## 19. Jev/Laya story, explanation type, docs Outline, model cards (2026-10-25)

- Pablo lifted the "no Jev" rule: docs now say Jev (TypeSafe AI, closed, Sept 15, 2026) popularised "decision
  models", Laya (Convai Innovations, Apache 2.0, Sept 18) is the open option, Marksage goes further with its own
  tiny models. Checked legally: factual nominative mention (plain words, no logos, no endorsement; BR LPI art. 132
  IV allows citing a mark in a publication without commercial connotation) + affiliation note.
- Ladder step 4 now: "generative or hosted — not used by the built-in features; optional BYOK coming, off by
  default". The old "a hosted model would break the promise" line was softened to "opt-in and clearly marked".
- **Explanation type:** heading rule yes; model no (0 right in two training rounds, incl. folder labels). Honest
  result documented in SMART-ASSIST §4.4, the model card and training/README.md.
- **Docs pages show the Outline/Document panel** over their own Markdown (desktop: open by default; mobile: sheet).
  "Open in editor" rejected by Pablo: docs must stay read-only.
- **Model cards** (MODELS §7) + `examples/marksage-models.mjs` (zero deps, Node/browser), parity-checked in the eval
  (0 difference on 1,010 inputs). Model-alone code numbers on real2: 74.3% / 51% shown / 92.5% right.
- Found: the repository has no LICENSE file, so nobody may legally reuse the code or the model files yet; the model cards have no license row until Pablo picks one.

## 20. Docs-vs-code audit, version history, roadmap (2026-10-25)

- Audited every number and rule in the in-app docs against the code and a fresh eval run: all eval tables,
  gates, timings (400 ms / 2 s), trigger rules and heuristic weights matched. Fixed: §2.1 "four features" (Outline
  and Document tab only read), §2.3 gate table missing the Outline row, smart-paste trigger (single-line JSON).
- New `docs/MODELS.md` §8 "Versions and test sets": every model version and experiment with the numbers it was
  measured at (lang v1, v2; sections draft, v1, explanation experiment) and every test set.
- Dates: the timeline follows git commit dates (São Paulo time). Earlier notes said 2026-10-23 for the real set
  and v1 (work dates from the session's notes); their commits — ccd7ca0, d425964 — are 2026-10-24.
- `ROADMAP.md`: BYOK (next, fresh session — Pablo's idea first), Laya as ladder step 3, dogfooding findings,
  small items, showcase. README updated (Local model, Outline, highlighting, docs pages, runner).

## 21. License (2026-10-25)

- Pablo chose **AGPL-3.0** (MIT felt too permissive): open source, and anyone running a modified Marksage as a
  website must publish their changes; as sole author he can dual-license later. `LICENSE` (official text via the
  SPDX list), `package.json` "AGPL-3.0-only", README section, model cards row, and an About "Open source" section
  with the GitHub link (AGPL §13: network users must be offered the source).

## 22. Polish round: Outline highlight, pointer cursor, start/end, named playground (2026-10-27)

- **Outline highlight blinking / wrong section** (Pablo: a far click flashed the previous section; on the playground,
  clicking section 1 lit the last one). Cause: the clicked section was pinned for 1.2 s only, so a longer smooth
  scroll, or a short page that can't bring the heading to the top ("scrolled to the end → last section" rule),
  took over. Now the pin holds until the reader acts (wheel, touch, pointer, keys on the page; the editor too in
  split view). Checked in Chromium: far jumps on a 4,700-word doc and every playground section, EN/PT, two sizes.
- **Pointer cursor** on every clickable element (base-layer CSS: buttons, tabs, menu items, summary, labels…).
- **Start / end buttons** (`ScrollJump`): bottom-right of the preview, the split view's preview pane and the docs
  pages; only on documents ≥ 1.8 screens; each hides at its own end. Stores nothing.
- **Playground has a name:** `smart-assist-playground.md` / `playground-smart-assist.md` instead of "Untitled";
  it opens clean (nothing of the user's to lose until edited). It's the only document the app offers.
- **"Segurança" typed as License & credits:** the heading rule had `segurança` and `security policy` under legal.
  Removed both (+ 3 fixture cases, 48 total). The section model wasn't the cause (see training/README.md).
- Discussed, not built: more section types — corpus counts for security, performance, deployment, glossary,
  roadmap; meeting-notes types would be heading-only (no such docs in the corpus).

## 23. Five new section types, sections-v2, whole-section hover (2026-10-27)

- **Hover:** hovering an Outline item tints the whole section in the preview (one box from the heading to the next
  Outline heading, behind the text, with an accent bar), not just the heading.
- **New types** (picked from heading counts over the 381 cloned repositories): security, performance, deployment
  (heading rule + section model), glossary, roadmap (heading rule only, too rare: 76 / 57 headings). 16 types in
  all, 13 the model answers (`HEADING_ONLY_TYPES`). Icons: ShieldCheck, Zap, Rocket, BookA, Milestone. PT labels:
  Segurança, Desempenho, Implantação, Glossário, Roadmap. Broad words (Production, Hosting, Todo, Definitions,
  Optimization, Profiling) only count as the whole heading. Heading fixtures 65.
- **sections-v2.bin** (394,008 bytes), v1 settings re-chosen on dev, test run once: 13.5% typed at 88.9%
  agreement (v1 on the same set: 14.5% / 89.6%); security 34/38, performance 45/60 (weakest), deployment 2/2.
  The model cache replaces v1 by itself (same family). Numbers in training/README.md, MODELS §7–8, SMART-ASSIST §4.4.

## 24. Suggestions tab, icons by kind, ✦ for model calls (2026-10-27)

- Hover tint: the accent bar on its left was removed (Pablo: it also crossed the readability dot).
- **Suggestions tab** (third panel tab, documents only — not the read-only docs pages): every code block without a
  language and every near-miss heading/list, computed with the editor's own per-spot functions
  (`listFenceSuggestions`, `listStructureSuggestions`), 600 ms after typing stops, count on the tab. The panel never
  edits: a click opens the editor, puts the caret on the spot and shows that suggestion in the bar (pinned while
  the caret stays there). Pastes aren't listed. Panel width 18 → 20 rem so three tabs fit in Portuguese.
- **Icons by kind** (`suggestionIcons.ts`): code language → Code2, table → Table, list → List, numbered → ListOrdered,
  JSON → Braces, heading → Heading. **✦** when the local model decided (`Decision.by`: `model`, or `agreement`
  when the rules were confident and the model's top pick agreed — tooltip says which).
- Pablo declined meeting-notes types: too specific a document to rely on as a pattern. Marksage's assist targets
  technical writing (docs, READMEs, project context); the editor itself is general Markdown.

## 25. Show where, tint vs dot, dismissals reset, livelier Document tab (2026-10-27)

- **Show where** (target icon) on the suggestion bar: scrolls the editor to the spot without moving the caret (so
  the suggestion stays) and flashes the block in the split view's preview (accent ring, 1.5 s).
- **Hover tint vs readability dot:** the tint now extends 26 px each side (capped at the content padding), so the
  dot (10–16 px left of an `##`) sits inside it instead of on its edge.
- **Bug:** after Esc, turning Smart Assist off and on didn't bring suggestions back — dismissals lived for the whole
  session. A mode change now clears them (and any pinned/paste suggestion).
- **Document tab:** an accent icon per block, the "looks like" answer in accent, a 5-step readability scale in the
  same colors as the preview dots, a formal ↔ conversational scale for tone, accent counts on section types and
  "worth a look" (total in the block header).

## 26. Minimal pass on the Document tab and the suggestion card (2026-10-27)

- Pablo found §25's Document tab too busy: kept the block icons and the accent "looks like" answer; removed the
  readability and tone scales and the accent counts.
- "Show where" is no longer a button: the whole suggestion card is the target (accent border on hover, tooltip);
  Accept, the two choices and dismiss keep their own action.
- Follow-up (2026-10-28): the flash ring is 1 px (75–80% accent so it still reads) and eases in (~0.3 s), holds
  (~0.6 s) and fades out (~1.2 s) — 2.1 s in all, between the first 1.5 s and a too-long 2.4 s try.

## 27. Lone "-item" lines (2026-10-28)

- Pablo: the playground's "-this should be a list item" never got a suggestion. By design a lone `-line` scored
  0.72 (below the 0.8 gate: "-verbose", "-5", "-su cd: …" are not items), so the playground promised something
  the rules refused. Now a lone `-` line of plain prose (≥ 3 words, a word of ≥ 2 letters right after the dash,
  no `/ : = $ \` { } < > |`, not indented as code) scores 0.82. Dev and real sets unchanged (no such lines in
  them); +3 written cases (structure 26: the playground line, the real "-su cd: …" shell output, "-verbose").


## 28. Structure / paste models tried, Hybrid mode, new near-misses (2026-10-28)

- **Plan (ROADMAP §0):** a third model for structure hints and a "Local models only" mode. Pablo's decisions
  along the way: no models-only mode after all (readability and the heading rule have no labels a model could
  learn from but their own output; the trained models didn't beat the rules) — modes are **Off / Heuristics /
  Hybrid** ("Local model" renamed; stored value still `model`); try bold lines in the model; also try a
  paste-type model, the URL-paste idea (rules first) and the pattern-hunt items below.
- **Corpus rebuilt** at the manifest commits (`collect.ts` now pins clones; `--fresh` for HEAD). Pablo's
  hypothesis confirmed: in the docs a line starting with a CLI flag is written as code 6,539 times vs 110 bare;
  in issues the bare `-word` lines are list items missing the space, signatures and unfenced `ls -l` output.
- **Pattern hunt** (counts over docs / issues / wikis): lone URLs (12% of issue bodies), typographic bullets
  (459 lines in 48 issue bodies, mostly job posts), `1- item`, `[text] (url)`; letter lists, unfenced code,
  checkbox near-misses, `** x **` and `'''` fences were rare or not fixable.
- **Shipped (rules, both modes):** new structure kinds `list-glyph` (`• – ✔️` → `- item`, a check mark kept),
  `ordered-dash` (`1- item` → `1. item`), `link-space` (`[text] (url)` → `[text](url)`, Link icon, "Fix this
  link?"); rule fixes tuned on dev: hashtag-only lines, issue refs and `#include`/shebangs aren't headings, `ls -l`
  permissions aren't items, bold captions over images and bold identifiers aren't headings, `=== ===` separators,
  glyph separator bars and `— Name` signatures, neighbour counting that ignores `**bold**`/`--flags`.
- **New sets:** `lines.dev.json` 36 → 212 (issues of 20 repos + 16 wikis), `lines.real2.json` 227 (issues, PRs
  and comments of 43 fresh repos, frozen), `pastes.real2.json` 53 (19 real sources, frozen). The eval reads a
  case's `line` when present.
- **Structure model v1** (clue reader 3, 66k lines): held-out 227 — rules 140 shown / 88.6% / 124 true; model 76 /
  90.8% / 69; rules + model ≥ 0.95 (chosen on dev) 141 / 88.7% / 125. Met the bar by one line; Pablo: don't ship,
  document. Rules and model miss different lines → v2 idea: agreement, on a fresh held-out set.
- **Paste model v1** (clue reader 4, 17k pastes): held-out 53 — rules 41 / 97.6%; model 44 / 90.9%. Not used.
- **URL paste → `[text](url)`:** only GitHub issue/PR links got the author's text on dev (89.8%); held-out
  32.4% (projects differ: "BUG #523", "Pull Request", titles). Not shipped; no model (the missing piece is the
  page title, which needs the network).
- Docs: SMART-ASSIST §1.2–1.3 (modes table), §3 (new kinds and rules), §4.6 (tried, not used), §5 (fresh sets);
  MODELS §8.3–8.5; About (modes table, structure hints text); README table; training/README.md; AGENTS.md.

## 29. Launch QA pass and fixes (2026-10-28)

- **QA:** one scripted Chromium pass playing five first-time users (impatient, skeptic, mobile 375 px on slow 3G,
  non-native English, breaker) over a production build, plus Pablo's own finds on his phone. Merged list ranked by
  how many personas hit each issue. Pablo kept icon-only header buttons as they are.
- **Docs pages (Pablo, phone, production):** "How it works" didn't open on slow 3G — a failed lazy chunk unmounted
  the whole app (no error boundary) and stayed failed until reload. Now `PageLoadBoundary` (Back / Try again →
  reload), a visible loading state, prefetch while About is open, and one chunk per language (70 → ~38 KB gzip).
- **Back (Pablo):** About → "How the models work" → Back went to "How it works" (hard-coded parent, and Back pushed
  new entries). Now history-aware (`{ ms, from }` in `history.state`): Back = browser Back when opened in-app.
- **Lost text:** the 300 ms save debounce had no flush on unload → saves on `pagehide` / `visibilitychange`; New
  saves at once.
- **First run:** empty clipboard says so; an unreadable clipboard opens a new document with a paste placeholder;
  "Start writing" on the start screen; touch copy ("Open or write Markdown", no drag & drop, no Ctrl+V); a Smart
  Assist line and a Privacy & storage link (`#privacy`). Smart Assist now starts in **Rules**; modes renamed
  Off / **Rules** / **Rules + AI** (Pablo wanted "AI" in the name; stored values unchanged); docs, README, About,
  diagrams (`scripts/diagrams.py`) updated EN + PT.
- **Typing lag:** 270 KB / 400 sections, extra ms per key (2-vCPU container): before 378–587; after 19–44. Causes:
  the whole preview re-parsed per key, a new `[]` from `useSmartAssist` (Off) defeating memo, word count and the
  Outline re-reading every section. Fixes: deferred + memoized preview rendered in pieces at headings
  (`lib/chunks.ts`, identical HTML), `CodeBlock` memo + highlight cache, per-section Outline cache, deferred count.
- **Polish:** Markdown extensions (`.mdx` — Pablo: allow; `.mdown .mkd .mkdn .mdwn`), `.txt` refused (Pablo),
  renamed binaries refused; copy button no longer covers code on touch; boot screen in `index.html`; empty preview
  placeholder; Suggestions badge "50+" when capped; theme double-click no longer loses a click (the second click
  hits the root during the view transition); Document tab says "Not detected" for languages other than EN/PT
  (stopword coverage < 14%); privacy text names who runs the site and drops the "no server" contradiction.
- Checks: `tsc`, lint (no new warnings), `eval:assist` identical apart from timings, scripted browser checks for
  every fix.

## 30. Rename, and Export asks for a name (2026-10-29)

- Pablo asked for renaming (clicking "/ Untitled" in the header, or when exporting) and whether ⌘S → export is
  right. ⌘S is a save reflex; Marksage already autosaves in the browser, so mapping it to an instant download
  piled up `document (3).md` files. Now ⌘S (or the Export button) opens an "Export as" panel with the name
  selected; ⌘S again or Enter downloads. The name — the document's, or kebab-case from its first heading — also
  becomes the document's name (Recent follows). Header name: click to rename, Enter keeps, Esc cancels; the
  name part is selected, `.md` is added unless a Markdown extension is there; unsafe characters become `-`.
- Phones have no name in the header (no room), so the Export panel is where they rename.
- Open idea for later (not decided): with the File System Access API (Chrome / Edge), a file opened from disk
  could be saved back in place on ⌘S.

## 31. Export button, rename box, read-only docs, Mermaid errors (2026-10-29)

- Export: with the panel open, clicking Export again downloads and closes it (like ⌘S twice). The header rename box
  is sized in `ch` (monospace), so it ends right after the name instead of leaving a gap.
- Docs pages read-only (Pablo): the header shows a disabled "Read-only" where Edit was; About and the docs hide
  the open document's controls (name, Assist, Edit/Preview, Copy, Export, ⌘S, ⌘⇧C). A **Copy Markdown** button
  copies the page source — Pablo suggested it; it keeps the earlier "no open in editor" decision.
- Mermaid "stopped working" (Pablo): not reproduced — Chromium renders every docs diagram (production and dev,
  EN and PT, desktop and 375 px, light and dark). The failure path switched back to "Drawn" silently, which
  looks exactly like a dead button when the ~650 KB download fails (phone network, an old tab after a deploy) or
  a browser can't draw it. Cause found: Pablo's local server had stopped, so the Mermaid chunk couldn't load —
  no bug in Mermaid itself. The visible message (Try again + console log) stays: it's what makes that case obvious.

## 32. Launch QA fixes (2026-10-30)

Fixes from the five-persona launch QA report (impatient, skeptic, mobile, non-native + PT-BR, breaker), one commit each.

- **Suggestions tab hid untagged blocks (#1).** It listed only blocks that passed the gate, but its empty message
  said "no code blocks without a language" while the Document tab counted one (`SELECT * FROM t;` scores SQL 75 %,
  under the 0.8 gate). Pablo chose a pick over a plain wording fix: blocks no language passes the gate for are now
  listed as *not sure* and open the bar with the engine's top two languages + *Plain text* (`text`). Tab only —
  never offered while typing, so the gate keeps its meaning in the editor. Two, not three (Pablo felt four buttons
  were too many; measured on the 920 fixture blocks): the right language is in the top 1 / 2 / 3 for 49 / 58 / 62 %
  of unsure blocks in Rules and 61 / 77 / 83 % in Rules + AI, while 7–13 % of unsure blocks are plain text. The
  bar's choices wrap on narrow screens and `Alt+2` / `Alt+3` pick the others. Empty message reworded to what it can
  honestly claim. Same block, different modes: `SELECT * FROM t;` is SQL 75 % in Rules (unsure) but 100 % ✦ in
  Rules + AI, where the model is sure.
- **Export (#2).** The two-step panel stays (Pablo's §30 call), but it now behaves: ⌘S inside the panel downloaded
  and the panel opened again at once, so every ⌘S after the first downloaded another copy. The input's handler
  closed the panel, React flushed the update and re-subscribed App's window listener with `exportOpen = false`
  before the same event reached `window`, and that listener opened it again. Fixed with `stopPropagation()` on that
  ⌘S. The panel has a visible close (×, "Cancel (Esc)"), and after a download the Export button says
  "Downloaded" for 1.6 s (like Copy's "Copied"), with a polite live region for screen readers.
- **`#Heading` hints (#3).** About promises "`#Heading` without a space", but two rules hid the obvious cases. The
  colour check (`#fff`) matched any 3–8 hex letters, so `#Bad heading` — "Bad" is hex — counted as a colour;
  now a colour needs a digit or a lowercase 3/6-letter hex word. And every one-word `#X` was a hashtag; now a
  capitalised word (`#Installation`) is a candidate, judged 0.85 when it stands alone (blank line before, no
  hashtags around) and 0.55 otherwise. No change on any F3 set (authored, dev, real, real2 — same numbers);
  five authored cases added for both rules.
- **Name on phones and narrow desktops (#4).** Phones still have no name in the header (§30), but the ⋯ menu now
  starts with "Rename…" showing the name (and `*`); it opens a panel under the header, same rules as the header
  box (Pablo picked this over a name in the bottom bar). On desktops the toolbar crowded the name out — at 768–900 px
  in PT-BR it got 4 px. Copy / New / Open now show their labels from 1280 px, Preview/Edit and Export from 1024 px
  (icons + tooltips below), so "Sem título" keeps 80–88 px from 768 px up.
- **Suggestion card's dismiss (#5).** It was a bare `Esc` key cap plus a 14 × 14 px ×, with "Dismiss" only in the
  tooltip, and phones have no Esc key. Desktop now reads "Dismiss `Esc`", like "Accept `Tab`"; phones get a
  36 × 36 px × and a 36 px-high Accept (choices too). The percentage's tooltip says "How sure Smart Assist is"
  instead of "Engine confidence".
- **Logo and scroll labels (#6).** The logo said "Back to Marksage" everywhere, but it only does something on About
  and the docs pages — on the editor a "Back" that does nothing read as broken, and on the docs it was taken for
  the page's Back (which goes to About). It's now a button only there, labelled "Back to your document" or "Back to
  the start screen"; elsewhere it's just the brand. The preview's "Back to the start" (scrolls to the top) read
  like "go to the start screen": now "Scroll to the top" / "Scroll to the end" (PT "Ir para o topo" / "Ir para o fim").
- **Model download status (#7).** Progress ("Loading local model… 42 %") and failure lived in the Assist button's
  tooltip — on failure the button still said "Rules + AI", with a 6 px orange dot; phones never see a tooltip.
  Pablo chose the button itself: while loading it reads "Assist: 42 %" with a thin progress line along its
  bottom edge (phones too, where it's icon-only); on failure it reads "Assist: Rules" in amber with a warning icon,
  and its menu opens with "Rules + AI couldn't download — using Rules for now" and **Try again**
  (`useSmartAssist` → `retry()`, which re-runs the engine lifecycle).
- **Typing in the preview (#8).** Opened and pasted files stay read-first (Pablo's call), but typing into the
  preview did nothing. Now a printable key there switches to the editor and keeps the keystroke — at the end of the
  block last clicked in the preview, else of the first block in view — through `execCommand('insertText')`, so ⌘Z
  takes it back. Space still scrolls; ⌘/Ctrl/Alt shortcuts, inputs and the docs pages (read-only) are untouched.
- **"Heuristics" left in the UI (#9).** The modes were renamed Rules / Rules + AI on 2026-10-28, but three tooltips
  and the "Models removed" message still said "heuristics" (EN + PT). All say "Rules" now; code and docs keep
  "heuristics" where they mean the implementation (`HeuristicEngine`, stored value `heuristics`).
- **"Delete all Marksage data" kept the document (#10).** It cleared storage and reloaded, and the reload's own
  `pagehide` flush (the one that stops a reload from losing typing) wrote the open document and Recent straight
  back — after the page promised to clear what the browser keeps. `deleteAllLocalData` now sets a `wiped` flag that
  `saveDocument` and Recent's `persist` honour until the reload; verified: only the start screen and an empty
  Recent come back, and saving works again after it.
- **Images from the web (#11).** `![](https://…)` was fetched as soon as the preview rendered, sending the reader's
  IP, browser and Marksage's address (Referer) — a downloaded `.md` could carry a tracking pixel, against "nothing
  you open or write is sent anywhere". Pablo chose: off by default, with a setting in About → Privacy & storage
  ("Load images from the web", `marksage:remote-images`), and a bar above the preview — "This document loads N
  images from other websites — not loaded, to keep your reading private" — linking to it. Blocked images show a
  dashed placeholder with their alt text and host; allowed ones load with `referrerpolicy="no-referrer"`. Images
  inside code, relative paths and `data:` URLs are untouched. Verified: no request leaves the app with it off.
- **`#anchor` links (#12).** Every preview link had `target="_blank"`, so `[x](#install)` opened a new tab — and
  `[x](#about)` opened the app's own About in it. In-document links now scroll the preview: an element with that id
  (footnotes), else the heading with that GitHub-style slug (repeats get `-1`, `-2`…). The page's hash is never
  touched (it's the app's navigation); `#` alone does nothing. Smooth unless reduced motion.
- **Silent save failures (#13).** `saveDocument` swallowed a refused write, so a file of ~2.5 M chars or more, or a
  full storage, lost work on reload with no word. It now returns false and `useMarkdownFile` shows "This document
  couldn't be kept in the browser — export it" once, until a save works again. And an opened, unchanged file no
  longer stores its text twice (`savedContent` is left out when equal — `loadDocument` already fell back to
  `content`): the 2.7 M-char case from the QA now survives a reload; 6 M chars shows the warning.
- **Two tabs (#14).** Reloading a stale tab wrote its old copy over another tab's newer save: the leave-the-page
  flush saved even when that tab had changed nothing. A tab now writes only when its document differs from what it
  last wrote or read. Pablo chose sync + conflict on top: a tab with no changes of its own follows another tab's
  save live (`storage` event); when both changed the same document, a bar says "This document changed in another
  Marksage tab" — **Use that version** (this tab's text stays in Recent as its own entry) or **Keep mine** (saved
  over it; the other tab, if idle, follows). Saves pause while the bar is up.
- **Big files (#15).** A 20 MB file took ~9 s to show and crashed the tab on Edit; 3 MB froze ~10 s on Edit. Pablo
  chose: over 5 M characters a document opens read-only — preview only, no Edit (a "Read-only" mark in the header),
  Smart Assist off, not kept in the browser or Recent, Export still works — with a note above the preview; from 1 M
  a dismissible "editing may be slow" note (`lib/file.ts` `LARGE_DOC_CHARS` / `READ_ONLY_DOC_CHARS`). Profiled the
  3 MB freeze: ~7 s is layout forced by the editor's focus — the split view re-renders and lays out the whole 3 MB
  preview a second time (a plain 3 MB textarea focuses in ~0.6 s). The cheap fix would be `content-visibility:
  auto` on the preview's pieces, but scroll sync and the Outline measure those blocks, so it's left as a follow-up.
- **Big tables froze the page (#16).** A 20 × 2,000 table blocked ~25 s, but not in rendering: profiling put ~6 s of a
  20 × 1,000 case in the Markdown parser — `micromark-extension-gfm-table` 2.1.1 searched its edit list linearly
  for every cell (quadratic). 2.1.2 (2026-09-11) indexes it: 20 × 1,000 now blocks ~0.8 s, 20 × 2,000 ~1.7 s.
  On top (Pablo's option B): a table with more than 200 body rows shows the first 200, then "Showing 200 of N rows ·
  Show all N rows · A table this big can make the page slow." (`BigTable` in MarkdownPreview). Show all on 2,000
  rows takes ~1 s.
- **Rules + AI weaker than Rules on clear short code (#17).** `const x: number = 1; function add(a: number…)`:
  rules ts 99 %, model js 63 % → nothing shown. Per-clue attribution on `lang-v2.bin` (Pablo asked why before
  any change): `: number` +192 toward TS, `) :` +188, `number` +100 — 5 of 70 clues; the other 65 lean JS
  (`+` −108, `function` −80, `;`, short names), and the bias starts JS +1.95; short snippets use T = 2.55. Mean
  pooling dilutes the decisive clues. Of the 13 fixture TS blocks with clear type syntax the model gets 12; the
  weak spot is short snippets. Shipped: a rules answer ≥ 99 % stands when the model is unsure and disagrees
  (`RULES_OVERRIDE` in hybrid.ts; no ✦) — dev 157 → 158 shown at 94.9 %, held-out sets unchanged. The general
  fix — mean + max pooling for near-superset pairs (TS/JS, C++/C…) — is ROADMAP §4.1, framed generally on
  Pablo's question of how a TS-only tweak would read to engineers.
- **Mermaid "Try again" (#18).** After the ~650 KB download failed (offline, a dropped phone connection), Try again
  re-ran `import('mermaid')`, which the browser answers from its memory of the failed import — it never recovered,
  even back online. A download failure now offers "Reload the page to try again" (the docs pages already reload
  for the same reason); a drawing failure keeps the plain Try again. Verified: blocked → message → reload → the
  diagram renders.
- **Suggestion bar over the last lines (#19).** On a phone the bar sat over the editor's last lines and took their
  taps. While it shows, the editor gets 112 px of room at the bottom, and if the caret's line would sit under the
  bar it scrolls up (skipped past 200k characters, where measuring wrapped lines would stall typing).
- **Tap targets (#20).** On phones many controls were 17–36 px (header icons 36, Outline tabs and close 28, docs
  table of contents 20, Copy code 28, Drawn/Mermaid 25, Try again 22). On touch screens (`pointer: coarse`) they're
  now at least 40 px — header buttons, tabs, Copy code, the diagram switch, and controls marked `.tap` (About/docs
  Back, docs Copy/Outline and contents, Outline close, Export Download, the start screen's three buttons, Mermaid's
  retry). Desktop is unchanged; the 375 px header still fits.
- **Mermaid on phones (#21).** At 375 px Mermaid fitted both flowcharts side by side with 5–6 px labels. Below
  600 px the Mermaid figure now keeps a 640 px drawing (≈ 15 px labels) and scrolls sideways; the drawn SVGs already
  had narrow versions. On slow connections the loading line now says what's coming: "Loading Mermaid (about
  650 KB, once)…" — the tooltip that said so never reaches a phone.
- **Silent on a lone line (#22).** Structure hints skip the line being typed, so a document of one `#Meeting notes`
  line — or the line you just finished, caret still on it — never got a hint, and the first try read as "Smart Assist
  is broken". After a 2 s pause with nothing else to suggest, the caret's own line is now eligible (structure only;
  never inside a code block). Typing continuously still shows nothing.
- **Wording a newcomer can follow (#23, #24).** The `*` said "Unsaved changes" while About says the text is
  autosaved and `*` means not exported — now "Not exported yet — your text is kept in this browser". The Document
  tab's "Looks like" (PT "Parece") is "Document type"; the Outline footer's "types sections from their text" reads
  "reads the text to tell what a section is"; About says "a code block (```)" instead of "a ``` block". The icon
  style named "Outline" collided with the Outline panel: it's "Line" now, and icon names are translated (PT
  Clássico, Mono, Linha, Pôr do sol). The docs' technical terms (noul, LIX, held-out sets) stay — they're explained
  where they appear, for curious readers.
- **Paste without clipboard access (#25).** When the browser won't let Paste read the clipboard, the new document's
  editor placeholder already said "press Ctrl/Cmd + V to paste here", but on desktop the eye lands on the preview
  pane, which said "The preview shows up here as you type." The preview pane now shows the same hint.
- **PT-BR and shortcut hints (#26).** Tooltips said "Ctrl/Cmd + S" whatever key style was picked in About; they now
  follow it (`shortcut()` in `lib/keyStyle.ts`: "⌘S" or "Ctrl + S"). The browser tab's title follows the language
  ("Marksage — editor de Markdown"). PT wording: "Dispensar" → "Ignorar" everywhere (UI, About, docs, sample);
  "Dicas de estrutura" → "Dicas de formatação", since "Estrutura" is the Outline panel's name; "prévia" →
  "pré-visualização"; "pressione" → "aperte"; "botão de brilho" → "botão ✦"; "Vale uma olhada" → "Vale conferir";
  "um `paste`" / "uma `edit`" explained in Portuguese; percentages written "97%" (no space) in all four docs, as
  in the UI. "Assist" and "Smart Assist" stay — product names.
- **Language count (#27).** The code model answers 21 ways: 20 languages + "plain text / not code". About said
  "TypeScript, Python, Bash, SQL and ~17 more" (21) and MODELS "21 languages" / "outside the 21"; all now say 20
  languages ("and 16 more"), matching "20 languages + plaintext" in How it works. "21 answers" stays — it's right.
- **License, served and linked to its exact source (#28).** About summarised AGPL-3.0 and linked the repository's
  default branch; `/LICENSE` returned the app's page. The build now serves the license text at `/LICENSE.txt`,
  and About links the commit the build came from (`git rev-parse HEAD` at build time → `VITE_SOURCE_COMMIT`;
  without git, the repository) and says SPDX `AGPL-3.0-only` — AGPL §13 asks for the source of the version people
  use over a network. Build from a clean, pushed commit so the link resolves.
- **Encodings and hidden binaries (#29).** A Latin-1 file opened as "T�tulo" and Export saved the damage; a file
  whose first NUL came after 8 KB passed as text. Files are now decoded from their bytes: UTF-16 with its byte-order
  mark, else UTF-8, and when the bytes aren't valid UTF-8, Windows-1252 (Latin-1's superset) — "Título" stays
  "Título" and exports as UTF-8. The NUL check covers the whole file. Verified on the QA fixtures: Latin-1, UTF-16
  and UTF-8 BOM open correctly; NUL-after-8 KB, PNG, random bytes and BOM-less UTF-16 are refused.
- **Dropping several files, or text (#30).** A drop opened `files[0]` and said nothing: `.txt` + `.md` was refused
  outright, three `.md` files opened one silently, and dropped text did nothing. Now the first Markdown file among
  the dropped ones opens, with a short note when others were left out ("Marksage opens one file at a time…" — a new
  neutral, self-dismissing notice, not the red error), and text dropped outside the editor opens like a paste
  (on the editor the browser inserts it, as before).
- **Paste conversions keep their line break (#31).** The converters return trimmed blocks, so after accepting a
  pasted list, table or code block the next thing typed landed on its last row or the closing fence. The paste's
  own trailing line break(s) are now kept.
- **Empty files (#32).** An empty `.md` opened to a blank page in the read-first preview. It now says "This document
  is empty — start typing to write in it." (typing there opens the editor, #8).

- **"The button below" (#33).** Privacy & storage said "the button below clears what this browser keeps", but once
  models are downloaded two buttons sit below it. It names the button now: "Delete all Marksage data".

- **Link previews (#34).** `og:image` / `og:url` come out relative when `VITE_SITE_URL` isn't set at build time
  (the QA build didn't set it), so shared links show no image. The build now warns when it's missing; the value
  itself is a deploy setting (`.env.example`).
- **Hash and Esc (#36).** `#ABOUT` in capitals was ignored, and Esc didn't leave About. Hashes are read
  case-insensitively, and Esc on About or a docs page does what their Back does — unless a menu, panel or field has
  it. An unknown `#junk` still lands on the app, as before.
- **Slow first load (#35) — not fixed, planned.** On slow 3G the start screen took ~8 s: one 590 KB script (~180 KB
  gzip) with everything, though the start screen needs little of it. Splitting the editor, preview and Smart Assist
  into their own chunk changes how a stored document opens for returning visitors, so it's ROADMAP §4 with the
  measurements to take — next to the preview-layout follow-up from #15.

That closes the launch QA report: 36 findings — 35 fixed in their own commits (#16 in two), #35 planned.
- **`npm audit` (after the QA fixes).** 4 advisories, none in code users run: Vite 8.2.x (dev server — cross-origin
  script via custom middleware, files outside `server.fs.allow`, `launch-editor` on Windows) and `source-map-js`
  (build-time DoS) were high; KaTeX < 0.18.2 via Mermaid (prototype pollution bypassing its trust option) low —
  Mermaid only draws Marksage's own docs, in strict mode. `npm audit fix` (lockfile only): Vite 8.3.5, source-map-js
  1.2.2, Mermaid 12.2.0, KaTeX 0.18.10 — 0 advisories; build, eval and the docs' Mermaid diagrams checked.

## 33. The story page (2026-10-30)

- Pablo asked for the project timeline planned "after the model work" as a showcase for engineers and tech recruiters,
  in the app at `#story`, linked from About ("The story: the decisions and models behind Marksage"). His choices:
  neutral voice ("Marksage…"), strict date order, only the main architecture decisions and the AI models — no
  rename, translation or UI polish entries — and the launch QA's simulated users named as AI agents, explicitly.
- Eleven entries: local-first (Aug 14), decision vs generative models and the smallest-tool ladder (Sep 25, the
  case study), the engine contract + gate (Sep 26), the code model v1 and v2 (Oct 24), the section model, AGPL + storage page (Oct 25),
  the models that didn't ship (Oct 28), chunked preview (Oct 29), the five-agent launch QA (Oct 29–30), next.
  Numbers from MODELS.md / training/README.md; each entry links to the docs section with the detail.
- `StoryPage.tsx` + `lib/storyContent.{en,pt-BR}.ts`, lazy like the docs (~3 KB gzip per language), same Back /
  Esc / Try again behaviour; a docs page opened from the story says "← The story".
- Pablo's review: the timeline shows month and year, the exact day(s) on hover (`<time title>`, Intl `formatRange`
  for ranges); dates are ISO in the content, so the order is checkable — it caught two slips (the decision-models
  entry is Sep 25, the case study, so it now comes before Smart Assist; the five-agent QA ran Oct 29–30). The rail
  is one segment per entry and the dots are centred on it (line 7–8 px, 11 px dot from 2 px) with a ring of the
  page colour, so the line no longer shows past their edge.

## 34. Line numbers, footer facts, the document bar, "Technical docs" (2026-10-30)

- **Line numbers** (`MarkdownEditor.tsx`): a hidden mirror of the text, laid out at the textarea's `clientWidth` with
  the same font/padding classes (`TEXT`), puts each number at the first row of its line, so wrapped lines get one
  number. Numbers are `::before` content in the gutter (`.line-mirror` in `index.css`); lines are rendered in
  memoized pieces of 200, so typing re-renders one piece. Scrolling: first a scroll listener set the transform, and
  the numbers visibly trailed the text (Pablo: "they move independently") — the textarea scrolls on the compositor,
  the listener's transform lands a frame later. Now a scroll-driven animation (`animation-timeline` on the
  textarea's `scroll-timeline`, `0 → -max px`, `--scroll-max` kept current by a layout effect / ResizeObserver /
  input) moves the mirror in the same frame; the listener is the fallback (Firefox without the flag). The textarea
  doesn't rubber-band (`overscroll-none`): the macOS bounce moved the text but not its scroll position.
  Gotcha: the mirror must come after the textarea in the tree — React attaches refs in tree order, so a layout
  effect in an earlier sibling sees `textareaRef.current === null`.
  The caret's line number is brighter (selectionchange + input events).
- **Footer**: lines · words · characters (hidden on phones) · UTF-8 size (what Export saves), all on the deferred text.
- **Document bar** (`DocBar.tsx`): the docs pages' bar (type, Copy Markdown, Outline) on every rendered document
  (preview mode and the split view's preview pane). The type is the Document tab's `computeDocStats().kind`
  (`useDocKind`, recomputed 400 ms after typing stops, off past 400k chars); no type → the file name. Click → the
  panel's Document tab. `useOutline` builds items with the panel closed too (fourth arg `panelOpen` gates the
  section-model download, so Privacy & storage stays true). Header Copy / Outline kept for now — open question
  whether to drop them on desktop.
- **Why the docs said "No clear pattern yet"**: the document type is a rule over the Outline's section types, not a
  model. SMART-ASSIST.md had 1 typed section of 27 and MODELS.md 1 of 31 — their headings name their own topics
  ("The confidence gate"), the section model abstains on them (explanation is heading-only), and there was no
  "technical docs" kind at all. Added `docs` (`DocKind`): by file name (architecture, design, internals, docs,
  spec, adr), by section types (≥ half explanation/reference/config/performance/security), or by shape (≥ 800
  prose words, ≥ 8 sections over ≥ 2 levels, tables + code blocks ≥ 3, lists < 50 %). Checked on the repo's own
  Markdown: both docs pages (EN + PT), training/README and this file → docs; README (by name), ROADMAP (article),
  the product spec (notes) unchanged. Tuned only on these files — a trained document-type model needs a real
  held-out set (labels could come free from repo paths: README, CHANGELOG, docs/…).
- **Outline hover in split view**: square, edge to edge across the preview pane (`.outline-hit-box.is-flush`).

## 35. Code-language model v3: mean + max pooling (2026-10-30) — tried, not used

- Brief: ROADMAP §4.1. Pablo's decisions (asked first): choose on **dev + repo-fold CV** (out-of-repo predictions
  of 5 repo folds of train — dev has only 30 TS/JS, 21 C++/C, 23 C#/Java blocks); a **third held-out set**,
  bigger and weighted toward the pairs; pooling variants and the bar explained to him before he decides.
- Data rebuilt in a cloud workspace from the manifest: 272,506 blocks from 309/310 sources (gitpod-io/website was
  already missing at v2 time — not in the manifest), train 64,288 (v2's file says 63,751; to check against a
  retrain of the v2 recipe).
- `fences.real3.json` built and frozen before any training: 842 blocks from 158 repos (training/README.md,
  "Third held-out set"). `jsonc` / `json5` are labelled `json`, so "JSONC vs JSON" is measured as the
  `json-comments` subset. Not in `npm run eval:assist` until its one run at the end.
- **Training max pooling** (tuning data only): at v2's settings the clue numbers grew ~170× and raw scores reached 10⁵
  (overconfident even at T = 40); mean + max + min went to NaN. Two training knobs fixed it: `--emb-clip` (clue
  numbers bounded) and `--pool-lr` (smaller step for the max part, which sends a whole update to one clue).
- **Label finding:** only 42% of `ts`-tagged training blocks have any TypeScript-only syntax (2 of 15 on dev) — the
  rest is untyped code, valid JavaScript. TS/JS mistakes are mostly undecidable from the text (`training/pairSyntax.ts`
  marks the decisive-syntax blocks for the report).
- **v2 can't be rebuilt exactly:** today's pinned collection gives 64,288 training blocks (v2's file: 63,751) and a
  v2-recipe retrain scores 77.1% dev accuracy (seeds: 76–77%) against the shipped file's 81.8%. Code, settings and
  manifest are unchanged since v2; the case-insensitive file system was ruled out (16 files, no effect). Hence a
  same-data control in every comparison.
- **Grid (out-of-repo, 64,288 blocks / 192 repos; both sides tuned over 4/8/12 epochs × lr 0.2/0.4):** best mean (8
  epochs, lr 0.2) 21,561 right / 1,080 wrong shown (95.2%); best mean + max (clip 2, pool-lr 0.3, 4 epochs, lr 0.2)
  26,081 / 1,214 (95.6%) — +21% right at equal precision; C++/C 510 / 56 vs 266 / 64; TS/JS 2,287 / 472 vs 2,191 / 374;
  C#/Java 1,383 / 55 vs 905 / 25; dev hybrid 152 / 12 (92.7%) vs 145 / 7 (95.4%). Mean + max + min: worse everywhere.
- **Pablo's decisions (before the test run):** one candidate, mean + max at the best config; the bar below; the shipped
  v2 decides shipping (the same-data control explains pooling vs data).
- **The bar, fixed before running `fences.real3.json`** (once), behind the 0.80 / 0.20 gate, against the shipped
  `lang-v2.bin`, for the model alone *and* the app hybrid:
  1. the six pair languages together (ts, js, c, cpp, csharp, java): more right suggestions shown, and precision
     when shown ≥ v2's;
  2. overall precision when shown ≥ v2's (point estimate);
  3. file ≤ 400 KB, ~0.1 ms per decision.
  Reported, not gating: each pair, JSON with comments, the decisive-syntax subsets, accuracy, the heuristics, the
  same-data control (mean, 8 epochs, lr 0.2), and the hybrid with and without `RULES_OVERRIDE`.
- **The held-out run (once, `training/eval-test3.ts`):** v3 hybrid 391 right / 26 wrong (93.8%) vs shipped v2 380 / 28
  (93.1%); alone 348 / 23 (93.8%) vs 302 / 24 (92.6%) — overall ✓. Six pair languages: alone 88 / 12 (88.0%) vs
  80 / 9 (89.9%), hybrid 103 / 14 (88.0%) vs 106 / 12 (89.8%) — ✗ in both modes. TS/JS alone 22 / 5 vs 33 / 4; C#/Java
  44 / 3 vs 28 / 1; JSON with comments 26 / 0 vs 8 / 0; `cpp` with C++ syntax 81.0% vs 66.7% accuracy. Size 385.7 KB,
  same speed. **Verdict: does not meet the bar → not used** (Pablo's rule: the shipped v2 decides). Same-data control
  hybrid 363 / 25 (93.6%), so on identical data mean + max is the better pooling overall — not on the pairs.
- `RULES_OVERRIDE` re-measured on the new set: v2 hybrid 377 → 380 right, 0 more wrong — it stays.
- `fences.real3.json` joined `npm run eval:assist` after its run: the ✗ baseline goes 597 → 1,215 (+388 heuristics,
  +230 v2 on the 842 new blocks; nothing else changed).
- Documented: MODELS §2.7 + §8.1 + §8.5 (EN + PT-BR), training/README (full tables and commands), ROADMAP §4.1
  (follow-ups: TS/JS labels, mean + max for coverage as its own claim, rebuild reproducibility). No model file
  committed; Privacy & storage unchanged (nothing shipped).
- `#story` (Pablo asked): a 2026-10-30 entry, "Better overall, not where it was aimed" (the bar, the verdict, the
  label cause, the fallback re-measured; link → #models), and "What comes next" now leads with fixing TS/JS labels.

## 36. Reproducibility of the training data (2026-10-30)

- Pablo chose all three: (1) the shipped file is the fixed baseline, with a same-data control in every comparison;
  (2) training-data locks; (3) an hour to look for the cause, reported even if inconclusive.
- `training/fingerprint.ts`: per repo × language, blocks collected and trained on, checksums of `blocks.jsonl`
  (sorted lines — collector order varies) and `train.jsonl`, of the six inputs that decide them, and Node / git
  versions. `train.ts --save public/models/…` writes `training/locks/<name>.json`; `--check` lists the differing
  repos and languages, largest first. `locks/rebuild-2026-10-30.json` = the collection v3 trained on (59 KB).
- The hunt: MODELS §3.1's per-language counts put the 537 extra blocks in Rust +463, plain text +51, diff +20
  (others ±5). Ruled out: inputs and code (unchanged), case-insensitive file system, git version (2.39.5 built from
  source vs 2.43: identical sparse checkouts for all 61 folder-limited sources), top-level files of `/src/*` sources.
  No single repo explains the excess (largest Rust sources are capped at 600). Leading guess, uncheckable: a clone
  incomplete at v2 time and reused (`collect.ts` clones only when the folder is missing). Closed as not found.
- ROADMAP §0's mode names fixed (Rules / Rules + AI).

## 37. Evening fixes (2026-10-30)

- **/LICENSE.txt in `npm run dev`** (155ef22): the license file was emitted only by the production build, so in dev
  About's "here" opened the app at `/LICENSE.txt` (then `/LICENSE.txt#about`). The dev server now serves it too.
  Deployed: plain text on purpose (QA #28 — verbatim, readable without the app); Pablo asked, kept.
- **Back label flash:** Back from a docs page to About showed "Marksage" for the 220 ms exit — the hash change set
  the *next* page's `cameFrom` (About, opened from the app) while the old page was still leaving. `goToInfo(next,
  from)` now sets both together, after the exit. Checked: "About" until the page switches.
- **#story:** the 2026-10-30 v3 entry gains the rebuild finding, framed as the practice it led to (Pablo agreed it
  belongs there, briefly): the shipped file is the fixed baseline, every shipped model carries a fingerprint of its
  training data. No new entry.
- **`collect.ts` fixes** (Pablo's go): (1) every run re-applies the file selection and the pinned commit on existing
  clones and restores missing files (`git reset --hard`; `checkout -- .` failed on selections matching nothing, like
  jq's docs) — tested by deleting 20 files from a clone: all back, 625 blocks as before; (2) found while testing: the
  code-file windows were seeded by the file's absolute path, so data depended on the clone folder — now repo +
  relative path; two collections from different folders are identical. `locks/rebuild-2026-10-30.json` rewritten
  after both (train 64,287); v3 trained on the pre-fix collection (64,288; three code-file repos off by one block).

## 38. Versioning (2026-10-30)

- Pablo wanted versions from now on, reflecting the whole history (the first commit was already "1.0.0" in his eyes).
  Options discussed: 1.0.0 at launch; majors per product generation + one release per day (3.5.0 — rejected: it needs
  a time-zone choice); **per commit (chosen, his call): 3.33.3** — recomputable from `git log` alone, so anyone digging
  the code can verify it.
- `scripts/version.ts`: `feat` → minor, `fix` / `perf` → patch, others unchanged; majors at `883a328` (previewer),
  `899f502` (Smart Assist), `d724a55` (own model) — the only judgment call, listed by hash. `--next "<message>"`
  writes `package.json` + `CHANGELOG.md` before a commit, `--check` verifies after; `--list`, `--commit <ref>`.
- `CHANGELOG.md` (generated, newest first, grouped by major), `package.json` 3.33.3, About → License shows
  "Marksage 3.33.3 — changelog" next to the commit. Tags: annotated `v1.0.0`, `v2.0.0`, `v3.0.0`, `v3.33.3`, each
  marked retroactive (Pablo pushes them with `git push --tags`). This commit is `chore`, so the version stays 3.33.3.

## 39. Pre-launch review by three agents (2026-10-31)

Before the LinkedIn post, three agents reviewed the app at 3.33.3 (`b9bf60e`) in parallel — A: flows and behaviour,
B: content accuracy against code, eval and git history, C: first impression for a LinkedIn visitor — driving the
production build in headless Chromium (desktop / phone, light / dark, reduced motion, EN / PT-BR). Report first:
34 merged findings (2 blockers), Pablo approved the fixes in batches. Baseline kept: `eval:assist` 1,215 "✗".

- **Recent lost a document across two tabs** (blocker): tab B made a new document, tab A kept typing in its own;
  A's save wrote its in-memory Recent over `marksage:history`, so B's document disappeared once B closed (its
  pagehide flush had nothing new to write). `upsertHistory` / `removeHistory` now apply to what storage holds at
  that moment (this tab's copy only when storage can't be read), and a `storage` event on the key refreshes the
  other tabs' menus. Checked with the agent's two-tab script: Recent keeps both documents through typing in A,
  closing B and reopening.
- **A sample document that shows everything** (Pablo: richer, useful and enjoyable — not necessarily big): the
  4-section playground became `pitwall-README.md`, a made-up README for a lap-time CLI with a tour checklist on top
  and slips left in on purpose. Checked in the app, EN and PT-BR: Rules lists 12 suggestions (Bash 97%, JS 85%,
  JSON 100%, `-item` ×3, `• item`, `**Options**`, `1)item` ×2, `[text] (url)`, `#License`), the CSV in Examples
  pasted back offers a table, the Document tab calls it a README (from its sections, not the file name) and lists
  untagged code, a "click here" link and a 40+ word sentence; "How it works" is the hard-to-read section.
  Rules + AI adds the ✦ calls and the JS-or-TS "Which language?" pick on Usage; the section model types "Keeping
  your data private" as Security in English. Not in PT: the model reads the PT text as "other" (0.30) — it learned
  mostly from English docs. Avoided on purpose: `== Title ==` (it maps to `#####`, DokuWiki-style, and looks wrong
  in a demo), short shell blocks (the rules aren't sure below a loop or a pipe), and `-a …` lines in PT (read as a
  flag).
- **The start screen says what Marksage is** (agent C's top finding: a cold visitor saw only a drop box; the best
  demo sat 1,800 px down About, below the icon picker): an `h1` tagline ("The Markdown editor that notices." /
  "O editor de Markdown que repara nos detalhes."), one line (local-first; rules + two small models trained for it,
  on your device), **Try it on a sample document** (primary) and **The story** link above the drop box, whose own
  Smart Assist line goes (said above now). The start screen is the page's `<main>`. About: Appearance moves to the
  end, after Open source. Checked: 1440 / 390 / 320 px, light / dark, EN / PT-BR, no overflow.
- **Typing at the end of a long document stalled** (regression from §34's brighter caret line): `caret()` read
  `ta.selectionStart` for every newline before the caret, and it ran 2–3 times per key (input, keyup,
  selectionchange). `selectionStart` costs time proportional to the text, so the work grew with the square of the
  line count. Now: read once, at most once per frame. Agent A's measure (400-section file, 254 KB, 4,402 lines,
  Assist off, production build, headless Chromium on 2 vCPUs, 11 real keys): end of document 548 → 52–61 ms per
  key, long tasks 30 → 2; start of document 34–49 ms (unchanged). The caret line still follows typing, arrows and
  clicks.
- **Docs pages scrolled sideways on phones** (`#smart-assist`, `#models`: up to 489 px wide at 360 px, the Outline
  button off-screen): the bar's Back button couldn't shrink. Now it truncates ("Docs…" at 320 px in PT), and
  "Read-only" shows as a lock until the bar has room for the word (title + screen-reader text keep it). Checked:
  320 / 360 / 375 / 390 / 430 px, EN / PT-BR, opened from About and from the other docs page — page width = viewport,
  Outline button in view and opens the panel.
- **No light flash in dark mode; a first visit is light** (agent C: ~100 ms of white, then the light-themed app,
  then dark, on every load — 4.7 s of white on slow 3G): the app added `dark` in a `useEffect`, after the first
  paint, and the page had no dark background before the CSS. Now the pre-paint script adds the same `dark` class
  and `index.html` gives `html.dark` its background, so the boot screen and the app are dark from the first frame;
  `useTheme` toggles the class in a layout effect. Pablo's call in the same fix: a first visit (nothing stored) is
  light whatever the system says, with the Classic accent (already the default). Checked with the main script
  held back 2 s: dark at 100 / 300 / 900 / 1,800 ms and after; first visit light with the OS in dark mode;
  toggling still saves and applies.
- **Export's first ⌘S didn't select the name** (untitled document "# Meeting Notes": `document.md` selected for a
  frame, then `meeting-notes.md` with the caret at the end, so typing appended — `meeting-notes.mdfoo.md`): the
  panel's name is state from when it mounted, refreshed by an effect that committed after the frame selecting it.
  Now a layout effect. Checked: first ⌘S, the Export button and a named document all select `meeting-notes` from
  the first frame on.
- **The preview didn't follow a paste in split view** (15 KB pasted: editor at the bottom, preview stuck at the
  top, and typing at the end didn't move it): the sync ran on the editor's scroll, while the deferred preview was
  still empty, and nothing re-ran it. `useScrollSync` now re-syncs when the preview's content changes size while
  the editor is the driver. Checked: after the paste the preview is at 9,567 / 9,603; scrolling either pane still
  moves the other, with no snap-back.
- **Closing a menu lost focus** (type "abc", ⌘S, Esc, type "def": the text stayed "abc" — focus was on `<body>`
  after Esc on Export, a download, Esc on the Assist menu). Pablo's rule: back to the editor when it's on screen,
  else to the button that opened it. `hooks/useReturnFocus.ts`, used by Export, Assist and Recent; a frame after
  closing, so a click elsewhere keeps its focus; on touch screens always the button (the editor would pop up the
  keyboard); Tab in the Assist menu closes it onto its button. Checked: ⌘S + Esc, ⌘S + Enter, Assist Esc / choose,
  Recent ⌘⇧H + Esc → editor (typing continues); preview only: Export Esc / click outside → Export button; Assist
  Tab → Assist button.
- **Shortcuts and a command palette** (Pablo, 2026-11-01, after the review's #9: browsers keep some keys — ⌘N opens a
  window in Chrome, Edge and Opera, Opera opens its assistant on ⌘O; ⌘⇧ combos are no safer: ⌘⇧N private window,
  ⌘⇧T reopen tab, Safari's ⌘⇧H home). Kept: ⌘S, ⌘Z, Tab, Esc. ⌘N removed (handler, tooltip, About, README).
  ⌘O, ⌘⇧C, ⌘⇧H still work where the browser lets them, marked "*" with a note in About and the README. New: **⌘/Ctrl
  + K, the command palette** (`CommandPalette.tsx`) — every action of the current screen (document, view, Smart
  Assist modes while editing, pages) plus recent documents, searched in EN and PT words; ↑ ↓ / Enter / Esc,
  focus back where it was unless the command moved it. Rules + AI from it never skips the download notice: the
  Assist menu opens on it. Checked in Chromium: start screen / editor / About lists, Enter runs (sample, Export,
  theme, language, story), Esc returns focus to the editor, PT labels and search ("hist" → história), 390 px fits.
- **`== Title ==` → `##`** (noticed while building the sample; Pablo's call): wiki headings took DokuWiki's order
  (7 − the `=` count), so the common `== Title ==` became `#####`. Now MediaWiki's: `==` → `##`, `===` → `###`, up
  to `======` → `######`. Detection unchanged (eval 1,215 "✗"); SMART-ASSIST §3 table (EN + PT-BR).
- **#story corrected** (agent B): the launch-QA fact "+1 right suggestion, 0 new mistakes on every test set" →
  "+1 right on the tuning set, held-out sets unchanged, 0 new mistakes" (re-measured with the ≥ 99% override off:
  dev 157 → 158, real and real2 unchanged, real3 405 → 408, mistakes unchanged everywhere — the v3 entry already says
  the +3); dates = commit dates in São Paulo (v1 2026-10-23, not the UTC day; the first entry 2026-09-26, the first
  commit; AGPL + Privacy page 10-24 → 10-25; the launch QA 10-30, the pass its numbers come from); "every shipped
  model carries a fingerprint" → every *code* model shipped from now on (only `train.ts` writes locks, and none
  exists yet for the shipped files); link labels name the page they open ("How the models work", "How Smart Assist
  works") instead of a section they don't scroll to; PT: "memoizado", "pistas passadas por hash".
- **Technical docs brought up to date** (agent B): the third held-out set (real3) joins SMART-ASSIST §1.2 / §4.2 /
  §4.3 / §5 — two-option offers right in 107 of 113 (15/15, 17/17, 75/81), and the "a point less precise, which is
  why it's opt-in" line is gone: on real3 Rules + AI is 408 at 93.1% vs the rules' 239 at 92.1%, 1.7–2.2× the right
  suggestions across the three sets; opt-in because of the download. Dates = São Paulo commit dates (v1 and the
  first held-out set 2026-10-23; the mode rename 2026-10-29, *Local model* before 10-28). MODELS: written set
  structure 41 · documents 6, v3 386 KB (394,972 bytes, same unit as the other sizes), a note that the app shows
  158 on dev since the ≥ 99% override. training/README: the override's effect per set, the rules row dated, 858.
  PT: "conjunto de teste" in MODELS (was "de fora"), "*Regras*" for the old "modo heurístico".
- **Privacy & storage listed every key but one** (agent B): `marksage:model-notice` (set when the Rules + AI notice
  is confirmed) now appears in About's list, EN + PT-BR. The code stores exactly the 11 `marksage:*` keys + the
  `marksage-models-v1` cache AGENTS lists; "Delete all Marksage data" removes them all.
- **Copy fixes, EN + PT-BR** (agents B and C): the Rules + AI notice says "models" / "them" (two files); the mode
  table in About says "≥ 99%" like SMART-ASSIST and the README; size limits say what the code counts (a million /
  5 million characters, about 1 / 5 MB); PT wording a Brazilian dev would use ("Tudo local, sempre", "deslizes de
  formatação", "o Marksage oferece uma tabela", "o que vale conferir", "dicas de formatação"); EN "color" and a
  curly apostrophe; the story introduces Jev ("from TypeSafe AI").
- **Diagram: "Esc ignora"** — the drawn PT architecture diagram said "Esc dispensa" where its Mermaid twin and the
  app say "ignora" (`scripts/diagrams.py` + the two PT SVGs, edited in place). Found doing it: the committed SVGs
  each carry a ~7.8 KB C2PA "content credentials" manifest that `diagrams.py` doesn't produce (≈ 31 KB of base64 per
  language in the docs chunk); kept for now — Pablo's call.
- **Link previews and tab titles** (agent C): a build without `VITE_SITE_URL` still succeeds, but now ends with the
  warning (it used to be line 2 of ~120, under the bundle list); `og:` / `twitter:` / `description` mention the
  two small models trained for it, running on the device; the tab title names the page (About, the docs, the story
  — "The story — Marksage"), EN + PT-BR, set in App (the I18n provider's effect ran after App's and overwrote it).
  Crawlers don't run JS, so a shared `#story` link still previews as the site — said in AGENTS. PT tagline aligned
  with the start screen: "O editor de Markdown que repara nos detalhes."
- **The story and About lead to the code and the author** (agent C: the story ended at "What comes next"; About's
  GitHub link sat 3,800 px down): #story ends with "Built by PabloFLPs. Source, training code and model files:
  GitHub (AGPL-3.0)." (EN + PT-BR, `credit` in the story content), and About's top shows "Source on GitHub" (this
  build's commit) next to the story link, wrapping cleanly on phones. The optional sentence on which calls were
  Pablo's is left for him to write.
- **About's source commit on hosts without `.git`** (agent C): many hosts build from a copy without git, so About
  linked only the repository root. `vite.config.ts` now falls back to the host's commit variable
  (`VERCEL_GIT_COMMIT_SHA`, `CF_PAGES_COMMIT_SHA`, Netlify's `COMMIT_REF`, `RENDER_GIT_COMMIT`, `GITHUB_SHA`), and a
  production build from uncommitted changes warns that the linked commit isn't exactly the build. Checked: a
  git-less copy with `VERCEL_GIT_COMMIT_SHA` set embeds that commit; a dirty tree prints the warning.
- **About loads on demand** (agent C's first-load numbers: `/` 182 KB gzip of JS, usable at 2.6 s on Slow 4G and
  8.8 s on Slow 3G with a 4× slower CPU): About was in the main script; now its own chunk, fetched when the browser
  is idle after the first paint (not on Save-Data), behind the same `PageLoadBoundary` as the docs. Main script
  193.1 → 181.7 KB gzip. Checked: About opens instantly after load, cold `#privacy` still scrolls to its section, a
  blocked chunk shows "couldn't load" + Try again / Back. Not done: one language per chunk (About's copy is inline
  EN + PT) — ROADMAP §4.
- **Accessibility basics** (agents A and C): the split divider is a focusable separator with its value (← → 5%,
  Shift 10%, Home / End, Enter = half) and sits above the editor pane, so its 8 px grab area works on both sides of
  the line; the Outline tabs follow the WAI-ARIA tabs pattern (← → Home End, one Tab stop); the phone Outline
  sheet is a modal dialog that takes focus and gives it back; About's toggle hints lose `opacity-70` (contrast
  2.75–4.48 on 10 px); the Smart Assist heading reads "Smart Assist — local · on by default" to screen readers;
  the docs' contents list jumps without smooth scrolling under reduced motion. The start screen got `<main>` + `h1`
  earlier in this review.
- **Polish** (agent C): a `<noscript>` line (EN + PT) instead of a lone "Marksage" with JavaScript off; the start
  screen's drop box has less padding on phones, so the PT buttons fit on one line at 320 px; two of the three old
  lint warnings fixed (an unneeded `\[` escape — same regex — and an unused `catch` binding); the third (`useI18n.tsx`
  exports a hook next to its provider) stays. Not done: renaming the root files with spaces (links everywhere) and
  the build's chunk-size note (Mermaid's lazy chunks).
- **README as a landing page** (agent C): the tagline, the preview image, three bullets (local-first; two 385 KB
  models used only where they beat the rules, ~2× the right code-language suggestions at about the same precision;
  what didn't ship is documented), then links (the story, the two docs, training, roadmap); the doc names in the
  text are links now; the features list gains the palette, two tabs, images from the web and the story. Waiting
  on Pablo: the live URL (none in the repo yet). Not added: CI and its badge (his call).
- **ROADMAP and AGENTS** (agent B + this review's follow-ups): ROADMAP §5 marks the story done (linked from the
  start screen, About and ⌘K — never the ••• menu), §0.1's date is 10-29, the reproducibility line says *code*
  models; §4 opens with the follow-ups Pablo kept for a future iteration (the section model and Portuguese, the
  browser bar colour, the SVG metadata, README URL / CI, a story sentence in his words, smaller ones). AGENTS: the
  rename date, the ≥ 99% override in the hybrid, the lock writer, a merged bullet split.
- **Laya in the story** (agent B's #13; Pablo, 2026-11-01: never measured in the browser — an assumption that it's
  too heavy, plus a question to Claude): the story no longer says a general model was "tried in the browser … not
  reliable enough"; it says what happened — the plan was a general model, and for this question a model trained for
  it was the better fit. SMART-ASSIST §4.5's "thousands of times smaller" → over a thousand (262 thousand
  parameters vs Laya's 322–421 M: ~1,200–1,600×). EN + PT-BR.
- **Link previews on Vercel without setup** (Pablo: live at https://marksage.vercel.app; its build had relative
  `og:url` / `og:image`, `VITE_SITE_URL` unset): `vite.config.ts` falls back to `https://$VERCEL_PROJECT_PRODUCTION_URL`
  (set by Vercel on every build, previews included — so their previews point at production). `VITE_SITE_URL` still
  wins. Checked: a build with only that variable set gets absolute `og:` URLs.
- **README: the live link** — "Try it: marksage.vercel.app" under the tagline (the sample is on its start screen),
  and "the story" links the live `#story`.
- **More follow-ups in ROADMAP §4** (Pablo: keep the review's "not proposed" items as next steps): Tab to indent
  lists (needs the "Assist Off = original behaviour" rule revisited), raw HTML in the preview (a line in About, or a
  sanitized subset), CI with its badge. The README's live URL item is done.
- **Diagrams regenerated without their C2PA manifests** (Pablo's call, 2026-11-01): the 8 SVGs carried a ~7.7 KB
  "Content Credentials" record each — signed by Anthropic, "Claude provided this file at the request of a user…",
  added when an earlier session delivered them; `scripts/diagrams.py` never wrote it, and the two PT files edited in
  place for "Esc ignora" no longer matched its content hash. `python3 scripts/diagrams.py docs` again: the drawings
  are byte-identical minus that block; the docs chunks go 134.7 → 103.6 KB (EN) and 142.5 → 111.4 KB (PT), gzip
  38.5 → 34.2 and 40.1 → 35.8 KB. Neither Anthropic's terms nor the EU AI Act (Art. 50: deepfakes, public-interest
  text) require labelling these diagrams.
- **The missing-URL warning, corrected** (Pablo, 2026-11-01: WhatsApp showed the full preview, image included, from
  the live build with relative tags): it no longer claims LinkedIn, Slack and WhatsApp *will* show no image — agent
  C's assumption, repeated in two earlier commit messages here. It says the spec asks for absolute URLs and some
  previews *may* lack the image. The Vercel fallback stays: the tags are absolute there either way. LinkedIn itself
  is unverified until the deploy (Post Inspector).
- **README: how it was built** (Pablo's choice, 2026-11-03 — no legal requirement, an honest line instead of people
  guessing): "Built with AI assistance (Claude) for implementation and review. The architecture, the measurement bars
  and every ship / don't-ship call are mine." Above the "Read more" links.

## 40. Last touches before the post (2026-11-03)

- **Recent: 1–9 open a document** (Pablo: the menu has a shortcut, so picking from it should be quick too): the
  first nine documents other than the open one carry 1–9 (the open one has no number); typing the digit opens it
  while the search box is empty — once anything is typed, digits search ("2026"). The footer says "Type 1–n to
  open". Desktop only (no keyboard on phones). Checked: three documents, ⌘⇧H, "2" opens the second; "a1" types
  into the search.
- **The document bar's tab icons** (Pablo: a button per Outline tab, and clicking the type again closes the panel;
  the header's Outline is redundant at the top of the preview): the bar's "Outline" button becomes three icon
  buttons — Outline, Document, Suggestions (with its count while the panel lists them; the docs pages have no
  Suggestions) — each opens the panel on its tab and closes it when that tab is showing; the type chip does the
  same for Document. The header's Outline button collapses while the bar is on screen (IntersectionObserver, so it
  follows the preview pane's own scrolling) and comes back once it's scrolled past. Checked: split view and preview,
  top / scrolled / back; Outline → open, Outline → closed, Document → open, type → closed, type → Document;
  #models shows two icons; 320 px PT fits.
- **README image by its live URL** (Pablo, `npm run dev`: "Instead of /public/og-image.png, use /og-image.png"):
  opened in Marksage, the README's relative `public/og-image.png` was requested from the app's own server — served
  with that warning in dev, a 404 in production. Now `https://marksage.vercel.app/og-image.png`: GitHub shows it the
  same, and in Marksage it's an image from the web like any other (placeholder until allowed).
- **Browser bar colour follows the theme** (ROADMAP follow-up): `theme-color` was always `#0d1117`, so on phones the
  bar stayed near-black over the light theme a first visit gets. Now `#ffffff` in `index.html`, `#0d1117` from the
  pre-paint script when dark is stored, and `useTheme` updates it on every switch. Checked: first visit with the OS
  dark → white; toggle → dark; reload with the app held back → dark before it runs.
- **Lint: 0 warnings** — `hooks/useI18n.ts` keeps the context and the hook, `components/I18nProvider.tsx` the
  provider (a file exporting a component next to a hook breaks Fast Refresh, the last oxlint warning).
- **No chunk-size note on every build:** `chunkSizeWarningLimit: 1500` — the chunks over 500 kB are Mermaid's (elk
  1.46 MB, only on a docs diagram's Mermaid switch) and the main script (~590 kB, ~183 kB gzip), tracked as ROADMAP
  §4's first-load item.
- **The story says whose calls they were** (ROADMAP follow-up, in the words Pablo approved for the README): the
  closing line now reads "Built by PabloFLPs, with AI assistance (Claude) for implementation and review; the
  architecture, the measurement bars and every ship / don't-ship call are his." EN + PT-BR, neutral voice.
- **Root files without spaces** (ROADMAP follow-up: GitHub URLs full of `%20` and `%E2%80%94`): `SMART-ASSIST —
  Implementation Context.md` → `IMPLEMENTATION-CONTEXT.md`, `Markdown Preview Web Application — Product & Technical
  Specification.md` → `PRODUCT-SPEC.md` (its title, from the previewer days, unchanged). References in the README,
  ROADMAP, this file and the CHANGELOG header (`scripts/version.ts`) follow; commit subjects in the CHANGELOG keep
  the old name, as history.
- **CI** (ROADMAP follow-up): `.github/workflows/ci.yml` on every push to `main` and every pull request — `npm ci`,
  type-check, lint, build, `eval:assist` (fails if the document fixtures or the standalone-runner parity fail, or if
  the "✗" count leaves `EVAL_BASELINE`, 1,215 today; the count goes to the job summary), `version:check` (full history
  checked out). Badge at the top of the README. Dry-run on a fresh clone: every step passes; with a baseline of
  1,214 the eval step fails as it should.
- **ROADMAP §4** keeps the four follow-ups Pablo set aside — the section model in Portuguese, Tab to indent lists,
  raw HTML in the preview, the faster first load (now with About's per-language chunk folded in); the rest is done.
- **The README image warning, explained** (Pablo still saw "Instead of /public/og-image.png" in dev): opening
  today's README.md requests no `og-image` at all; the README from before the fix requests `/public/og-image.png`
  and prints exactly that warning — the copy Marksage keeps of a document opened earlier (open document / Recent)
  is the old text. The fix stands; re-opening the file from disk ends the warnings.
- **A refreshed link preview, dark and light** (Pablo picked dark to ship, keeps light ready): rendered from
  `scripts/og-image.html` (template, `?theme=light`, commands in its header). Same layout as before; the pitch now
  says "Rules + two small models trained for it suggest fixes on your device — you decide", chips "Its own models"
  (accent) · "Live split editor" · "EN-US · PT-BR", and the suggestion carries ✦ with "TypeScript · 95% · local
  model", as a model decision shows in the app. `public/og-image.png` (dark) ships; `public/og-image-light.png` is
  the switch-ready variant.
- **og:description says "EN-US · PT-BR"**, the pattern the refreshed preview image uses (Pablo).
- **The logo on the start screen** (Pablo): the app icon the user picked (About → Appearance; Classic by default)
  above the tagline, 56 px, the same image as the header and the tab, so it follows the icon and the theme.
- **The sample follows the app's language** (Pablo: Marksage's own documents should switch with it — the docs pages
  and #story already did): while untouched, `pitwall-README.md` is swapped in place for the current language's
  version (`replaceUntouched` in useMarkdownFile: same id, so one Recent entry; still clean, no "*") on a language
  switch and when opened from Recent; an edited sample stays as written. Checked: EN → PT → EN in place; edited →
  kept; untouched in Recent, reopened after switching to PT → PT. About (Reading & writing), EN + PT-BR.
- **Close document / back to the start screen** (Pablo asked how to reach the start screen; the logo already means
  "back to the open document" from About and the docs). An explicit close: a ✕ next to the name in the header,
  "Close document" in the phone's ••• menu, "Start screen" in ⌘K (also from About / the docs). It flushes the
  document into Recent, clears `marksage:doc` (a reload stays on the start screen) and shows the start screen.
  Checked: ✕ → start screen, Recent lists it, reload stays, reopen from Recent; ⌘K from About; phone menu (PT).
- **Unit tests (Vitest + happy-dom)** — test item 1 of the review's evaluation: `npm test`, 24 tests in `tests/unit`
  for the pure logic that broke or could break silently: Recent across tabs (the blocker — with the old code put
  back, both tests fail), Delete all (keys removed, nothing written back), the stored document, first-visit Assist
  mode, file checks and names, preview pieces (fences, reference definitions, footnotes), structure hints (MediaWiki
  levels, near-misses, code that only looks like one), version bumps, shortcut labels. `tsconfig.test.json` type-checks
  them with `tsc -b`; CI runs them after lint.
- **Recent's search lost focus when reopened quickly** (found by the new E2E suite): the menu stays mounted for its
  140 ms exit animation, so reopening it then didn't remount the search box, whose `autoFocus` effect never ran
  again — the next keys went nowhere (and a digit could open a document). `HistorySearch` takes a `focusKey` that
  changes on every opening.
- **End-to-end tests (Playwright)** — test item 2: `npm run test:e2e` builds, serves the production build and runs
  18 tests (`tests/e2e`) in desktop and phone Chromium, the flows this review drove by hand: the start screen and
  story link; the sample's suggestions, Tab, undo; the Suggestions tab; two tabs keeping both documents; Export's
  name selection and download; focus back to the editor; Recent 1–9 (it found the reopen-focus bug above); Close
  document; the sample's language; Delete all; the palette (incl. never skipping the Rules + AI notice); the
  document bar's icons and the header Outline; first-visit light / dark before the app; docs navigation; no
  overflow at 320 / 390 px on every page; the phone menu. Three green runs in a row here. CI: an `e2e` job (installs
  Chromium, uploads traces on failure).
- **WebKit and Firefox** — test item 3: `CROSS_BROWSER=1` adds three Playwright projects (WebKit desktop = Safari's
  engine, iPhone 14 for the phone tests, Firefox): 51 tests in all. CI runs them in `e2e-cross-browser`. They could
  not run where they were written (only Chromium is installed there), so that job is non-blocking
  (`continue-on-error`) until its first green run on GitHub; then it should block like the others.

- **Accessibility fixes (axe, WCAG 2.1 AA)** — found by test item 4's scan, light and dark: the header brand button,
  the Assist button and the doc bar's tab icons now have names that contain their visible text (2.5.3 — the icons'
  names are screen-reader text, the badge count is already read next to them); Dismiss on the suggestion bar the
  same, its words screen-reader-only on phones; accent text on accent tints (palette group chip, Outline badge and
  active row) uses `accent-strong` in light (4.49 → 5.82 : 1), the active row's key sentence `ink/80`; the bar's
  `Tab` / `Esc` chips sit on `black/20` (white on accent: 7.2 : 1); task-list boxes are named *Done* / *Not done*;
  code blocks are focusable (they scroll sideways); links in the preview are underlined, faintly (1.4.1 — not
  colour alone).
- **Automated accessibility** — test item 4: `tests/e2e/a11y.spec.ts` (`@axe-core/playwright`, WCAG 2.1 A + AA) scans
  the start screen, the sample in the editor with the Outline open, About, the two docs pages, the story and the
  command palette, in light and dark (14 tests). It waits for entrance animations to end first (mid-fade text
  measures lower than it ends up), but not for looping or scroll-driven ones. The first run failed 11 of 14; the
  fixes are the commit before this one.
- **Performance budgets** — test item 5. `npm run size` (`scripts/size.ts`, CI `check` job): what the first visit
  downloads before the app paints (the entry, its preloads and the CSS that `dist/index.html` names), gzip level
  9 — 180.9 KB JS / 12.5 KB CSS today, budgets 190 / 16. `tests/e2e/perf.spec.ts` (CI `e2e` job, Chromium):
  the 400-section, 251 KB document, 13 keys at its end and 15 at its start, each key timed by the browser (Event
  Timing: press → next painted frame) — median 72–88 ms, slowest 176–304 ms on 2 vCPUs in Rules mode; budgets
  150 / 500 ms (a key cost 378–587 ms before the long-document fixes). The text goes in as one input event, as a
  paste would: Playwright's `fill()` took 78 s on it (the app takes ~1.3 s).
- **A flaky E2E test, explained** — the Export test failed about 1 run in 10 (3 / 30, the same before and after the
  App.tsx split): the next keystroke landed before "text", not after it. Playwright's `fill()` sends four input
  events for one insert (a real paste sends one), and now and then React put the value back once more between them,
  which left the caret inside the text. `newDocument()` in `tests/e2e/helpers.ts` now puts the caret at the end, as
  after typing: 40 / 40.
- **App.tsx split** — grade item 2: 1,175 → 755 lines. Moved, unchanged: `hooks/useInfoPages` (hash navigation, Back
  and its label, the tab title, the lazy docs / story pages and their prefetch), `useViewMode`, `useOutlinePanel`
  (incl. the doc bar's tab toggling), `useGlobalInput` (shortcuts, drop, paste, Esc), `useTypeToEdit`,
  `usePaletteCommands`, and `lib/docStats` (footer counts, now unit-tested). App keeps the document actions and
  the layout. One real difference: the shortcut listener no longer re-registers on every keystroke (it depended
  on the document object; now on whether there is one). First-load JS +0.7 KB gzip (181.6). Checks: tsc, lint 0,
  27 unit + 33 E2E (×3), eval 1215.
- **Contrast per accent palette** — a one-off axe run with each app icon (the spec covers Classic): Mono, Sunset
  and Classic pass in light and dark once the Outline's active key sentence got its dark variant (Mono dark was
  4.42 : 1). **Line fails in light**: its teal accent is 3.74 : 1 on white (10 elements — counts, labels, the
  section types); it needs a darker teal, Pablo's call (ROADMAP §4).
- **Line palette, darker** (Pablo: do it) — light accent teal-700 `#0f766e` (5.47 : 1 on white, was 3.74), hover
  teal-800 `#115e59`; dark unchanged. Its app icon keeps teal-600 (a graphic: 3 : 1 is the bar, 3.74 passes). The
  axe spec now scans the sample + Outline and About with Mono, Line and Sunset too, light and dark: 26 tests.
- **Palette names in English in both languages** (Pablo: "they don't translate well") — Classic, Mono, Line,
  Sunset in Portuguese too (were Clássico, Linha, Pôr do sol); they're names, like the app's.
- **Unit tests for hooks, components and the app** — the gap left by the last evaluation. Testing Library
  (`@testing-library/react`) in happy-dom: `useMarkdownFile` (debounced save, New stored at once, Close, Recent
  reuse, replaceUntouched, refusals, two tabs: follow / conflict / keep mine), the App hooks (view mode and its
  exit, the Outline's tab toggling and what's remembered, hash navigation and Back, shortcuts / Esc / paste),
  DocName, CommandPalette (PT keywords, accents), SuggestionBar, DocBar, Recent's list, MarkdownPreview (GFM, line
  numbers, task boxes, remote images, raw HTML as text, in-document links), and `app.test.tsx`: the whole app from
  the start screen (Start writing, the sample, Close document, preview / edit, the Outline, ⌘K → About → Esc, a
  reload). 27 → 70 tests, ~11 s; lines of `src/` run by them 7.6% → 56.7% (App 62%, hooks 68%, lib 66%, components
  54%, assist 48% — plus `eval:assist`'s ~93% of assist/). `npm run test:coverage` (`@vitest/coverage-v8`) runs in
  CI with a 50% floor.
- **The lockfile's version** — `version:next` wrote `package.json` and `CHANGELOG.md` but not the two version
  fields in `package-lock.json`, so the first `npm install` after a version change left the tree dirty (it stopped
  a `git am` on Pablo's Mac). It writes them now, and `version:check` checks them.
- **First load: the document view as its own chunk** (Pablo picked it over lazy menus, Preact or nothing; measured
  with Brotli as Vercel serves it, Chromium on emulated slow 3G — 2 s latency, 50 KB/s). `components/DocumentView`
  holds what only an open document needs (preview + Markdown pipeline, editor, Smart Assist, Outline, doc bar);
  App keeps the shell. Start screen: 584 → 332 KB raw, 181.6 → 96.8 KB gzip, **150 → 83 KB Brotli; usable in 6.4 s
  instead of 7.4**. Three things the first try got wrong, found by timing it: (1) a stored document waited for
  the main script before asking for its view — `index.html` now asks for it at once (`marksage-document-preload`
  in vite.config.ts), placed *before* the stylesheet (after it, the inline script waited for the CSS: +2.5 s) and
  with `crossorigin` like the module script; (2) About's idle prefetch shared the bandwidth with that download —
  it now waits for the document view; (3) React holds a Suspense reveal back ~300 ms — with a stored document
  main.tsx renders once the view is here and uses it directly (`lib/documentView.ts`). Result for a stored
  document: 7.9 s with an empty cache (7.4 before: +8 KB from the split), 2.1 s from the cache — the same as
  before (with the caching of the next commit). The view stays mounted
  on About (renders nothing), so dismissed suggestions and a loaded model survive a visit there. Budget lowered:
  110 KB gzip. E2E: only a stored document makes index.html ask for the view (main script blocked to tell them
  apart).
- **Caching the hashed files** — `vercel.json`: `/assets/*` (content-hashed names) `public, max-age=31536000,
  immutable`. Vercel's default is `public, max-age=0, must-revalidate`
  (https://vercel.com/docs/caching/cache-control-headers): every visit re-checked every file, a round trip each —
  2 s on slow 3G. A returning visitor now opens Marksage from the cache: 2.1 s on slow 3G (start screen or a stored
  document), the HTML's one round trip. `index.html` and `/models/*.bin` (not hashed) keep the default, so a
  deploy is picked up on the next visit.
- **Start-screen logo: no box behind the corners** (Pablo) — its shadow was a `box-shadow` on a box rounded like
  Classic (rx 6/32 → 11 px); Mono, Line and Sunset are rounder (rx 8, 7, 9), so the box's corners showed behind
  them. Now `drop-shadow`, which follows each icon's own shape. Checked: the four icons, light and dark.
- **CI didn't run at all after the coverage commit** (Pablo's first push of this round: "Invalid workflow file …
  line 29") — the step name `Unit tests, with coverage (floor: 50% of lines)` has `: ` in an unquoted YAML value,
  so GitHub rejected the whole file and ran no job, the cross-browser one included. Renamed; AGENTS says to parse a
  workflow after editing it, and the pre-commit checks here now do.
- **Vercel's "Uncommitted changes" warning** — every Vercel deploy warned that About would link a commit "not
  exactly this build", although Vercel builds the pushed commit (a clean `npm install` with npm 10 and 11 changes no
  tracked file here, so it's Vercel's build environment). The check is skipped on Vercel (`VERCEL` is set there; a
  CLI deploy uploads no `.git` and never reaches it) and names the changed files elsewhere. The other two lines in
  that log, `npm warn Unknown env config "cache-dir"`, come from Vercel's own npm settings, not the repository.
- **First CI run, WebKit** (Pablo's push, 2026-11-04: `check` and `e2e` green; `e2e-cross-browser` 84 passed, 1
  failed, 2 flaky). The failure was real: the readability dot next to each `##` heading was a `<span aria-label>` —
  `aria-label` isn't allowed on a plain span (axe `aria-prohibited-attr`; the Chromium scan ran before the dots
  appeared). Now `aria-hidden` with its hover title: a label would join every heading's name, and the Document tab
  gives readability in words; screen readers ignored the old label anyway. Unit test added.
- **A flaky unit run** — about one `vitest run` in four ended with "window is not defined" (unhandled, so a failed
  run): Testing Library unmounts after each test only with Vitest's `globals: true`, so hooks rendered in
  `appHooks.test.tsx` stayed mounted and React's scheduler ran their work after happy-dom was gone.
  `tests/unit/setup.ts` unmounts after every test: 12 / 12 clean runs.
- **Two WebKit-only flakes** (same run, passed on retry): the palette's axe test pressed ⌘K before the app had
  attached its keyboard listener (WebKit renders later) — it now waits for the start screen; the first-load test
  loaded the page with the app running before blocking the main script, and WebKit reported that page's prefetch
  of the document view during the next load — the main script is now blocked from the first load.
- **CI actions on Node 24** — the first run warned that `actions/checkout@v4`, `setup-node@v4` and
  `upload-artifact@v4` target Node.js 20, which GitHub is retiring: now `checkout@v5`, `setup-node@v5` (Node 24)
  and `upload-artifact@v6` (the first on Node 24; v5 isn't).
- **Cross-browser CI blocking** — run #3 (2026-11-05, Pablo): `check`, `e2e` and `e2e-cross-browser` all green
  (WebKit desktop, iPhone 14, Firefox). `continue-on-error` removed: a WebKit or Firefox failure now fails the run.

## 41. Final adjustments before the post (2026-11-05)

A findings report first (Pablo approved it): the PT-BR diagnosis, Marksage's own documents run through Marksage, the
sample explained, three small UI items and two ROADMAP entries.

- **Section-type chips go to their sections** (Pablo: cycle). In the Document tab's "Section types", each chip is a
  button: one click goes to that section; with several of one type, each click goes to the next one, back to the
  first after the last. Its accessible name keeps the visible words and adds where it goes next (", go to
  “Requirements” (2 of 2)"; the tooltip says the same). `computeDocStats` now keeps the sections behind each count
  (`typeSections`, the same rule as the count: tentative types left out). Unit test + E2E (the sample's
  Troubleshooting chip scrolls FAQ into view).
- **"+N more" in Worth a look** — the count past the six chips was plain text; now a button that shows the rest
  in the same row, before it (fading in and out), and turns into "Show fewer" (`aria-expanded`, `aria-controls`).
  It stays the same element, so focus doesn't move (a first try put the rest on a row of its own: "Show fewer"
  then sat between the two rows). PT: "+{n} mais" (it said only "+{n}") / "Mostrar menos". Flag chips got `.tap`
  (40 px on touch screens). Unit test + E2E.
- **Footer icons** (Pablo picked them from the report): `ListOrdered` lines, `WholeWord` words, `CaseSensitive`
  characters (still hidden on phones), `Weight` size (`HardDrive` already means storage on About). `aria-hidden`,
  70% opacity, text unchanged. Checked: desktop + Pixel 7 + 320 px, light / dark, EN / PT (the 320 px PT footer
  fits with room to spare).
- **Tone in Portuguese: "você" and accented slang counted** (found by running the Document tab on our own docs;
  Pablo: fix it as a clear bug). The voice and slang patterns were `\b(?:…você…)\b`: without the `u` flag `\b` only
  knows ASCII letters, so there is no boundary after "ê" — "você", "tá", "né", "cê" never matched (and "você"
  matched inside "vocês"). PT voice was always "impersonal", PT slang always 0. Now `wordsOf()` (letters and digits
  on either side, Unicode). The sample in PT now talks to the reader ("você"), like the English one; the eval's
  count is unchanged (it doesn't measure tone). Unit test.
- **Bold-as-heading: the level under the heading above** (found by accepting every suggestion in the sample:
  `**Options**` under `## Configuration` became `## Options`, which left Configuration an empty section — the
  Document tab then flagged it; Pablo: fix the rule). The replacement is now one level below the last ATX heading
  above the line (`###` under a `##`, at most `######`); `##` when there's none or only the `#` title, as before.
  `#` lines in code don't count. The eval is unchanged (it judges whether a line is shown, not the level). Unit
  test; SMART-ASSIST §3 structure table (EN + PT-BR).
- **`npm run check:docs`** (`scripts/check-docs.ts`) — Marksage's own documents through Marksage: the README and
  the four docs pages, Rules and Rules + AI, every feature the app has (Suggestions list with the "not sure"
  picks, Document tab: kind, readability, tone, every flag; Outline types; readability dots), one report per
  document. Shipped documents must be clean (zero suggestions, zero flags) unless an item is in `ALLOWED` with
  Pablo's reason; untyped sections are accepted (Pablo, for now: the docs name sections after their own topics).
  The sample is checked the other way round: the exact slips, line by line (the table in the script), in EN and
  PT-BR, both modes, and after accepting every suggestion only the vague link and the long sentence may be left.
  First run: 0 suggestions anywhere; 40 long-sentence flags (README 2, SMART-ASSIST 10 / PT 16, MODELS 5 / PT 7);
  the sample left a second H1 (`#License` → `# License`). It joins CI once every document passes (after the PT
  rewrite).
- **The sample's License slip is an H2** — `#License` (→ `# License`) made a second top-level title once
  accepted, and the Document tab then flagged it. Now `##License` (→ `## License`), EN + PT-BR. With the bold-heading
  fix, `check:docs` passes on the sample: every slip shows, nothing else, and after the tour only the two slips
  without a fix (the vague link, the long sentence) are left.
- **The English docs pass `check:docs`** — the README (2) and SMART-ASSIST (10) / MODELS (5) long sentences split
  or restructured, every fact, number and link kept; no suggestion or other flag was left. Two rules findings on
  the way (ROADMAP, not tuned): a sentence that starts with a lowercase word or code (`` `q` is…``,
  `docs/… is`) isn't split from the one before, so two short sentences count as one long one. (One re-wrap put
  ```` ```` ```` at the start of a line, which CommonMark reads as a fence — the check caught it as untagged code.)
- **The ladder, said precisely** (from the PT-BR pilot review; Pablo approved the EN changes). SMART-ASSIST §1.2
  ("Start with the simplest solution") explains heuristic rules with an example (`def … :` → Python, a real rule
  in `heuristics/language.ts`) and says what "labelled data" means. Step 3 no longer reads as a decision: Laya is
  "today's candidate", open weight, runs locally, *not yet tried in a browser* ("Laya preferably, because it runs
  on your device" stated a plan as a fact). BYOK left the ladder (an agent doesn't answer from a list): a
  paragraph after it says the built-in features never use a generative model, and the next idea is connecting
  other AI models — an AI agent with the model and key you choose, opt-in, off by default, text only to that
  provider. §4.5 the same, plus a link to the model card. The story's decision-models entry: "can't be
  malformed" → "never comes back in an unexpected shape", "a thousand times smaller" now says than what
  (~262 thousand parameters vs the smallest Laya's 322 million, also as facts), the rule told as engineering
  (small questions, one at a time, the simplest tool that is good enough), and its link goes to the model
  cards. "What comes next": the lighter first load is done (2026-11-04), so it names the BYOK idea instead. The
  start-screen pitch says "two small AI models". ROADMAP §1 / §2 follow. EN + PT-BR.
- **PT-BR, the UI strings rewritten** (Pablo approved the style guide, the glossary — now in AGENTS.md, i18n — and
  the pilot). 78 of the ~350 keys changed: calques out ("para manter sua leitura privada", "com tipo", "Quanto o
  Smart Assist tem certeza", "Editor ao vivo"), agreement fixed ("emojis"), terms made consistent (Changelog,
  Deploy, "pequenos modelos de IA", "copia & cola inteligente"), the tagline "O editor de Markdown atento aos
  detalhes." (EN "notices"; Pablo's "pensa junto" would promise more than the app does today). Facts unchanged.
  The phone overflow E2E (320 / 390 px, every page) now runs in PT-BR too: longer labels, same checks.
- **PT-BR, the About page rewritten** — the Portuguese half of its 70-odd `x(en, pt)` pairs, from the meaning:
  "com a sua tecla nele" → "já com o que você digitou", "recarregar a página nunca perde trabalho" → "você não perde
  nada ao recarregar", "conta àquele site" → "revela a esse site", "títulos que não dizem" → "quando o título não
  deixa claro o que é a seção", "O seu navegador pode ficar com essas teclas" → "Alguns navegadores reservam esses
  atalhos para si"; feature names as in the UI (Copia & cola inteligente, Testar com um documento de exemplo).
  The license link said "here" / "aqui" — the vague link our own Document tab flags — in both languages: now
  "full license text" / "texto completo da licença".
- **PT-BR, the story rewritten** (`storyContent.pt-BR.ts`) from the English entries' meaning, with the pilot's
  opening as Pablo approved it ("atento aos detalhes", "Local-first desde o primeiro commit", "o armazenamento
  dele"). "mecanismo" → "engine", "minúsculo" → "pequeno", "separados / de fora" → "conjunto de teste",
  "fallback" → "regra de reserva", sentences split. A number check (every number of the EN file, in PT format, in
  the PT file and nothing else) matches.
- **PT-BR, the sample rewritten** (Pitwall) — line for line with the English one, so every slip sits on the same
  line: "deslizes" → "erros", "Cole de volta os tempos de volta" → "Em Exemplos, copie os tempos, cole de novo",
  "Mantendo seus dados privados" → "Privacidade dos seus dados", "linha malformada" → "linha com erro". It no
  longer adds words the English lacks ("ou falha de segurança", added for the section model, which still reads
  Portuguese poorly — ROADMAP §4). Two traps found by `check:docs`: a list slip that starts with an article
  (`-a volta…`) reads as a command-line flag and gets no suggestion, so the items keep no article; and the PT
  Configuration section had 31 words, enough for a readability dot the English one doesn't get (29) — now 29.
  `check:docs` now also checks that both samples get the same readability dots, at the same levels.
- **PT-BR, the diagrams** (`scripts/diagrams.py`, regenerated): "Mecanismo de decisão" → "Engine de decisão",
  "topo ≥ 0,8 e à frente por ≥ 0,2" → "a primeira ≥ 0,8 e ≥ 0,2 à frente", "modelos + heurísticas" → "modelos
  próprios + regras", "com tipo" → "tipo identificado", "fatos · tom · alertas" → "resumo · tom · vale conferir"
  (the Document tab's own words), "Laço de treino" → "Loop de treino", "ajuste" → "dev", "repositórios de fora" →
  "repositórios de teste". Checked rendered: wide, narrow and the training chain; every label fits its box.
- **PT-BR, "Como o Smart Assist funciona" rewritten** (`docs/SMART-ASSIST.pt-BR.md`) section by section from the
  English page's meaning, with the glossary: engine, regras heurísticas, copia & cola inteligente, conjunto de
  dev / de teste, open weight, pequeno modelo, "Quando aparece" for Trigger, button and tab names as the PT UI
  shows them. Headings, tables, code, links and every number are the English page's (a number check and a
  heading / fence / link comparison match). `check:docs`: no suggestion, no flag (7 long sentences split on the
  way), kind "docs", readability easy (LIX 37). The tone reads "formal · impersonal" where the English reads
  "neutral · you": English contractions count as casual and Portuguese has none (ROADMAP §4). EN §1.1
  "open-weights" → "open-weight", as §1.2.
- **PT-BR, "Como os dois modelos funcionam" rewritten** (`docs/MODELS.pt-BR.md`) from the English page's
  meaning: every term explained the first time in Portuguese, with the English ML term next to it where Brazilian
  devs use it (perda / loss, época / epoch, pista / feature, rótulo fraco / weak label); "Mantendo os números
  honestos" → "Números honestos", "Deixando pequeno" → "Como o modelo ficou pequeno"; the training diagram's
  Mermaid as the SVG says it. Numbers, tables (same rows, the glossary included), code and links match the English
  page. `check:docs`: clean (4 long sentences split on the way). With it, **every shipped document passes**:
  README, both docs pages in EN and PT-BR, both modes.
- **`check:docs` in CI** — every shipped document passes now, so the `check` job runs it after the eval (with
  `pipefail`: GitHub's default `bash -e` would let a failure through `tee`); its last line goes to the job
  summary. A failing document fails the run, like the eval's count.
- **E2E: the PT-BR sample offers what the English one does** — in the browser, the Suggestions tab lists the
  same 12 fixes on the same lines at the same confidences, and the Outline types the same sections, before and
  after switching the language (the check `check:docs` makes in Node, here through the real UI).
- **Link previews in both languages** (Pablo: "let's see how it goes bilingual" — the LinkedIn post is in PT-BR,
  and crawlers run no JS, so they always read `index.html`'s tags): `description`, `og:description` and
  `twitter:description` say it in English, then "·", then in Portuguese (the PT tagline "O editor de Markdown
  atento aos detalhes", "dois pequenos modelos de IA"); the English parts now say "AI models" like the start
  screen. Titles, the image and its alt text stay English (one image; titles get cut). Easy to revert after the
  post if the long description reads badly in the card.
- **ROADMAP, no code**: §3 (dogfooding) now lists what `check:docs` found in the rules — the sentence splitter,
  tone across languages, PT voice, docs headings the model reads as "other" — and §7 the two model ideas Pablo
  asked to plan: more section categories (what a type takes: strict-heading counts, rule coverage first, data,
  a fresh held-out set, a bar written first, +9 numbers per type, the UI and docs work) and a summary per section
  (better extractive as the next small Marksage model vs a tiny abstractive model in the browser vs BYOK, each for
  EN + PT, local-first and how to evaluate it; recommendation: extractive first, abstractive only through BYOK).

### 41.1 Pablo's review of the PT-BR About page (2026-11-06)

- **About's three buttons in one column** (Pablo: all on one line or one per line, not two + one) — in
  Portuguese "Testar com um documento de exemplo · Como funciona · Como os modelos funcionam" didn't fit the
  760 px column and wrapped two + one. Now a column in both languages, aligned on the left; "How the models work"
  got the same arrow as "How it works".
- **"New here? Try it on a sample document" is a link** (Pablo) — in Reading & writing, the button's name was
  italic text; now it opens the sample, like the button above (an inline button styled as a link, no `.tap`:
  it sits inside a paragraph). E2E.
- **About, second PT-BR pass from Pablo's review**, and the names of the app's controls in bold (Pablo: "words
  reserved for terms and features", as Regras and Assist already were) — Abrir, Colar, Copiar Markdown, Estrutura,
  Documento, Sugestões, Recentes, Fechar documento, Tela inicial, Renomear…, Exportar, Apagar todos os dados do
  Marksage; the same in English. PT: "identifica" (not "percebe"), "modelo de IA local", "card", "identificado
  corretamente", "quando duas linguagens são possíveis", "Identifica os pequenos erros", "o modelo de IA do
  Marksage que lê seções de texto", "uma hierarquia de títulos quebrada (um H2 seguido direto de um H4)" (EN the
  same, was "heading jumps"), "funciona out of the box … com regras heurísticas", "O Marksage suporta…", "o
  Marksage abre um documento novo" (it read as a misspelt imperative), "vai se lembrar", "apertando novamente, o
  download acontece na hora" (the shortcut list too: the two lines said almost the same), the shortcuts footnote
  says which buttons, "sai do seu dispositivo", the web-images paragraph without "aponta / pixel de rastreamento"
  (what the request reveals, in plain words; "Referer" kept as the header's name), "Tudo o que está listado em
  “O que fica guardado neste navegador”", "Nada do que você escreve no Marksage".
- **Two facts said precisely (EN + PT)**: Recent said "nothing is lost" — it keeps the 15 most recent (a new one
  pushes the oldest out) and skips documents over 400,000 characters (`lib/history.ts`). And the AGPL line:
  "you share your changes too" undersold it — making a changed version available to others, including as a
  website, means offering them its *complete* source under the same license (AGPL §13), not only the changes.
  "Marksage’s code and models are free software" (PT "O código e os modelos do Marksage são", Pablo's plural).
- **The mode table says "rules" the same way in every row** (Pablo: why "heading rule" in one row and "rules" in
  the others?) — the Outline row is rules too, the ones that read headings: "rules (from the heading)", then "the
  section AI model ✦"; the code row starts "AI model ✦". PT: "regras (pelo título)", "modelo de IA de seções de
  texto ✦", "modelo de IA ✦". In its three places (About, SMART-ASSIST §1.3 EN + PT-BR, README), kept in step
  as AGENTS asks.
- **PT-BR UI, the same review carried over**: "modelo de IA local" wherever the UI said "modelo local" (status,
  the ✦ tooltips, the Outline's model badges, the Suggestions footer), "regras heurísticas" in the start-screen
  pitch and the Rules + AI status, and the heading-jump flag is "Hierarquia de títulos quebrada" (EN "Broken
  heading hierarchy", was "Heading level jumps").
- **Docs and story, the same review carried over**: SMART-ASSIST (EN + PT) says "local AI model" / "modelo de IA
  local", "a broken heading hierarchy" / "hierarquia de títulos quebrada", "card", and the PT Rules mode answers
  "com regras heurísticas"; the story's AGPL entry says what the license asks (the complete source of a changed
  version made available to others, even as a website), EN + PT. `check:docs` still clean.
- **About: two doc links, the sample as a link** (Pablo, after the one-column try) — the big "Try it on a sample
  document" button left About: the start screen's is the one call to action, and visitors from a shared link land
  there first. The sample is now a link at the end of the Smart Assist intro ("Want to see it at work?" / "Quer ver
  funcionando?") and stays in Reading & writing ("New here?"). The two docs pages are text links on one row,
  styled like the story / GitHub links at the top (no button padding, so they line up with the text; they wrap
  one per line on a phone): "How Smart Assist works" / "Como o Smart Assist funciona" — the page's own title and
  the ⌘K command's name — and "How the models work" / "Como os modelos funcionam". E2E.
- **The review's patterns on the other PT-BR pages** (Pablo: carry the About points to the pages not reviewed
  yet) — beyond the term-level carry-over before: "pega regressões" → "detecta regressões", "Chuta" (the training
  loop's first step, and the diagram) → "Dá um palpite" / "palpite", "servem para várias linguagens" → "são válidas
  em", "encaixou melhor" → "foi a melhor escolha", "cara de código / de Python" → "aparência de código", "típicas
  de Python". A pattern pass, not a new line-by-line read: Pablo's own review of those pages is still to come.
- **Four facts the launch-post chat found, fixed** (Pablo approved the story wording) — the story's 10-23 entry named
  the bar ("without losing precision") but not the result: it now says v1 met part of it (1.8× the right suggestions,
  3 points less precise, just short of the coverage target) and so shipped opt-in, with the rules' 97% in the facts;
  the 10-24 entry adds that v2 was still about a point under the rules on the fresh set (91.8% vs 92.9%), so the AI
  mode stays opt-in. Not contradictions, made explicit: the story's 250,000 blocks are the first model's collection
  (§ phase 1: 265 sources), the docs' 270,000 the second's; MODELS §8's rules row is today's rules (76 shown,
  97.4%), now labelled, with v1's-day numbers (75 shown, 97.3%, 73 right) below the table. SMART-ASSIST EN said
  "can never be malformed" — now "never comes back in an unexpected shape", as PT and the story already did.
  Pablo: "my call" (in public writing) covers only the later experiments, not v1's and v2's opt-in shipping.
- **The sample's license line** (Pablo: an MIT license on Pitwall could read as Marksage's own) — now just
  "AGPL-3.0." in both languages (a first try, "the same license as Marksage", was undone before push: inside
  Marksage it doesn't need saying). Kept rather than removed: the section carries the `##License` slip (the heading
  fix, line 86). `check:docs`: the sample still as designed.
- **About: the story link on a phone** (Pablo, PT-BR at phone width; a first fix, undone before push, still left the
  arrow alone on a line) — the PT label is now "A história por trás do Marksage" (Pablo's pick; one line on phones),
  and the link no longer centres a wrapped label: the icon sits on the first line, the text is left-aligned, and
  `NoOrphanArrow` keeps the arrow with the last word (EN still wraps at 390 px and narrower, cleanly). The GitHub
  link is unchanged.
- **The Story page, Pablo's PT-BR review** (read as a Brazilian dev arriving from the LinkedIn post) — calques and
  echoes out: "Modelos de decisão, e não os generativos convencionais" (title, Pablo's), the decision-models paragraph
  opens with what they are and dates them after ("Ganharam força em setembro…"), "um modelo pequeno", "que resolva"
  (not "satisfaz"), "80% ou mais de confiança", "A primeira engine é um conjunto de regras", "canceladas se o texto
  tiver sido alterado" (Pablo's), "cada pista passa por um hash e vira 8 números", "Um nível de confiança só serve
  se…", "a v2 ainda ficou", "classifica 13,5% das seções", "O que você digita aparece primeiro", "numa dependência
  que interpreta o Markdown" (Pablo's), and the QA paragraph says plainly what the fallback is: the rules decide when
  they're nearly certain (EN too, "a measured fallback for now" was as opaque). "régua" → "critério de aprovação",
  "treino" → "treinamento" on this page (the docs follow in the next commit). The footer no longer says "são dele"
  right after "Claude" (it read as Claude's): "Feito por {author}. A IA (Claude) ajudou na implementação e na
  revisão; a arquitetura, os critérios de aprovação e cada decisão sobre o que entra ou não no app ficaram com o
  autor. Código-fonte, código de treinamento e arquivos dos modelos: …".
- **"treinamento" and "critério de aprovação" across the PT-BR docs** (Pablo: "treino" reads like the gym, "régua"
  doesn't read well) — "treino" → "treinamento" everywhere in SMART-ASSIST and MODELS PT-BR (the Mermaid source and
  the training diagram too: "Loop de treinamento"), "régua" → "critério de aprovação" ("atendeu ao critério de
  aprovação"). AGENTS' glossary says so, and so does the PT-BR playbook in Pablo's vault.
- **The Smart Assist page, Pablo's PT-BR review** — "O motivo é engenharia, e não hype momentâneo" and "a precisão,
  medida num conjunto de teste" (Pablo's, §1.1), "definido de antemão", "por nível" (not "degrau"), "que resolva",
  BYOK without "chave… chave", "não têm rótulos independentes para um modelo aprender", "Em *Regras + IA*, a "IA"
  são…", "serve de plano B", "reconstruída a partir do texto com um pequeno atraso", "registrado no textarea",
  "recebe uma nota pela taxa de aparência de código" (it said "pontuado… pontuação"), "a confiança cresce com o
  tamanho da seção" (not "nitidez"), "preferência pelas frases do começo", "em vez de arriscar um palpite",
  "conjuntos de exemplos" (not "fixtures"), "Ele confundiu com código…", and "Cada recurso é medido por" (the docs'
  only "nós"). Two terms everywhere in PT-BR (docs, About, the start-screen pitch, the Rules + AI notice, AGENTS'
  glossary, the sample): "modelo(s) pequeno(s)", not "pequeno(s) modelo(s)", and "classificar", not "dar tipo a".
- **Why Rules + AI is opt-in, said fully** (SMART-ASSIST §4.3, EN + PT-BR) — the docs gave one reason (it downloads
  a file and keeps it in the browser); the story gives the other. Both now: "…and because its precision isn't yet
  clearly above the rules'" (a point below on the first two held-out sets, a point above on the third — not the
  "still a point under on unfamiliar projects" first proposed, which the third set no longer supports).
- **The Models page, Pablo's PT-BR review** — Pablo's lines: "E por que não um LLM convencional?", "é executado
  inteiramente dentro da página", "então, primeiramente, o texto precisa se tornar algo possível de se
  contabilizar", "Para executar você mesmo", "Não dá para aprender linhas em negrito dessa forma". The approved rest:
  "a mesma arquitetura" (not "desenho"), "o trecho do exemplo" (not "o nosso"), "A média dos sinais" (not "Tira-se"),
  "o modelo de decisão open weight considerado no começo", "não é escolhida a olho", "80% de confiança", "a direção é
  surpreendentemente simples de calcular", "A correção que cada exemplo provoca", "de antemão", "estejam certas",
  "Trechos de uma linha só", "captaria", "classificar" (the last "dar tipo"), "a média simples". Two terms across
  every PT-BR page (Pablo's calls): ML features are **sinais** — "pistas" read badly, and "sugestões" would collide
  with the Suggestions tab and every suggestion (MODELS, SMART-ASSIST, the story, the inference diagram; genders
  redone: "sinais decisivos", "os outros 65") — and the dev set is the **conjunto de desenvolvimento** (never "dev"
  alone; the training diagram's step 3 now reads "treinamento · desenvolvimento · teste", "(escolhas)" and "(uma
  vez)" dropped to fit the box — step 7 already says "Mede uma vez"). "previsões" stays. One SMART-ASSIST sentence
  grew past 40 words with the longer term and was split (§4.6, link text). AGENTS' glossary says so.

## 42. Launch QA fixes (2026-11-09)

A ten-agent QA round before the LinkedIn post (report in Pablo's vault: `Personal/Writing/Marksage Launch QA
(2026-11-09).md`); Pablo approved the six fixes it recommended before posting — one commit each.

- **Images from the web: `https:host` no longer gets through (QA D01).** `remoteHost` called an address remote only
  if it started with `//` or `http(s)://`, but the browser resolves `https:host/x` and `https:/host/x` (no `//`) to
  `https://host/x` and fetched them with the setting off — and the bar didn't count them. It now decides the way
  the browser does: `new URL(src, location.href)`, remote when the protocol is http(s) and the host isn't this site's;
  an address that doesn't parse fetches nothing. `countRemoteImages` takes any destination and runs it through the
  same predicate, after undoing Markdown's backslash escapes (`https\://` renders as `https://`) and percent-encoding
  a leftover backslash as the parser does (`\\host` renders as a relative `%5C%5Chost`, not another site). Unit
  tests for both forms, `HTTPS://`, `//`, escapes, references and code; checked in Chromium on the build (no request
  leaves with it off; the bar counts 4 of 4). §32 #11's "no request leaves the app with it off" holds again.
- **Link previews and the start screen say the models are opt-in (QA D02).** Both languages said Smart Assist works
  "with rules and two small AI models… on your device", but a first visit is Rules only (`loadAssistMode`) and the
  models download only in Rules + AI. Now: the start screen's pitch says "Smart Assist suggests fixes with rules.
  Turn on Rules + AI and it also uses two small AI models trained just for Marksage, running on your device" (PT
  "Ative Regras + IA e ele também usa dois modelos de IA pequenos, treinados só para isso…"; "for it" named
  Marksage, it was ambiguous); `description`, `og:description` and `twitter:description` add "if you turn them on" /
  "se você ativar", and og/twitter now keep EN's "trained just for…" ("treinados só para isso"). After the deploy:
  LinkedIn Post Inspector on the live URL, so the card isn't the cached old text.
- **PT-BR: "pequenos modelos de IA", the adjective first** (Pablo, 2026-11-09: he prefers "dois pequenos modelos de
  IA" to "dois modelos de IA pequenos", reversing the 2026-11-06 glossary call). Every attributive use, in the same
  commit as D02: the three description tags, the start screen, the Rules + AI notice, About, the sample's checklist,
  the story, SMART-ASSIST and MODELS ("pequenos modelos próprios", "um pequeno modelo treinado para aquela
  pergunta"). Predicative uses stay ("deixa o modelo pequeno e rápido"). AGENTS' glossary says so.
- **A paragraph on "How Smart Assist works" no longer renders as an H2 (QA D03).** In `docs/SMART-ASSIST.md` §3,
  the `---` before §4 sat right under the "**Action.** None in the panel…" paragraph, so CommonMark (the app and
  GitHub) read it as a setext heading. A blank line fixes it (the PT page had one). `check:docs` now fails on any
  `---`/`===` right under a paragraph line in the shipped docs (outside code; lists, quotes, tables and headings
  excluded) — it hadn't noticed this one.
