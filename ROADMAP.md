# Marksage — roadmap

What's planned next, with the context a fresh session needs to start. Shipped work and its numbers live in
`docs/MODELS.md` §8 (versions), `training/README.md` and `SMART-ASSIST — Implementation Context.md` (timeline).

---

## 0. Structure model + "Local models only" mode (next — decided 2026-10-28)

**Why:** Pablo wants the small models to be the reliable, useful core of Local model mode. Today only two
questions use a model (code-block language, Outline section type); structure hints, smart paste and readability
are rules in every mode (`ModelEngine.score` / `noul` and non-fence `choice` fall back to the heuristics). The
lone "-item" fix (Implementation Context §27) showed the limit: a hand-written rule with thin evidence.

**Decisions (Pablo):**

- **Modes:** keep *Off* and *Heuristics*; rename *Local model* to something like *Local model + heuristics*
  (current behaviour); add a new mode, something like *Local models only*, where only our models decide.
  Names in EN + PT-BR to be agreed with him.
- **Docs:** a table per mode of which question uses a model and which uses rules (SMART-ASSIST §1–2, About,
  README), plus a section for the models-only mode.
- **Structure model** (third model, same recipe — fastText-style, MSLM file, featurizer 3 on the line + ±2 lines
  of context): "is this line a list item / heading missing its space (or near-miss) — yes/no".
  - Positives: real list items and headings from the 381 repositories with the space removed (`- item` →
    `-item`, `1. item` → `1.item`, `## Title` → `##Title`), plus `**Title**`-style lines if it fits.
  - Negatives: real look-alikes from the same repositories — CLI flags, negative numbers, CSS declarations,
    hashtags / hex colors, `*emphasis*`, shell output, signatures ("-the team").
  - Check Pablo's hypothesis with corpus counts first: a flag at the start of a prose line is mostly written as
    `code`, so bare `-flag` lines may be rare.
  - **Real held-out set** from unpolished text (GitHub issues, discussions, wikis — not docs, where authors already
    fixed these): ~150–300 hand-checked lines, collected once and frozen. Tune on dev, run held-out once; ships
    only if it matches or beats the rules' precision there. If not, document it honestly (like Explanation).
- **Pattern hunt:** while mining the repositories and the unpolished text, list other near-misses a model could
  catch, and propose them to Pablo before building. His idea: pasting a URL → offer `[text](URL)`.

**Open questions for Pablo at the start:** what *Local models only* does for questions with no model (smart
paste, readability, and the Outline's heading rule — off, or a model for each where learnable); mode names; the
new model file in Privacy & storage (it's a new download → listed, removed by "Delete all Marksage data").

**Rebuild note:** `training/data/repos` isn't committed; `training/collect.ts` re-clones from `manifest.json`
(~10 min) before any of this.

## 1. BYOK — bring your own key (after §0)

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

- **"Too short to judge"** for the code model: one-liners get overconfident answers (`x = 1` → Python 97%).
- **Shrink the model files:** a third of each file is per-slot scales.
- **"Guide" sections** are rarely recognised by the section model.
- **Section model v3:** "performance" is the weakest v2 type (45/60 on the held-out set) and setup got less
  precise (88/109); deployment had 246 training examples. The test set has now been used for v2, so a v3 needs a
  fresh held-out set (like the code model's second one).

## 5. Showcase

- **Timeline / story page** (`#story`, linked from About and the ••• menu) — the project's history for the
  LinkedIn audience, built from the Implementation Context timeline and `docs/MODELS.md` §8.
- **LinkedIn post.**
