# training/ — data for Marksage's own models

Two models live here: the **code-language model** (`lang-v2.bin`, below) and the **section model**
(`sections-v2.bin`, for the Outline panel — see the last sections). Both use `fasttext.ts`.

Smart Assist's code-block language detection (F1) is precise but quiet: on real documents the
heuristics speak on about a quarter of blocks. The plan is a small, purpose-trained classifier
(fastText-style, a few hundred KB, plain TypeScript inference, no runtime) that must beat the
heuristics on held-out data before it ships.

```bash
node --experimental-strip-types training/collect.ts     # clone sources, extract labelled blocks (~10 min)
node --experimental-strip-types training/build-sets.ts  # split by repo → train / dev / test
node --experimental-strip-types training/train.ts --dim 8 --buckets 32768 --cv-temp --short-t --target-precision 0.95 --save public/models/lang-v2.bin
npm run eval:assist                                     # heuristics + model on every set

# section model (reads the clones collect.ts made)
node --experimental-strip-types training/build-sections.ts    # sections → data/sections.jsonl (~70 s)
node --experimental-strip-types training/train-sections.ts --save public/models/sections-v2.bin   # add --test once, for the reported numbers
```

| File | Committed | What it is |
|---|---|---|
| `sources.json` | ✓ | Public repos used: docs (fenced blocks) and a few "code" sources (windows of real source files, labelled by extension, to fill rare languages). |
| `manifest.json` | ✓ | Commit of every clone, so the data can be rebuilt exactly. |
| `splits.json` | ✓ | Which repos are dev and test (everything else is train). |
| `labels.ts` | ✓ | Info string → language map, shared by every set (`sh`/`console` → `bash`, `tsx` → `ts`, …). |
| `fasttext.ts` | ✓ | Shared training code: SGD with a decaying rate, class re-weighting, temperature fitting, int8 export (MSLM format). |
| `train.ts` | ✓ | Code-language trainer: temperature calibration, int8 export. Deterministic (same data + seed → identical file). |
| `build-sections.ts`, `train-sections.ts` | ✓ | Section model: dataset from the cloned Markdown, trainer (see the last section). |
| `sources-test2.json`, `manifest-test2.json`, `build-test2.ts` | ✓ | The second, fresh held-out set (`fences.real2.json`): 72 repos used nowhere else, built once and frozen. |
| `data/` | ✗ (gitignored) | Clones, `blocks.jsonl` (~270k blocks), `blocks-test2.jsonl`, `train.jsonl` (~64k) and `sections.jsonl` (~41k sections). Rebuild with the scripts. |

## How the sets are made

- **Labels** are the info strings the original authors wrote (` ```python `), normalised by `labels.ts`.
  They carry a little real-world noise (a `go`-tagged debugger session, `html`-tagged Blade templates) —
  that's what the app will see too. Tags outside the 21 app languages are dropped; blocks are 1–40 lines.
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
- **Tried and dropped:** training on 1–3 line slices of longer blocks (−2 to −5 points accuracy on dev);
  bigger models (12–16 dims, 64k buckets: more coverage, ~3 points less precision).
- Seed 1 (the default) was kept — not the best-looking seed.

| Dev (280) | Accuracy | Shown | Precision |
|---|---|---|---|
| v1 | 78.9% | 148 (53%) | 92.6% |
| **v2** | **81.8%** | **157 (56%)** | **94.9%** |

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

## Section model v1 (sections-v1, 2026-10-24) — replaced by v2

`sections-v1.bin` (385 KB, in git history since v2; dim 8, 32,768 buckets, featurizer 2 = `src/assist/model/sectionFeatures.ts`)
types sections for the Outline panel when the heading rule (`src/assist/sections.ts`) can't. Fetched only while
the Outline is open in Local model mode.

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
