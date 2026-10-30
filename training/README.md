# training/ — data for Marksage's own models

Two models ship from here: the **code-language model** (`lang-v2.bin`, below) and the **section model**
(`sections-v2.bin`, for the Outline panel). Two more were trained and measured on 2026-10-28 and are **not
used** — a structure model and a paste-type model — and a rule for the link text of pasted URLs was measured and
dropped (see the last sections). All models use `fasttext.ts`.

Smart Assist's code-block language detection (F1) is precise but quiet: on real documents the
heuristics speak on about a quarter of blocks. The plan is a small, purpose-trained classifier
(fastText-style, a few hundred KB, plain TypeScript inference, no runtime) that must beat the
heuristics on held-out data before it ships.

```bash
node --experimental-strip-types training/collect.ts     # clone sources at their manifest commits, extract labelled blocks (~10 min)
node --experimental-strip-types training/collect.ts --sources sources-test2.json --out blocks-test2.jsonl --manifest manifest-test2.json
node --experimental-strip-types training/collect.ts --sources sources-test3.json --out blocks-test3.jsonl --manifest manifest-test3.json
node --experimental-strip-types training/build-test3.ts   # frozen: fences.real3.json exists, so this does nothing without --force
node --experimental-strip-types training/build-sets.ts  # split by repo → train / dev / test
node --experimental-strip-types training/train.ts --dim 8 --buckets 32768 --cv-temp --short-t --target-precision 0.95 --save public/models/lang-v2.bin
npm run eval:assist                                     # heuristics + model on every set

# section model (reads the clones collect.ts made)
node --experimental-strip-types training/build-sections.ts    # sections → data/sections.jsonl (~70 s)
node --experimental-strip-types training/train-sections.ts --save public/models/sections-v2.bin   # add --test once, for the reported numbers

# tried, not used (2026-10-28) — see the last sections
node --experimental-strip-types training/build-structure.ts && node --experimental-strip-types training/train-structure.ts
node --experimental-strip-types training/build-pastes.ts && node --experimental-strip-types training/train-pastes.ts --epochs 5
node --experimental-strip-types training/eval-links.ts
```

| File | Committed | What it is |
|---|---|---|
| `sources.json` | ✓ | Public repos used: docs (fenced blocks) and a few "code" sources (windows of real source files, labelled by extension, to fill rare languages). |
| `manifest.json` | ✓ | Commit of every clone, so the data can be rebuilt exactly: `collect.ts` checks each clone out at its manifest commit (`--fresh` clones HEAD and rewrites the manifest instead). |
| `splits.json` | ✓ | Which repos are dev and test (everything else is train). |
| `labels.ts` | ✓ | Info string → language map, shared by every set (`sh`/`console` → `bash`, `tsx` → `ts`, …). |
| `fasttext.ts` | ✓ | Shared training code: SGD with a decaying rate, class re-weighting, temperature fitting, int8 export (MSLM format). |
| `train.ts` | ✓ | Code-language trainer: temperature calibration, int8 export. Deterministic (same data + seed → identical file). |
| `build-sections.ts`, `train-sections.ts` | ✓ | Section model: dataset from the cloned Markdown, trainer (see the last section). |
| `sources-test2.json`, `manifest-test2.json`, `build-test2.ts` | ✓ | The second, fresh held-out set (`fences.real2.json`): 72 repos used nowhere else, built once and frozen. |
| `sources-test3.json`, `manifest-test3.json`, `build-test3.ts`, `jsonComments.ts` | ✓ | The third held-out set (`fences.real3.json`, 2026-10-30, for v3): 221 repos used nowhere else (158 in the sample), built before any v3 training and frozen. |
| `build-structure.ts`, `train-structure.ts`, `structureFeatures.ts` | ✓ | Structure model (tried, not used): dataset, trainer, clue reader 3. |
| `build-pastes.ts`, `train-pastes.ts`, `pasteFeatures.ts` | ✓ | Paste-type model (tried, not used): dataset, trainer, clue reader 4. |
| `eval-links.ts`, `linkText.ts` | ✓ | Link text for a pasted URL (rule measured, not used). |
| `data/` | ✗ (gitignored) | Clones, `blocks.jsonl` (~270k blocks), `blocks-test2.jsonl`, `train.jsonl` (~64k), `sections.jsonl` (~41k sections), `structure.jsonl` (~107k lines), `pastes.jsonl` (~29k pastes) and `issues/` (the GitHub issue pools of the 2026-10-28 sets). Rebuild with the scripts. |

## How the sets are made

- **Labels** are the info strings the original authors wrote (` ```python `), normalised by `labels.ts`.
  They carry a little real-world noise (a `go`-tagged debugger session, `html`-tagged Blade templates) —
  that's what the app will see too. Tags outside the app's 20 languages (+ plain text) are dropped; blocks are 1–40 lines.
- **Split by repository**, never by block, so a project's style can't leak from train into evaluation.
  The 25 repos behind the original 64-block held-out set are pinned to test; then every language gets
  ≥ 6 test repos and ≥ 4 dev repos (smallest qualifying repos first, so training loses little).
- **Leak guard:** any training block whose text, or first three lines, matches a dev/test block is removed
  (translated docs repeat code verbatim).
- **dev** (`src/assist/__fixtures__/fences.dev.json`, ~280) — tune and calibrate against this.
  **test** (`fences.real.json`, ~315, ≤ 15 per language, incl. the original 64) — held out: run once per
  candidate, never tune against it.
- **train** — capped at 6,000 blocks per language and 600 per repo per language, so no single project
  or language dominates.

## The model (v1, committed 2026-10-24, d425964) — superseded by v2 below

`src/assist/model/` — shared by the trainer and the app, so both see identical features.

- **Features** (`features.ts`): a *set* of hashed strings per snippet — tokens, token pairs, first token and
  first two tokens of each line, last character of each line, indentation style, character trigrams of
  words. 32,768 hash buckets.
- **Network** (`model.ts`): mean of one 8-dim vector per feature → linear layer → softmax over the 21
  languages, with a temperature fitted on dev (1.85) so confidences mean what they say.
- **File:** `public/models/lang-v1.bin`, 385 KB (int8 vectors with a per-row scale). Inference ≈ 0.1 ms.
- **Training:** 55k blocks, 8 epochs, lr 0.4 linearly decayed, classes re-weighted by (n_max/n)^0.5; ~18 s.
  A sweep over size (8–24 dims, 16k–131k buckets), epochs, lr and weighting moved dev results by less
  than the dev set's noise, so the smallest good model won.

**Chosen on dev before touching the held-out set:** model alone, behind the app's usual gate
(top ≥ 0.8, margin ≥ 0.2). The hybrids were worse on dev (heuristics → model loses precision;
model → heuristics adds coverage but loses precision too).

| Held-out (`fences.real.json`, 314 blocks, run once) | Accuracy | Shown | Precision when shown | Right / wrong shown |
|---|---|---|---|---|
| Heuristics | 57.3% | 75 (24%) | 97.3% | 73 / 2 |
| **Model v1** | **75.8%** | **141 (45%)** | 94.3% | **133 / 8** |

Against the bar set beforehand: accuracy and coverage are far better (≈ 1.8× the right suggestions),
precision is 3 points lower (not significant at these sizes, but the point estimate is lower) and coverage
is just short of the 50% target. Of the 8 wrong suggestions, 6 are genuine misses on 1–3 line snippets
(`show slave status` → bash, `List<int> xs = new();` → java, `# Hello, *Mercury*!` → yaml) and 2 are
defensible (untyped code tagged `typescript`; a shell session tagged `text`).

**v2 ideas** (tune on dev, then measure on a *fresh* held-out set — this one has now been seen once):
a stricter gate or a short-snippet feature for ≤ 3-line blocks; more SQL/C#/Markdown one-liners in
training; TS-vs-JS cues (type annotations, `interface`, generics).

## The model (v2, 2026-10-24) — current

`public/models/lang-v2.bin` (385 KB, same format and size as v1) replaced v1.

**What changed** — all decided on dev; the fresh held-out set was run once at the end:
- **More, more varied training data:** 45 more repos (309 sources, ~270k blocks → 63,751 training blocks).
  Dev/test repos are frozen in `splits.json`, so earlier numbers stay comparable; pools are sorted before
  sampling so rebuilds are byte-identical.
- **Calibrated on unseen repos:** `--cv-temp` trains 5 extra models on repo folds of train and fits the
  temperature on their out-of-repo predictions (~7,600 blocks from ~190 repos) instead of the 280 dev
  blocks; `--short-t` fits short snippets (≤ 3 lines) separately (v2: 1.85 / 2.55); `--target-precision 0.95`
  then raises each temperature until out-of-repo precision at the app's gate reaches 95%.
- **Agreement hybrid** (`src/assist/model/hybrid.ts`): if the model isn't confident, a confident heuristic
  answer is used only when the model's top pick agrees. +~20 suggestions on dev at equal precision.
  Since 2026-10-30 also when the heuristics are ≥ 99% sure (`RULES_OVERRIDE`, launch QA #17): dev 157 → 158
  shown at the same 94.9% precision, accuracy 81.8% → 82.1%; held-out sets unchanged.
- **Tried and dropped:** training on 1–3 line slices of longer blocks (−2 to −5 points accuracy on dev);
  bigger models (12–16 dims, 64k buckets: more coverage, ~3 points less precision).
- Seed 1 (the default) was kept — not the best-looking seed.

| Dev (280) | Accuracy | Shown | Precision |
|---|---|---|---|
| v1 | 78.9% | 148 (53%) | 92.6% |
| **v2** | **82.1%** | **158 (56%)** | **94.9%** |

| Fresh held-out (`fences.real2.json`, 284 blocks / 67 repos, run once) | Accuracy | Shown | Precision | Right / wrong |
|---|---|---|---|---|
| Heuristics | 58.5% | 70 (25%) | 92.9% | 65 / 5 |
| v1 | 71.5% | 151 (53%) | 88.1% | 133 / 18 |
| **v2** | **74.3%** | **158 (56%)** | **91.8%** | **145 / 13** |

On the first held-out set (already seen once by v1's evaluation): v2 77.4% / 164 / 95.7% (v1 75.8% / 141 / 94.3%).

**Against the bar:** better than v1 on every number on both sets, coverage ≥ 50% ✓, but precision is
1.1 points below the heuristics on the fresh set (not significant at these sizes) — the "match the
heuristics' precision" goal is not met yet. ~5 of the 13 wrong suggestions are label quirks
(`dotnet build -c Release` tagged `csharp`, a `> cd … && cargo run` session tagged `text`); the rest are
one-liners valid in several languages (`void main() { … }`, `print page.html`, `foo.doSomething();`) and a
few genuine misses (`a {}` → js). v3 ideas: a "too short to tell" abstain rule for one-liners; per-language
gates; more CSS/diff/Markdown in training.

## Third held-out set (2026-10-30) — for v3

Both earlier held-out sets had been run, so v3 is judged on a fresh one, built **before any v3 training** and frozen
(`fences.real3.json`, `build-test3.ts`). 225 repos picked to be in no other source list, fixture or issue pool
(4 failed to clone: 221 collected, pinned in `manifest-test3.json`); 436,541 blocks, 16,773 dropped as already seen
anywhere in the collection or the fixtures. Sampled: ≤ 30 per language, ≤ 3 per repo per language, 1 per file per
language; the pairs v3 is about — ts, js, c, cpp, csharp, java — topped up to 60 (C reached 52); plus 40 `json`
blocks with comments (`subset: "json-comments"`, `jsonComments.ts`: `//` or `/*` outside strings), since `jsonc`
and `json5` share the `json` label and "JSONC vs JSON" can't be a pair otherwise. **842 blocks from 158 repos.**
It stays out of `npm run eval:assist` until its single run at the end of the v3 work.

## Section model v1 (sections-v1, 2026-10-24) — replaced by v2

`sections-v1.bin` (385 KB, in git history since v2; dim 8, 32,768 buckets, featurizer 2 = `src/assist/model/sectionFeatures.ts`)
types sections for the Outline panel when the heading rule (`src/assist/sections.ts`) can't. Fetched only while
the Outline is open in Rules + AI mode (then called "Local model", later "Hybrid").

**Data** (`build-sections.ts`): every Markdown file of the clones, split into sections by the app's own splitter.
A section is labelled only when the *strict* heading rule names exactly one of the 10 types (phrase covers ≥ half
the heading, no competing type, no ambiguous phrase like "Features"); the model gets the text under the heading,
never the heading. An 11th class, `other`, is sampled from sections whose heading names no type (≤ 40 per repo,
spread over files), plus navigation sections ("See also", "Next steps") always. ≤ 60 per repo per type; texts
deduplicated within a split; template-only bodies (`{% include %}`, `[!code…]`, images) skipped.
Split by repo: `splits.json` dev → dev (27 repos), `splits.json` test + `sources-test2.json` → test (133), rest → train.
Train 26,105 sections (7,832 `other`), dev 4,316, test 11,107.

**Choices, all on dev:**
- dim 8 / 32k buckets / 3 epochs / lr 0.3 / balance 0.5 — bigger (dim 16, 64k) or longer (5–10 epochs) overfit:
  same or lower agreement, up to 1.3 MB.
- The `other` class: without it the model typed every topic section ("Arrays", "Amazon S3"); a hand check of its
  confident answers on untyped sections was ~2 in 3 right. With it, ~9 in 10, at a small cost in coverage.
- Version headings (`v1.2.3 (date)`, `[2.0.0] - …`) became a heading rule, navigation headings are never typed.
- Gates: 0.8 / 0.2 like everything else for a confident badge; from 0.6 the app shows a muted "probably" badge
  (`LABEL_GATE` in `src/assist/outline.ts`) — a label edits nothing.

| Dev (3,076 typed + 1,240 other) | Shown | Agrees with heading | "Other" given a type |
|---|---|---|---|
| gate 0.8 | 346 (11.2%) | 91.0% | 3.0% |
| gate 0.6 | 662 (21.5%) | 86.3% | 8.5% |

| Test (6,002 typed / 133 repos + 5,105 other, run once) | Shown | Agrees with heading | "Other" given a type |
|---|---|---|---|
| gate 0.8 | 904 (15.1%) | 91.5% | 4.8% |
| gate 0.6 | 1,645 (27.4%) | 87.1% | 11.0% |

Changelog sections are 547 of the 904 shown at 0.8 (test2 repos have many release notes); without them agreement is
88%. Weakest types: guide (0/6 shown on test — "usage" text looks like setup or example), config (45/63).
Labels are weak (heading-derived), so "agrees" isn't hand-checked accuracy; the hand check of confident answers
on sections whose heading names no type (dev repos, ~25 samples per round) matched it.

### Tried: an "explanation" type (2026-10-25) — not shipped in the model

Goal: make the Outline type explanation sections ("How it works", "Architecture", "Concepts" — Diátaxis' fourth
kind), so the docs can showcase the Outline. Two rounds, all on dev:

1. Heading labels only (`how it works`, `architecture`, `rationale`, `core concepts`, … — 748 train sections): the
   model never showed "explanation" past the gate (0 shown); real explanation sections came out as `other` or
   `overview`.
2. Plus folder labels: sections in Diátaxis-style folders (`concepts/`, `explanation/`, `architecture/`,
   `how-it-works/`, `internals/`, …) whose heading names no type → 1,283 train sections. Still 0 right when shown
   at every setting tried (dim 8/16, 32k/64k slots, class balance 0.5/0.75/1). Mean p(explanation): 0.12 on
   explanation sections vs 0.07 on `other` — not separable with bag-of-clue features.

Outcome: `explanation` is a heading-only type (`SECTION_TYPES`); the model keeps 10 types + other
(`MODEL_SECTION_TYPES`), and `build-sections.ts` drops explanation-labelled sections. `sections-v1.bin` unchanged.

"Background" moved from overview to explanation and, like "Features", only counts as the whole heading.
Telling explanation from topic prose needs a model that reads more than word clues — a general decision model
(step 3 of the ladder in docs/SMART-ASSIST.md §1.2) is the natural candidate.

### Heading rule change after v1 (2026-10-27)

"Security policy" / "Segurança" no longer count as *License & credits* — a security section is neither. `sections-v1`
was labelled with the old rule: 61 sections whose heading names security were `legal` examples. The model itself
didn't answer `legal` from security text (checked: a vulnerability-reporting text → `other` 53%, `legal` 26%). The
same day, v2 turned those headings into `security` labels (below).

## Standalone runner

`examples/marksage-models.mjs` — a zero-dependency copy of the inference code (loader, both clue readers, hash,
`decide`). `npm run eval:assist` checks it returns exactly the app's probabilities on every code fixture and every
docs section. Model cards with the full spec: docs/MODELS.md §7.

## Section model v2 (sections-v2, 2026-10-27) — in use

`public/models/sections-v2.bin` (394,008 bytes, same recipe and settings as v1). Adds three types the model
answers — **security**, **performance**, **deployment** — and two the heading rule gives alone — **glossary**,
**roadmap** (`HEADING_ONLY_TYPES`, with explanation). The security headings that v1 learnt as `legal` are now
`security` labels.

**Why these five:** heading counts over the 381 cloned repositories (637,122 headings; exact-heading regexes,
numbering and emoji stripped): security 555 headings in 169 repos, performance/benchmarks 447 in 96,
deployment 379 in 61, glossary 76 in 41, roadmap 57 in 37. Other candidates were already covered (requirements →
setup, migration → changelog, testing → contributing, FAQ → troubleshooting, architecture → explanation).
Glossary and roadmap are too rare to learn from, so they are heading-only.

**Data:** train 27,250 sections (7,813 `other`; security 405, performance 723, deployment 246), dev 4,474
(3,233 typed + 1,241 other; security 114, performance 74, deployment 14), test 11,434 (6,339 typed / 134 repos +
5,095 other; security 154, performance 218, deployment 27).

**Choices, on dev:** the v1 settings again (dim 8 / 32k / 3 epochs / lr 0.3 / balance 0.5). Tried balance 0.75
and 1 (more of the rare types shown, lower agreement: 89.9%, 88.9%), 5 epochs (93.0% but 8.9% shown), dim 16
(13.1% shown, 89.4%). Dev has too few performance (74) and deployment (14) sections to judge them — a known risk.

| Dev (3,233 typed + 1,241 other) | Shown | Agrees with heading | "Other" given a type |
|---|---|---|---|
| gate 0.8 | 385 (11.9%) | 90.9% | 3.5% |
| gate 0.6 | 718 (22.2%) | 85.5% | 8.8% |

| Test (6,339 typed / 134 repos + 5,095 other, run once) | Shown | Agrees with heading | "Other" given a type |
|---|---|---|---|
| gate 0.8 | 858 (13.5%) | 88.9% | 4.2% |
| gate 0.6 | 1,588 (25.1%) | 85.6% | 10.4% |

Per type on test at 0.8 (agree / shown): changelog 371/394 · setup 88/109 · example 61/68 · legal 57/58 ·
performance 45/60 · config 44/58 · security 34/38 · reference 27/32 · contributing 27/28 · troubleshooting 7/8 ·
guide 0/3 · deployment 2/2 · overview 0/0. Without changelog: 392/464 = 84.5%.

**Against v1 on the same test set** (both files through `examples/marksage-models.mjs`, so the same quantised
numbers the app uses): v1 922 shown (14.5%), 89.6% agree; v2 857 (13.5%), 88.9%. On the old types only: v1
903 / 91.5%, v2 770 / 88.4% — v2 shows fewer changelog sections (393 vs 560, more precise: 94% vs 92%) and is
less precise on setup (88/109 vs 84/88). v1 couldn't type security text at all: of the 154 security sections
it gave 144 no type, 6 changelog, 3 legal, 1 config. Net: level overall, three new types, performance the
weakest (75%). A v3 would start there.

**Hand check** (dev sections whose heading names no type, every confident answer: 43): 9 were navigation
sections ("Related content", "Next steps", "What's next?") that the app never asks about — including all 3
security and the 1 deployment answer. Of the other 34, about 30 right (~9 in 10, as v1).

## Real-text sets for structure hints and pastes (2026-10-28)

Curated docs rarely contain `-item` or `#Title` mistakes — their authors fixed them. So the structure sets come
from **unpolished text**: GitHub issues, pull requests and comments (fetched with the public API from the
maintainer's machine, 100 bodies per request) and GitHub wikis (cloned).

- **Explored pool → dev.** Issues of 20 repositories plus 16 wikis. Samples of its candidates were read while
  deciding the new kinds, so it can only be dev: 176 lines were added to `lines.dev.json` (now 212). The rules
  for the new kinds and the fixes (hashtag lines, `ls -l` output, captions, identifiers, separators) were tuned here.
- **Fresh pool → held-out.** Issues and comments of 59 other repositories (none in the corpus or an earlier set),
  only *counted* until the sample was drawn: 6,929 bodies. `lines.real2.json`: 227 lines from 43 repositories,
  stratified by kind (≤ 8 per repository and kind, ≤ 3 per issue), each case a ±3-line window with `line` naming
  the labelled line (the window is trimmed so it never starts inside a code fence).
- **Labelling** follows `src/assist/__fixtures__/README.md` (true when the fix makes the document more correct),
  done line by line without any rule or model score in view, with a `note` on the arguable cases. The set was
  frozen (labels written before anything was run on it) and run once.
- **Pastes.** `pastes.real2.json`: 53 real pastes from 19 sources outside the corpus — CSV and TSV data files,
  spreadsheet copies (cells joined by tabs), `pip list` and `kubectl get` output, excerpts of source files in 8
  languages, `package.json` / `tsconfig` / a VS Code settings file / a minified API response, README lists (as a
  browser copies them) and paragraphs in English and Portuguese.

## Tried: a structure model (2026-10-28) — not used

**Question:** "is this near-miss line a list item or a heading?" (`no` / `yes`; the app's `noul` would be p(yes)).
**Input:** the prefilter's window (the line ± 2), the line marked with U+0001. **Clue reader 3**
(`structureFeatures.ts`): the marker (`-`, `*`, `1.`, `1-`, `#`…`######`, `**…**`, `•`, `—`, `✔️`), indentation, what
follows the marker, the words after it, first / last word, first two tokens, last character, shapes (URL, `/`,
`:`, `=`, `$`, backticks, braces, a flag inside, hashtags, `ls -l` permissions, separators, sentence end, colon end,
identifier, CJK…; the decisive ones count three times, since the model averages its clues), and the category of
each neighbour (blank, list item, the same near-miss, glyph line, numbered item, heading, bold line, fence, table,
quote, HTML, indented, code-like, URL, prose, none) with the first word of the lines just before and after.

**Data** (`build-structure.ts`, split by repo like the section model): train 66,076 · dev 10,501 · test 32,888.
- *yes* — real list items and headings with the near-miss put back in: `- item` → `-item` (60%) or a glyph (40%:
  `•`, `●`, `·`, `▪`, `–`, `—`, `✔️`, `✅`…), `1. item` → `1.item` or `1- item`, `## Title` → `##Title` or `**Title**`
  (levels 2–4, ≤ 10 words, after a blank line). Neighbouring items of the same list get the same treatment half
  of the time (90% for glyphs: pasted lists come all at once). Kept only if the prefilter flags that exact line
  with that kind. ≤ 60 per repo and kind.
- *no* — real look-alikes: the prefilter's prose candidates in the docs (footnotes, multi-line emphasis, flags,
  wrapped "-1 …", `#include`…; a few are real mistakes, e.g. Chinese `1.模拟…` lists — weak labels), bold-only
  lines (6,543 — noisy on purpose: some are real headings), lines inside code blocks that would be flagged if
  pasted without the fence (CLI help, `#include` / shebangs / attributes, `#` comments, diff lines, CSS, negative
  numbers), and synthetic hashtag lines (from real heading words) and "-Name" signatures (from real `author:`
  front matter), which the docs never have.

**Choices, on dev** (`lines.dev.json`, 212 hand-labelled lines): dim 8 / 32k / 3 epochs / lr 0.3 / balance 1.
Tried 5 epochs, dim 16, balance 0.5: within noise or worse. More synthetic signatures and hashtag lines and the
triple-counted shapes helped (model precision 87.9% → 93.8%). Bold negatives can't be fixed: dropping them makes
every bold line a "yes" (precision 67%); keeping them teaches "bold → no". The combination to judge on held-out
was fixed on dev: **the rules, plus the model's answers ≥ 0.95 where the rules stay below the gate**.

| `lines.dev.json` (212) | Shown | Right when shown | True lines found (of 118) |
|---|---|---|---|
| Rules | 115 | 97.4% | 112 |
| Model | 64 | 93.8% | 60 |
| Rules + model ≥ 0.95 | 116 | 97.4% | 113 |

| `lines.real2.json` (227, run once) | Shown | Right when shown | True lines found (of 132) |
|---|---|---|---|
| Rules | 140 | 88.6% | 124 |
| Model | 76 | 90.8% | 69 |
| Rules + model ≥ 0.95 | 141 | 88.7% | 125 |

Per kind on held-out (right / shown): rules — bold 42/45, `#Title` 1/6, glyph 40/43, `-item` 31/36, `1.item` 9/9,
link 1/1; model — bold 5/5, `#Title` 0/3, glyph 31/33, `-item` 24/26, `1.item` 8/8.

**Outcome:** the combination met the bar set beforehand (precision ≥ the rules', at least as many true lines) by
one line in 227. Pablo chose not to ship a 385 KB download for that; the model file isn't committed (training is
deterministic: the commands above rebuild it byte for byte). The rules' held-out mistakes — `#VEMPRARHITMO 🚀` (the
emoji counts as a word), hashtagged job titles, `+20K estudantes`, diff lines, a CSS selector, pasted log lines —
are mostly lines the model gets right; the model's — signatures (`-Jake`, `-vin`), `#32 will fix this`, `#76 has a failing test` — are
lines the rules get right. **v2 idea:** require both to agree (or let the model veto), judged on a *fresh*
held-out set; this one has been seen.

## Tried: a paste-type model (2026-10-28) — not used

**Question:** the seven smart-paste kinds. **Clue reader 4** (`pasteFeatures.ts`): parses as JSON (strict /
loose; decisive, counts three times), number of lines, tabs on every line and how consistent their count is,
comma cells (consistency, average length, wordy cells, quoted cells), columns aligned by 2+ space gutters, a
`-----` rule row, bullet-marked lines, short lines without end punctuation, blank lines, hard-wrapped prose,
sentence-like lines, code structure, average line length, words per line, the first token and last character of
each line, and the tokens of the first lines.

**Data** (`build-pastes.ts`, split by repo): train 16,977 · dev 2,857 · test 9,291 — code (real fenced blocks,
JSON excluded), json (real ```` ```json ```` blocks that parse; 25% minified), csv / tsv / table (real Markdown
tables written back as CSV, as spreadsheet cells joined by tabs, or padded into terminal columns, sometimes with a
`---` rule; plus real ```` ```csv ```` / ```` ```tsv ```` blocks), list (real lists as a browser copies them: markers
gone, or `•`), prose (real paragraphs, rendered). Only pastes the app would ask about.

**Choices, on dev** (`pastes.dev.json`, 27): dim 8 / 32k / lr 0.3 / balance 0.5; 5 epochs (3 and 2: lower
accuracy; dim 16: less precise). Rules 19 shown / 100%; model 17 / 94.1%; agreement 20 / 95.0%.

| `pastes.real2.json` (53, run once) | Accuracy | Shown | Right when shown |
|---|---|---|---|
| Rules | 94.3% | 41 | 97.6% (40) |
| Model (and agreement) | 92.5% | 44 | 90.9% (40) |

**Outcome:** below the rules' precision, so not used. Its four wrong suggestions: `kubectl get` output, a list of
upgrade commands, the VS Code settings file (JSON with comments) and `renovate.json` — all called code. Its
training tables are clean Markdown tables; real terminal output and real configs are messier.

## Tried: link text for a pasted URL (2026-10-28) — not used

**Idea (Pablo):** pasting a URL offers `[text](url)`. Offline, the text can only come from the URL itself.
`eval-links.ts` judges a rule against real authors: every link that stands alone on its line or list item (the
closest thing to a pasted URL) is a URL with the text its author chose; "same text" ignores case, punctuation and
accents (an issue link also counts when the author wrote just "#123").

On the dev repositories (28; 2,842 links), the derivations tried: the page's last path segment ("getting-started"
→ "Getting started") matched 10.4% of offers, a home page's domain 0.0%, `owner/repo` for a repository 27.7%
(the repository name alone 19.0%), a file name 10.7%, and `owner/repo#123` for an issue or pull request 89.8%.
People write titles and names, which a URL doesn't contain. So the rule kept only issues and pull requests.

Held-out repositories (138; 5,058 links, run once): offered 1,168 (23.1%), the author's text 32.4% of the time
(39% averaged per repository) — each project has its own habit: ripgrep's changelog writes "BUG #523", Rails'
release notes "Pull Request", others the issue's title. A model wouldn't help: what's missing is the page's
title, and fetching it would break local-first. Pasted URLs stay as they are (GFM shows them as links anyway).
