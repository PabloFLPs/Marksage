# Marksage — roadmap

What's planned next, with the context a fresh session needs to start. Shipped work and its numbers live in
`docs/MODELS.md` §8 (versions), `training/README.md` and `SMART-ASSIST — Implementation Context.md` (timeline).

---

## 0. Done (2026-10-28): structure and paste models tried, Hybrid mode, new near-misses

The plan that was here — a structure model and a "Local models only" mode — ran its course: modes are now Off /
Heuristics / **Hybrid**, three new near-misses ship as rules (`• item`, `1- item`, `[text] (url)`), and the
structure model, a paste-type model and a URL link-text rule were measured on fresh held-out sets and not used.
Numbers and reasons: `SMART-ASSIST — Implementation Context.md` §28, `training/README.md`, `docs/MODELS.md` §8.3–8.5.
Follow-ups are in §4.

## 0.1 Done (2026-10-28): launch QA fixes

A five-persona launch QA pass (impatient, skeptic, mobile on slow 3G, non-native English, "breaker") and Pablo's
own testing found 15 issues; all fixed: docs pages that went blank on a failed download (now Try again), Back
from "How the models work" going to the wrong page, text lost on a fast reload, the empty-clipboard message,
no "start writing" on the start screen, Smart Assist starting off (now **Rules** by default; modes renamed
**Rules** / **Rules + AI**), typing lag on long documents (~400 ms → ~20 ms per key on a 270 KB file), the
privacy section's reach and "who runs it", Markdown extensions (`.mdx` & co. accepted, `.txt` refused), and
smaller polish. Details: `SMART-ASSIST — Implementation Context.md` §29.

Idea left open (Pablo, not decided): readability **icons** instead of dots, as an option — only if it stays
minimal.

## 1. BYOK — bring your own key (next)

**Status:** idea owned by Pablo, not yet shared in detail ("I have a really cool idea for this"). Start the
session by asking him for it; don't design before hearing it.

What is already decided or promised in public text:

- `docs/SMART-ASSIST.md` §1.2, ladder step 4: generative or hosted models are **not used by the built-in
  features**; BYOK is announced as "an optional mode to connect a hosted model with your own key — off by
  default, clearly marked, and documented here when it ships". §4.5: "anything hosted, like the planned BYOK
  mode, will be opt-in and clearly marked". Update both when BYOK ships.
- The decision-model story (§1.1): Jev (TypeSafe AI) is a hosted decision model with a paid API — a natural
  BYOK candidate. Mentions must stay factual (no logos, no implied endorsement; affiliation note).

Constraints from the project rules (AGENTS.md):

- **Privacy:** every stored key or download is listed in About → Privacy & storage (EN + PT-BR) and removed by
  "Delete all Marksage data". A stored API key is a new `marksage:*` entry → list it, explain where it goes.
- **Legal:** today the app sends nothing anywhere (no banner needed, ePrivacy "strictly necessary" + LGPD).
  Sending text to a provider the user picks changes that: explicit opt-in, a notice before the first request
  saying what is sent and to whom, and the About/privacy texts updated. Check again when the design is known.
- **UX:** suggest-only stays (the engine decides, our code edits; an `expected` guard on every edit); the
  decision-model contract (`choice` / `score` / `noul`) fits a hosted decision model directly.
- **Measurement:** anything new is judged on the dev set and run once on a held-out set, like the models.
- **Git:** commit straight to `main` (no PRs); Pablo pushes.

## 2. Ladder step 3 — a general decision model (Laya)

**Why:** some questions have no training data the tiny models can learn from. The proof: the Outline's
*Explanation* type — two training rounds (heading labels, then `concepts/`/`architecture/` folder labels,
1,283 sections) got 0 right on dev (`training/README.md`, "Tried: an explanation type"). Explanatory prose
needs a model that reads meaning, not word clues.

**Candidate:** Laya (Convai Innovations, Apache 2.0) — open weights, answers `choice` / `score` / `noul`,
322M (multilingual) and 421M (English) checkpoints. Runs on the user's device, so it fits local-first.

**Open questions:** how it runs in the browser (runtime, download size, WebGPU vs CPU speed, a fallback), how
the download notice and Privacy & storage describe it, which questions it answers first (Explanation sections
are ready: labelled dev/test data already exists from the experiment), and whether it beats the heading rule
on the dev repositories before it ships.

## 3. Dogfooding round (Pablo will ask after the current iteration)

"Dogfooding" = using your own product as a user would. Here: open Marksage's own docs (the technical pages
already show the Outline/Document panel), read what the panel reports — flags, key sentences, types, tone —
and fix the docs where it's right and the features where it's wrong. Both get better, and it's a good story
("we run our own tool on our own docs"). Already noticed:

- A key sentence comes out as a fragment ("language, tables, links…" under "3. Features and their
  heuristics" in `docs/SMART-ASSIST.md`).
- The sentence splitter doesn't split before a sentence that starts with inline code (`` `q` is a stable id…``),
  so two sentences count as one long one.
- Most headings of the technical docs get no type — expected (topic sections are "other"), but worth a look.

## 4. Smaller items

- **Faster first load on slow networks** (launch QA #35, 2026-10-30): on slow 3G (2 s latency, 50 KB/s) the start
  screen took ~8 s — one 590 KB script (~180 KB gzip) holding React, the Markdown pipeline, the editor and Smart
  Assist, which the start screen doesn't need. Try loading the editor + preview + Smart Assist as their own chunk
  (prefetched once the start screen is up), keep `index.html`'s boot screen meaningful, and check the host serves
  Brotli. Measure first-usable time and the cost for returning visitors (a stored document opens straight into the
  editor) before and after.
- **Preview layout on big documents** (launch QA #15): switching a 3 MB document to the split editor spends ~7 s
  laying out the whole preview again. `content-visibility: auto` on the preview's pieces would skip off-screen ones,
  but scroll sync and the Outline measure those blocks — needs their positions to stay right.

- **Structure model v2:** the rules and v1 miss *different* lines on the held-out set (rules: hashtag lines with an
  emoji, `+20K` stat lines, unfenced diff lines, pasted logs; model: `-Name` signatures, `#123 …` references), so
  a version where both must agree (or the model can veto) is the next try. `lines.real2.json` has been seen: it
  needs a fresh held-out set (same issue-API workflow, other repositories — training/README.md).
- **Rules seen failing on the held-out set** (fix on dev data first, then measure on a fresh set): `#Tag 🚀`
  (the emoji counts as a word), `+20K estudantes`, `+if …` / `-if …` diff lines without a fence.
- **Paste model v2:** train on messier tables (real terminal output, configs with comments) — v1 took `kubectl`
  output, a list of commands and two JSON configs for code.
- **URL paste → `[text](url)`:** authors write titles, which a URL doesn't contain; only possible with the page's
  title, i.e. a network request — at most an opt-in idea for the BYOK era.

- **"Too short to judge"** for the code model: one-liners get overconfident answers (`x = 1` → Python 97%).
- **Shrink the model files:** a third of each file is per-slot scales.
- **"Guide" sections** are rarely recognised by the section model.
- **Section model v3:** "performance" is the weakest v2 type (45/60 on the held-out set) and setup got less
  precise (88/109); deployment had 246 training examples. The test set has now been used for v2, so a v3 needs a
  fresh held-out set (like the code model's second one).

## 4.1 Code-language model v3: pooling that keeps decisive clues (idea, 2026-10-30)

A per-clue attribution of a TS → JS miss (launch QA #17; MODELS §2.7) showed the v2 model's mean pooling
drowning a few decisive clues (`: number`, `) :`) in many shared ones, plus a learned lean toward JavaScript.
It hits languages that are near-supersets of each other most: TS/JS, C++/C, JSONC/JSON, partly C#/Java.
Try mean + max pooling (concatenated), so one strong clue can't be averaged away — tune on dev, report per
pair, then a fresh held-out set. If it wins, the ≥ 99% rules override (`RULES_OVERRIDE`) may no longer be
needed; re-measure before removing it.

## 5. Showcase

- **Timeline / story page** (`#story`, linked from About and the ••• menu) — the project's history for the
  LinkedIn audience, built from the Implementation Context timeline and `docs/MODELS.md` §8.
- **LinkedIn post.**
