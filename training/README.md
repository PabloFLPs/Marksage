# training/ — data for Marksage's own F1 model

Smart Assist's code-block language detection (F1) is precise but quiet: on real documents the
heuristics speak on about a quarter of blocks. The plan is a small, purpose-trained classifier
(fastText-style, a few hundred KB, plain TypeScript inference, no runtime) that must beat the
heuristics on held-out data before it ships. This folder holds the data pipeline; training comes next.

```bash
node --experimental-strip-types training/collect.ts     # clone sources, extract labelled blocks (~10 min)
node --experimental-strip-types training/build-sets.ts  # split by repo → train / dev / test
npm run eval:assist                                     # scores the heuristics on every set
```

| File | Committed | What it is |
|---|---|---|
| `sources.json` | ✓ | Public repos used: docs (fenced blocks) and a few "code" sources (windows of real source files, labelled by extension, to fill rare languages). |
| `manifest.json` | ✓ | Commit of every clone, so the data can be rebuilt exactly. |
| `splits.json` | ✓ | Which repos are dev and test (everything else is train). |
| `labels.ts` | ✓ | Info string → language map, shared by every set (`sh`/`console` → `bash`, `tsx` → `ts`, …). |
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
