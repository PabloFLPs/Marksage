# Marksage — roadmap

What's planned next, with the context a fresh session needs to start. Shipped work and its numbers live in
`docs/MODELS.md` §8 (versions), `training/README.md` and `IMPLEMENTATION-CONTEXT.md` (timeline).

---

## 0. Done (2026-10-28): structure and paste models tried, Hybrid mode, new near-misses

The plan that was here — a structure model and a "Local models only" mode — ran its course: modes are now Off /
Rules / **Rules + AI** (then called Heuristics / Hybrid), three new near-misses ship as rules (`• item`, `1- item`, `[text] (url)`), and the
structure model, a paste-type model and a URL link-text rule were measured on fresh held-out sets and not used.
Numbers and reasons: `IMPLEMENTATION-CONTEXT.md` §28, `training/README.md`, `docs/MODELS.md` §8.3–8.5.
Follow-ups are in §4.

## 0.1 Done (2026-10-28 – 10-30): development check fixes

A five-persona development check (impatient, skeptic, mobile on slow 3G, non-native English, "breaker") and Pablo's
own testing found 15 issues; all fixed: docs pages that went blank on a failed download (now Try again), Back
from "How the models work" going to the wrong page, text lost on a fast reload, the empty-clipboard message,
no "start writing" on the start screen, Smart Assist starting off (now **Rules** by default; modes renamed
**Rules** / **Rules + AI**), typing lag on long documents (~400 ms → ~20 ms per key on a 270 KB file), the
privacy section's reach and "who runs it", Markdown extensions (`.mdx` & co. accepted, `.txt` refused), and
smaller polish. Details: `IMPLEMENTATION-CONTEXT.md` §29.

A second development check, on 2026-10-29, ran the same five personas as AI agents and reported 36 findings
(numbered #1–#36; the code comments' "development check #N"): 35 fixed by 2026-10-30, one commit each, and the
slow first load (#35) improved on 2026-11-04 (§4). Details: §32; the story tells it.

Idea left open (Pablo, not decided): readability **icons** instead of dots, as an option — only if it stays
minimal.

## 0.2 Done (2026-11-09): launch QA fixes

The launch QA: ten AI agents in parallel (first-time visitor, a Brazilian phone, breaker, accessibility, PT-BR and
EN review, accuracy against the code, performance, strategy, ML ideas), every screen in EN and PT-BR, light and
dark, at 1280, 390 and 320 px. 84 findings (D01–D84), none blocking. Fixed before the post, one commit each:
an image address without `//` (`https:host/x`) loading with "Load images from the web" off (D01), link previews and
the start screen implying the AI models run by default (D02), a paragraph rendered as a heading on the Smart Assist
page (D03), two versions of the ship policy (D04), British spellings (D05) and the tour's first instruction (D13,
the copy). Then the report's "if time" list, also before the post: PT-BR glossary leftovers (D33), a suggestion
title cut before its key word on phones (D16), "local AI" in the Assist button's name in Rules mode (D18), counts of
one ("1 chars", D19), About's in-text links told apart by color alone (D20), printing that gave one cut-off page
(D07: now the whole document, light, with its highlighting) and no security headers (D17: a CSP and the rest).
Details: `IMPLEMENTATION-CONTEXT.md` §42. What it left open is at the top of §4.

## 1. BYOK — bring your own key (next)

**Status:** idea owned by Pablo. The gist, as the docs now put it (2026-11-05): an AI agent, with the model and
the key the user chooses, to help with anything inside Marksage — opt-in, off by default. Start the session by
asking him for the details; don't design before hearing them.

What is already decided or promised in public text:

- `docs/SMART-ASSIST.md` §1.2: the ladder has three steps (heuristic rules, a small trained model, a general
  decision model); BYOK is **outside** it, in the paragraph after: "the features built into Marksage never use a
  generative model. The next idea is connecting other AI models (BYOK, bring your own key): an AI agent, with
  the model and the key you choose, to help with anything inside Marksage. It will be opt-in and off by
  default, and your text will go only to the provider you pick." §4.5: "anything hosted, like the planned
  connection to other AI models (BYOK), will be opt-in and clearly marked". The story's "What comes next" says
  the same. Update all three (EN + PT-BR) when BYOK ships — and About's "nothing you write is sent anywhere".
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
322M (multilingual) and 421M (English) checkpoints. It runs locally (on a machine), so it fits local-first —
but it has never been tried in a browser, and the docs say so (SMART-ASSIST §1.2, §4.5: a candidate, not a
decision).

**Open questions:** how it runs in the browser (runtime, download size, WebGPU vs CPU speed, a fallback), how
the download notice and Privacy & storage describe it, which questions it answers first (Explanation sections
are ready: labeled dev/test data already exists from the experiment), and whether it beats the heading rule
on the dev repositories before it ships.

## 3. Dogfooding round — started (2026-11-05)

"Dogfooding" = using your own product as a user would. `npm run check:docs` (CI since 2026-11-05) now runs every
feature on the README and the docs pages (EN + PT-BR) and on the sample; the shipped documents are clean — no
suggestion, no flag — after fixing the documents, never the rules. What it found in the **rules** (not tuned
against these documents; fix on dev data, then measure):

- **The sentence splitter** only splits before a capital letter, a digit, a quote or "(": a sentence that starts
  with a lowercase word, a path or inline code (`` `q` is a stable id…``, `docs/MODELS.md explains…`) stays
  glued to the one before, so two short sentences count as one long one. Fixed in the docs by rewording.
- **Tone across languages:** English contractions count as casual evidence and Portuguese has none, so long
  Portuguese prose reads "formal" where the same English reads "neutral" (the PT docs pages: formal · impersonal;
  EN: neutral). A Portuguese counterpart (or not counting contractions at all) needs measuring on both languages.
- **Voice in Portuguese** drops the subject ("Abra o arquivo", "Você" omitted), so "você" alone undercounts who
  the text talks to; imperative verbs could count. (The accent bug behind "always impersonal" was fixed on
  2026-11-05.)
- A key sentence comes out as a fragment ("language, tables, links…" under "3. Features and their
  heuristics" in `docs/SMART-ASSIST.md`).
- **Most headings of the technical docs get no type** — topic sections are "other" to the section model too
  (its top answer on SMART-ASSIST is "other", 17–33%). Accepted for now (Pablo, 2026-11-05); see §7.1.

## 4. Smaller items

Open from the launch QA (2026-11-09, majors; the report's minors and nits are in Pablo's notes):

- **Smart paste on logs (D06):** a stack trace or `git status` is offered "Convert to Markdown list", and docker
  compose logs a table. A code-or-log check before the list and table offers.
- **Typing past ~250 KB (D08):** slows down; the line-number layer is about 75% of the cost.
- **Over 400,000 characters (D09):** the document vanishes without a word on New, Open, Close or paste.
- **"Delete all" and a second tab (D10):** another open Marksage tab writes the data back.
- **Storage blocked (D11):** nothing is saved, and the warning is cleared in the same tick.
- **A big JSON paste (D12):** ~600 KB without headings freezes the tab for over a minute.
- **The suggestion bar after `Esc` (D13, the rest):** show the next suggestion; prefer the nearest candidate
  across kinds (needs an eval run).
- **Opening your own file (D14):** no sign that Smart Assist found anything until the caret reaches it.
- **The phone keyboard (D15):** 3–5 editor lines remain, and the suggestion bar sits on the line being typed.

Follow-ups from the pre-launch review (2026-10-31 – 11-03, Implementation Context §39–40), kept for later by Pablo
(done since: the browser bar color, CI, the story's who-decided line, root file names, the chunk-size note):

- **The section model and Portuguese:** it reads PT text poorly — the sample's privacy section is typed Security
  (0.75) in English, "other" (0.30) in Portuguese. More PT sections in its training data, or say it in MODELS §7.
- **Tab to indent lists:** with no suggestion showing, Tab / Shift-Tab could indent / outdent list lines (today Tab
  leaves the editor, as a textarea does). It changes "Assist Off = original behavior" (AGENTS), so it needs
  that rule revisited first.
- **Raw HTML in the preview:** `<details>`, `<kbd>`, `<img>` and the like show as escaped text, on purpose (no
  script can run). Either one line in About saying so, or render a safe subset (`rehype-raw` + `rehype-sanitize`).

- **First load, what's left** (done 2026-11-04: the document view is its own chunk — start screen 150 → 83 KB
  Brotli, 7.4 → 6.4 s on slow 3G; year-long caching of `/assets/` in `vercel.json`): a returning visitor whose
  cache is empty (just after a deploy) waits ~0.5 s more than before (7.9 s), for the 8 KB the split costs. Smaller
  still: one language per About chunk (its copy is inline EN + PT); react-dom is half of what's left.
- **Tested in real browsers, not only engines** (grade item 3): the E2E suite runs in Chromium everywhere; WebKit
  (desktop + iPhone 14) and Firefox in CI's `e2e-cross-browser` job (green and blocking since 2026-11-05).
  Engines in Playwright aren't Safari on an iPhone: before the LinkedIn post, one
  pass by hand on a real iPhone (Safari) and in desktop Firefox — the sample tour, Tab / Esc, paste, Export, the
  phone menu, light / dark.
- **Model results are modest, and say so** (grade item 5): the code-language model about doubles the right
  suggestions at the rules' precision; the section model adds little in Portuguese and on "performance" / "guide"
  sections (the items above and below). The docs already give the numbers; the next real step up is a general
  decision model (§2) or BYOK (§1), not tuning these two against sets they've seen.
- **Preview layout on big documents** (development check #15): switching a 3 MB document to the split editor spends ~7 s
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
- **"Guide" sections** are rarely recognized by the section model.
- **Section model v3:** "performance" is the weakest v2 type (45/60 on the held-out set) and setup got less
  precise (88/109); deployment had 246 training examples. The test set has now been used for v2, so a v3 needs a
  fresh held-out set (like the code model's second one).

## 4.1 Done (2026-10-30): code-language model v3, mean + max pooling — tried, not used

A per-clue attribution of a TS → JS miss (development check #17; MODELS §2.7) showed v2's mean pooling drowning a few
decisive clues. Mean + max pooling was tuned on dev + repo-fold CV and judged once on a third, fresh held-out set
(842 blocks, 158 repos) against a bar fixed beforehand. **It failed on the pairs** (six pair languages: 103 right ·
88.0% vs v2's 106 · 89.8% in the app's hybrid; TS/JS worse) while being better overall (391 right · 93.8% vs
380 · 93.1%) — training/README.md, MODELS §8.1. `RULES_OVERRIDE` re-measured: +3 right, 0 wrong on the new set, so
it stays. Learned on the way: only 42% of `ts`-tagged training code has TypeScript-only syntax, and today's data
can't rebuild v2 exactly (77% vs 81.8% dev accuracy).

Follow-ups, not started:
- **TS/JS labels:** treat `ts` blocks without TypeScript-only syntax as "either" (or don't score them for that pair)
  — the gap is in the labels, not the model.
- **Mean + max for overall coverage** (+11 right, −2 wrong in the hybrid on the third set; much more on CV) is a
  different claim from the one tested; it would need its own bar and a new fresh held-out set.
- **Reproducibility — done (2026-10-30):** the shipped file is the fixed baseline, every code model shipped from now
  on gets a training-data lock (`training/fingerprint.ts`; `train-sections.ts` doesn't write one yet), and rebuilds are checked against it. The cause of v2's gap (+463
  Rust, +51 plain text, +20 diff blocks today) wasn't found in the hour set for it — training/README.md,
  "Reproducibility".

## 5. Showcase

- **Done (2026-10-30): timeline / story page** (`#story`, linked from the start screen, About and ⌘K) — the
  project's history for the LinkedIn audience, built from the Implementation Context timeline and
  `docs/MODELS.md` §8; ends with the source and the author (2026-11-01).
- **LinkedIn post.**

## 6. What the grades still miss (review, 2026-11-04)

After this round, the evaluation stands at **tests 8.5 / 10** (from 8: the hooks, components and the whole app are
now unit-tested, 56.7% of `src/` lines, and the axe scan covers every palette) and **overall 8.5 / 10**. What keeps
each from going higher, most weight first, and what would move it:

**Tests (8.5)**
1. **No real device has run it.** Chromium is tested everywhere; WebKit, iPhone and Firefox only as Playwright
   engines in CI (that job green and blocking since 2026-11-05, §4). Missing: a hand pass on a real iPhone
   (Safari), an Android phone and desktop Firefox / Safari.
2. **Rules + AI is never run in a browser by a test.** `eval:assist` checks both models' answers in Node (parity
   with the standalone runner included); no test downloads them in a page, caches them, uses them while typing, or
   recovers from a failed download (*Try again*). One E2E test with the model files served locally would cover it.
3. **Half the branches are untested** (45% branch coverage; the UI and the glue code, not the rules) — details
   and the plan in §6.1.
4. **No visual regression check** — a broken layout, color or spacing passes every test today; details and the
   plan in §6.2.
5. **The evaluation sets are used up.** The held-out sets that measured the shipped models have been seen; any
   model change (section v3, structure v2) needs fresh ones first (§4).
6. **Automated accessibility is only part of it.** axe finds roughly a third of real problems; no screen-reader
   pass by hand (VoiceOver on macOS / iOS, NVDA) yet.

**Overall (8.5)**
1. **The first load** — done the same day (§4): the start screen downloads 83 KB Brotli instead of 150 (6.4 s on
   slow 3G instead of 7.4; 2.1 s for a returning visitor, from the cache). What's left is small (§4).
2. **The models' gains are modest** (§4): about twice the right code-language suggestions at the rules' precision;
   the section model adds little in Portuguese and on "performance" / "guide" sections; three trained models
   weren't shipped. Honest and documented, but not yet a reason on its own to pick Marksage.
3. **Editor basics a Markdown user expects**: no syntax coloring in the editor (a plain textarea with line
   numbers), Tab doesn't indent lists, raw HTML (`<details>`, `<kbd>`) shows as text, and Export downloads a copy —
   there's no saving back into the opened file (File System Access, Chromium only).
4. **Large documents**: switching a 3 MB document to the split view spends ~7 s laying out the preview (§4).
5. **Real-user feedback hasn't started** (§3, dogfooding): with no analytics by design, the feedback loop is
   people telling you — the LinkedIn post is the first real round.

What would move them: items 1–2 of the tests list bring tests to about 9; with the first load done, one
editor-basics item (syntax coloring or saving in place) brings the overall to about 9. Real users' feedback is
what decides the rest.

### 6.1 Branch coverage (measured 2026-11-04, kept for a future iteration)

Line coverage asks "did this line run?"; branch coverage asks "did each side of every `if`, `? :`, `&&`, `??`
run?". A line counts as covered when one outcome ran, which is why branches (45.3%, 1,488 / 3,283) trail lines
(57.1%). Measured with `npm run test:coverage` (unit tests only); by area: App 62.5%, lib 60.6%, hooks 54.3%,
components 47.0%, assist 34.1%.

The assist figure understates it: `eval:assist` (measured with c8 under `NODE_V8_COVERAGE`) runs the rules and the
models' feature code on thousands of fixtures — paste rules 96%, structure rules 95%, language rules 100%,
prefilter 97%, section features 96%, JSON detection 97%, model inference 82%. **The real gaps are the UI and the
glue**, which neither layer reaches:

| Where | Branches | What isn't tested |
|---|---|---|
| `assist/useSmartAssist.ts` | 20% (23 / 113) | when a suggestion shows or hides, the sticky paste suggestion and pinning, the stale-suggestion guard on accept, `Alt+2` for the second choice, engine status and retry — the E2E only covers Tab on the happy path |
| `assist/features/smartPaste.ts` | 0% (0 / 41) | the paste event glue — the eval tests the detection, not the handler |
| `components/AssistToggle.tsx` | 40% (44 / 109) | the Rules + AI notice, download progress, failure and retry states |
| `hooks/useOutlineNav.ts`, `hooks/useScrollSync.ts`, `lib/scrollSync.ts`, `components/SplitPanes.tsx` | 21–39% | positions and scrolling — they need real layout, which happy-dom doesn't compute |
| `components/DocumentTab.tsx`, `components/SuggestionsTab.tsx`, `components/MoreMenu.tsx` | 0% | the panel tabs' contents, the phone menu |
| `components/ExportMenu.tsx`, `components/HistoryMenu.tsx`, `hooks/useReturnFocus.ts` | 12–46% | menu edge cases, where focus goes after them |
| `components/TechDocsPage.tsx`, `components/StoryPage.tsx`, `components/CodeBlock.tsx`, `hooks/useTheme.ts` | 0–29% | the docs pages, the copy button, the theme switch |

Plan (for the risk, not the number):
1. **Unit tests in happy-dom for the risky logic**: `useSmartAssist` through `renderHook` with a real textarea (key
   handling, the stale guard, what shows when), the paste glue, the Assist menu's states, the Document and
   Suggestions tabs, the phone menu, Export's edge cases, the theme. Estimate: ~40–50 tests, branch coverage to
   roughly 55–60%.
2. **Assertions in Playwright for what needs layout**: scroll sync (the editor and the preview on the same passage),
   Outline navigation (a click lands on the section, the active row follows scrolling).
3. Then raise the `test:coverage` floor (vitest.config.ts) to what it reaches, and add a branch floor next to the
   line one.

### 6.2 Visual regression (kept for a future iteration)

**What it is.** Screenshots of key screens compared pixel by pixel against reference images kept in the repo; any
visible change fails, with a diff image in the CI artifacts. Today axe, the overflow checks and the E2E flows all
pass on a broken layout, a wrong color or a spacing slip — nothing looks at the picture. It catches **changes**
from the reference, not bugs already in it (the start-screen logo's box, fixed 2026-11-04, would have been
recorded as correct; the next one like it would be caught).

**How.** Playwright's built-in `expect(page).toHaveScreenshot()` — no new dependency. About 14 screens: the start
screen; the sample in the editor with the Outline open; the preview; About; one docs page; the command palette;
the phone start screen and editor — light and dark — plus one screen per accent palette (Classic, Mono, Line,
Sunset).

**The catches:**
- **Fonts.** Marksage uses the system font stack (`--font-sans`: `-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Helvetica…`): San Francisco on macOS, other fonts on Linux. References made on a Mac fail on GitHub's runners, so
  they're made and compared in one environment — Playwright's Docker image at the pinned version
  (`mcr.microsoft.com/playwright:v1.63.0-noble`), in CI and locally.
- **What moves.** Recent's relative times, the caret, animations, the version and commit in About: frozen, hidden
  or masked (`animations: 'disabled'`, `caret: 'hide'`, `mask: [...]`, a fixed clock). Lazily loaded content waited
  for. A small tolerance (`maxDiffPixelRatio` ≈ 0.01) for anti-aliasing.
- **Upkeep.** An intentional UI change → `npx playwright test --update-snapshots` in the Docker image, and the
  image diffs reviewed in that commit. ~1–3 MB of PNGs in the repo; ~30 s more in CI (its own job).

**Alternative.** A hosted service (Argos, free for open source; Percy; Chromatic) adds a review page, but needs an
account and a token, and its main benefit — reviewing in a pull request — matters less when commits go straight to
`main`.

**Recommendation.** The built-in one in Docker. The first references: generated with Docker in the cloud
workspace if the image registry is reachable from it, else by the first CI run (a `workflow_dispatch` job that
uploads them as an artifact to commit).

## 7. Next model ideas (2026-11-05, roadmap only — no code yet)

### 7.1 More section categories

**Today.** 16 types (`assist/sections.ts`). The type comes from the heading rule first (EN + PT phrases, a phrase
must cover half the heading, ambiguous words only as the whole heading); when the heading says nothing, the
section model (`sections-v2.bin`, Rules + AI) reads the text and answers one of 13 types or "other" (gate 0.8 for
a badge, 0.6 for "probably"). Explanation, glossary and roadmap are heading-only (`HEADING_ONLY_TYPES`): the model
couldn't learn explanation (0 right on dev, twice) and the other two had 76 and 57 headings in 381 repositories.

**What a new type takes**, in order:
1. **Is it a type at all?** Count it in the training repositories with the strict heading rule
   (`training/build-sections.ts`). Deployment had 246 examples and is barely learned (2 of 2 shown on the test
   set — too few to judge); below ~300 strict headings a type should stay heading-only.
2. **Heading-rule coverage first.** EN + PT phrases in `PHRASES`, checked against `__fixtures__/headings.json`
   (new cases for the type and for near neighbors it must not steal: "Testing" vs Contributing, "FAQ" vs
   Troubleshooting, "Requirements" vs Setup). A type the rule types well may never need the model.
3. **Labeled data** for the model: rebuild the sections with the new labels (`build-sections`), keep "other"
   honest (sections whose heading names no type), and check the split by repository still holds.
4. **A fresh held-out set.** The v2 test repositories have been seen; a v3 needs new ones (the code model's
   third set is the pattern: built before any training, frozen, run once).
5. **A bar written down before training**: e.g. the new type's precision when shown ≥ 85% at the 0.8 gate on
   the fresh set, no existing type more than 2 points worse, overall agreement not lower than v2's 88.9%.
6. **Size and latency**: a new answer adds 9 numbers (8 weights + a bias) to a 262,270-number model — the file
   stays ~385 KB and ~0.1 ms per section. Only a bigger clue reader would move either.
7. **UI and docs**: an icon (`sectionIcons.ts`), EN + PT labels, the About count ("and 13 more"), SMART-ASSIST
   §3 / §4.4, MODELS §7 / §8, the Document tab's kind rules if the type should count there, a new file version.

**Candidates to measure, not promised:** Testing (today part of Contributing), FAQ (inside Troubleshooting),
Requirements / Prerequisites (inside Setup), Architecture as a model type (the explanation lesson says: only with
labels that aren't just topic prose).

### 7.2 A summary for each section

Today the Outline shows a **key sentence**: picked, never written (`keySentence`, the sentence that shares the
most words with its section). Three ways to go further:

| | Better extractive (another small Marksage model) | Tiny abstractive model in the browser | BYOK (ROADMAP §1) |
|---|---|---|---|
| What it does | picks the sentence (or two) that best stands for the section — a `choice` over its own sentences | writes a new one-line summary | the user's chosen model writes it |
| EN + PT | yes, if trained on both (the section corpus has PT READMEs) | needs a multilingual model (PT-only or EN-only models exist; multilingual ones are far bigger) | yes |
| Size / latency | ~385 KB, ~0.1 ms per sentence — the same design as today's models | tens to hundreds of MB to download (t5-small class, ~60 M parameters, ~60 MB in 8 bits; a multilingual one several times that); seconds per section on CPU, faster with WebGPU where it exists | nothing to download; a network round trip per request |
| Can it be wrong? | it can pick a weak sentence, never invent one | it can invent (a generative model) | it can invent |
| Local-first | yes | yes, but a large download | no: the section's text goes to the provider the user picked, opt-in |
| Fits the rules | yes (a decision model answers from a list) | no: "the built-in features never use a generative model" — only as opt-in | yes, as the opt-in BYOK agent |

Browsers' own built-in summarizers aren't an option today: Chrome's Summarizer API needs desktop Chrome with
a large on-device model download and strong hardware, isn't in Firefox or Safari, and didn't list Portuguese when
checked (2026-11-05).

**How to evaluate any of them:** reference summaries written by hand for ~200 sections (EN + PT, from the
held-out repositories); extractive: the chosen sentence matches the reference's sentence, or overlaps it (ROUGE-L);
abstractive / BYOK: human review on a fixed sheet (faithful? useful? the right length?) plus a faithfulness check —
every claim in the summary must be in the section (a `noul` question a decision model can answer). A bar written
down before the run, as for every model.

**Recommendation:** extractive v2 first — it's the next small Marksage model, measurable, EN + PT, local; then
abstractive summaries only through BYOK, opt-in, where a generative model belongs.
