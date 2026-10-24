# training/ — data for Marksage's own F1 model

Smart Assist's code-block language detection (F1) is precise but quiet: on real documents the
heuristics speak on about a quarter of blocks. The plan is a small, purpose-trained classifier
(fastText-style, a few hundred KB, plain TypeScript inference, no runtime) that must beat the
heuristics on held-out data before it ships.

```bash
node --experimental-strip-types training/collect.ts     # clone sources, extract labelled blocks (~10 min)
node --experimental-strip-types training/build-sets.ts  # split by repo → train / dev / test
node --experimental-strip-types training/train.ts --dim 8 --buckets 32768 --save public/models/lang-v1.bin
npm run eval:assist                                     # heuristics + model on every set
```

| File | Committed | What it is |
|---|---|---|
| `sources.json` | ✓ | Public repos used: docs (fenced blocks) and a few "code" sources (windows of real source files, labelled by extension, to fill rare languages). |
| `manifest.json` | ✓ | Commit of every clone, so the data can be rebuilt exactly. |
| `splits.json` | ✓ | Which repos are dev and test (everything else is train). |
| `labels.ts` | ✓ | Info string → language map, shared by every set (`sh`/`console` → `bash`, `tsx` → `ts`, …). |
| `train.ts` | ✓ | Trainer: SGD, class re-weighting, temperature calibration on dev, int8 export. Deterministic (same data + seed → identical file). |
| `data/` | ✗ (gitignored) | Clones, `blocks.jsonl` (all ~250k blocks) and `train.jsonl` (~55k). Rebuild with the two scripts. |

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

## The model (v1, 2026-10-23)

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
