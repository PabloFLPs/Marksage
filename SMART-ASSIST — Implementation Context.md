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
