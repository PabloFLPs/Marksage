# training/ — data for Marksage's own F1 model

Smart Assist's code-block language detection (F1) is precise but quiet: on real documents the
heuristics speak on about a quarter of blocks. The plan is a small, purpose-trained classifier
(fastText-style, a few hundred KB, plain TypeScript inference, no runtime) that must beat the
heuristics on held-out data before it ships.

```bash
node --experimental-strip-types training/collect.ts     # clone sources, extract labelled blocks (~10 min)
node --experimental-strip-types training/build-sets.ts  # split by repo → train / dev / test
node --experimental-strip-types training/train.ts --dim 8 --buckets 32768 --cv-temp --short-t --target-precision 0.95 --save public/models/lang-v2.bin
npm run eval:assist                                     # heuristics + model on every set
```

| File | Committed | What it is |
|---|---|---|
| `sources.json` | ✓ | Public repos used: docs (fenced blocks) and a few "code" sources (windows of real source files, labelled by extension, to fill rare languages). |
| `manifest.json` | ✓ | Commit of every clone, so the data can be rebuilt exactly. |
| `splits.json` | ✓ | Which repos are dev and test (everything else is train). |
| `labels.ts` | ✓ | Info string → language map, shared by every set (`sh`/`console` → `bash`, `tsx` → `ts`, …). |
| `train.ts` | ✓ | Trainer: SGD, class re-weighting, temperature calibration on dev, int8 export. Deterministic (same data + seed → identical file). |
| `sources-test2.json`, `manifest-test2.json`, `build-test2.ts` | ✓ | The second, fresh held-out set (`fences.real2.json`): 72 repos used nowhere else, built once and frozen. |
| `data/` | ✗ (gitignored) | Clones, `blocks.jsonl` (~270k blocks), `blocks-test2.jsonl` and `train.jsonl` (~64k). Rebuild with the scripts. |

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

## The model (v1, 2026-10-23) — superseded by v2 below

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
