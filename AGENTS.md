# AGENTS.md — Marksage

Guidance for AI coding agents (and humans) working on this repo.

## Product rules (non-negotiable)
- **Local-first.** No backend, no network calls with user content, no analytics. Persist only to `localStorage`.
- **Minimal UI, fluid motion.** New UI must animate in *and* out, fast (enter 160–260 ms, exit 120–220 ms).
- **Suggest, never auto-apply.** Smart Assist only proposes edits; the user accepts (Tab) or dismisses (Esc).
- **Assist Off = original behaviour.** With Smart Assist off, the editor must behave exactly as without it.

## Map
```
src/
  App.tsx                 screen state (about / empty / edit / preview), shortcuts, drag & drop, paste
  components/
    Header.tsx            toolbar; conditional items wrapped in <CollapseX>
    DocName.tsx           the document name in the header — click to rename (lib/file.ts `normalizeFilename`);
                          `RenameSheet` = the phone version, from MoreMenu's "Rename…" (the header has no room for the name)
    ExportMenu.tsx        Export button + "Export as" panel; ⌘/Ctrl S opens it (state in App), again downloads
    MarkdownEditor.tsx    textarea + line numbers (a hidden mirror wraps like the textarea; numbers in the gutter; pieces of
                          200 lines memoized) — keep the mirror's text classes = the textarea's. The mirror scrolls by a
                          scroll-driven animation (`.editor-lines`, `--scroll-max`; compositor, same frame as the text) —
                          a scroll listener only where unsupported (it trails a frame). Textarea: `overscroll-none`.
    EmptyState.tsx        start screen: Open / Paste / Start writing, Smart Assist line, Privacy link (#privacy)
    PageLoad.tsx          <PageLoading> + <PageLoadBoundary> (Try again / Back) for lazily loaded pages
    motion.tsx            <Presence> (exit animations) and <CollapseX> (toolbar width collapse)
    AboutPage.tsx         feature docs + Appearance (app icon, key style) — keep in sync with features
    StoryPage.tsx         #story: the architecture decisions and models as a timeline (showcase, not docs); content in
                          lib/storyContent.<lang>.ts, lazily loaded — neutral voice, date order, numbers = MODELS / training
    HistoryMenu/HistoryList, SuggestionBar, AssistToggle, AppIconPicker, SplitPanes, Markdown*
  assist/                 Smart Assist — see "Smart Assist" below (model/ = own models: features + inference; sections.ts / outline.ts = Outline)
  hooks/                  useMarkdownFile (doc + history), useTheme, useAppIcon, useKeyStyle, useMediaQuery
  lib/                    storage, history, appIcons (icons + accent), keyStyle, file, sampleDocument,
                          chunks (long-document preview pieces), docsContent(.en/.pt-BR) (docs pages per language)
  index.css               theme tokens, accent palettes ([data-accent]), markdown styles, motion keyframes
scripts/eval-assist.ts    fixture evaluation for Smart Assist
training/                 Own models' pipeline (collect → split → train; build-sections → train-sections; tried, not shipped: structure, pastes, link text); clones/train data gitignored
```

## Conventions
- **Colours:** use theme tokens (`accent`, `accent-strong`, `dark-accent`, …), never raw Tailwind hues —
  accents are re-themed per app icon via `:root[data-accent=…]` in `index.css` (+ the pre-paint script in `index.html`).
- **Motion:** use the `anim-*` classes in `index.css`; wrap anything that unmounts in `<Presence>` (or
  `<CollapseX>` in the header). Presence wrappers must carry the positioning classes (`fixed`/`absolute`)
  because the animated wrapper becomes the containing block. Everything must respect `prefers-reduced-motion`.
- **Buttons:** header buttons lift on hover automatically (`header button:hover`); non-button controls use `.press`.
  Touch screens get ≥ 40 px targets (`@media (pointer: coarse)` in `index.css`): header buttons, tabs, `.code-copy`,
  the diagram switch and anything with `.tap` — add `.tap` to small tappable controls.
- **i18n:** every user-facing string goes through `useI18n().t(key)`; add keys to `src/lib/locales/en.ts` (source) and `pt-BR.ts`. Long-form copy (About page) uses the `x(en, pt)` helper; the Smart Assist docs exist as `docs/SMART-ASSIST.md` + `.pt-BR.md`.
- **Storage keys:** `marksage:{doc,history,split,theme,assist,app-icon,key-style,lang,model-notice,outline,remote-images}`, plus the Cache API store `marksage-models-v1` (Rules + AI mode's model files: `lang-v2.bin`, and `sections-v2.bin` once the Outline is opened in that mode) — wrap every access in try/catch.
- **Privacy:** everything stored must be needed by a feature the user chose (no cookies, analytics or third-party requests).
  Images from other websites load only with "Load images from the web" on (`lib/remoteImages.ts`, About → Privacy;
  off shows a placeholder + a bar linking there) and never send a referrer. Any new key or download must be listed in About → Privacy & storage (EN + PT-BR) and be removed by "Delete all Marksage data" (`deleteAllLocalData`). (Renamed from `markdown-preview:*`; `index.html` migrates old keys once on load.)
- **Scroll sync:** preview blocks carry `data-line` (rehype plugin in `lib/scrollSync.ts`); the editor side is measured with a hidden mirror. Keep `rehypeSourceLines` on the preview.
- **Focus:** call `focus({ preventScroll: true })` — plain focus during slide animations shifts the layout.
- **Files:** `lib/file.ts` `ACCEPTED_EXTENSIONS` — Markdown only (`.md .markdown .mdx .mdown .mkd .mkdn .mdwn`);
  `.txt` is refused on purpose; `looksBinary` refuses renamed binaries. Keep `error.notMarkdown` listing the same set.
- **Saving:** `useMarkdownFile` debounces saves (300 ms) and also flushes on `pagehide` / `visibilitychange`; New
  saves the empty document at once. Don't remove either — a reload right after typing used to lose text.
  "Delete all Marksage data" sets `wiped` (`lib/storage.ts`, `isWiped()`) so that flush and any pending save write
  nothing until the reload — any new writer of user content must check it too.
  Tabs: a tab writes the document only when it differs from what it last wrote or read (`persisted`), follows
  another tab's save (`storage` event) when it has no changes of its own, and asks (conflict bar) when both do.
- **Imports inside `src/assist/`** use explicit `.ts` extensions so `node --experimental-strip-types` can run the eval.

## Smart Assist
Full technical documentation: `docs/SMART-ASSIST.md` — also rendered in-app at `#smart-assist` (About → "How it works"), written for curious readers with basic dev knowledge — no repo-only instructions there (commands, file paths, contributing steps belong here). Keep EN + PT-BR in sync when changing heuristics or the model.
Jev (TypeSafe AI) and Laya (Convai Innovations) are named in the docs factually, as plain words — no logos, no
implied endorsement, the affiliation note stays (SMART-ASSIST §1.1).
`docs/MODELS.md` (+ `.pt-BR`, in-app at `#models`, linked from SMART-ASSIST §4 and About) explains both models from zero with real numbers from the shipped files — retraining a model means re-checking its walkthrough numbers, tables, diagrams and model cards (§7).
`examples/marksage-models.mjs` is the standalone runner documented there; keep it in step with `src/assist/model/`
(the eval fails parity otherwise).
- Contract: `DecisionEngine` (`choice` / `score` / `noul`) in `assist/types.ts`. The engine decides; our code edits.
- Modes: Off / Rules / Rules + AI (PT: Desligado / Regras / Regras + IA; stored as `off` / `heuristics` / `model` —
  renamed on 2026-10-28 from Heuristics / Hybrid, stored values unchanged). A first visit (nothing stored) starts in
  Rules (`loadAssistMode`); a stored `off` stays off. "AI" = Marksage's own small models, nothing hosted.
  Which question uses a model in each mode is a table in three places — SMART-ASSIST §1.3 (EN + PT), the About
  page (`ModeTable`) and the README — keep them in sync. A model is used in Rules + AI only where it matches or beats
  the rules on a fresh held-out set (precision *and* right answers); structure and paste models were tried on
  2026-10-28 and didn't (training/README.md).
- `HeuristicEngine` (always available) routes by question id (`assist/questions.ts`) to `assist/heuristics/*`.
- `ModelEngine` (Rules + AI mode; stored value `model`): Marksage's own code-language model (`assist/model/`, weights in `public/models/lang-v2.bin`)
  answers `fence.language` — plus confident heuristic answers the model agrees with (`assist/model/hybrid.ts`); everything else falls back to `HeuristicEngine`. Lazy fetch + Cache API, main thread
  (~0.1 ms/decision). Retrain with `training/` (see its README); a new model must beat the current one on dev,
  then on a held-out set. (The earlier `LayaEngine` worker scaffold was removed on 2026-10-24 — it's in git history.)
- Flow: deterministic pre-filter (`prefilter.ts`) → engine → confidence gate (`passesGate`, 0.8 / 0.2 margin) → suggestion.
- Outline panel (`components/OutlinePanel.tsx`, `assist/useOutline.ts`, `hooks/useOutlineNav.ts`): sections from `assist/sections.ts`
  (shared with `training/build-sections.ts` — change the splitter or heading rules there and rebuild the section data);
  type = heading rule, else (Rules + AI mode) `sections-v2.bin` reading the text, gate 0.8 (badge) / 0.6 ("probably").
  Visual only — it never edits. Heading lines are 0-based; the preview's `data-line` is 1-based.
  `explanation`, `glossary`, `roadmap` are heading-only (`HEADING_ONLY_TYPES`; `SECTION_TYPES` vs `MODEL_SECTION_TYPES`,
  see training/README.md). A new type needs: phrases in `sections.ts`, an icon (`sectionIcons.ts`), EN + PT labels,
  fixtures, the About count, and docs §3/§4.4 + MODELS §7/§8; a model type also a rebuild + retrain + new file version. The docs pages
  show the same panel over their own Markdown (read-only by design: no "open in editor").
  Its Document tab (`components/DocumentTab.tsx`) renders `assist/docStats.ts` (facts, kind, readability, tone signals, flags);
  the active tab is session state only (no storage key). Regression sets: `__fixtures__/headings.json`, `docstats.json`.
- Fixtures: `*.json` = authored regression set, `*.dev.json` = real-world set to tune against, `*.real.json` = held-out real-world set (see `assist/__fixtures__/README.md`). Never tune heuristics against `*.real.json` — tune on dev, then run real once.
- Adding a feature: pre-filter candidates → feature in `assist/features/` returning a `Suggestion` with an
  `expected` guard → fixtures in `assist/__fixtures__/` → extend `scripts/eval-assist.ts` → document it on the About page.

## Navigation (info pages)
- Hashes: `#about`, `#privacy` (About scrolled to Privacy & storage), `#smart-assist`, `#models`, `#story`. Open them by setting
  `location.hash` — never `pushState` directly. Each history entry gets `{ ms: 1, from }` (`App.tsx`, `navState`):
  the screen it was opened from. The in-app Back (`closeAbout`) calls `history.back()` when `from` is set, so it
  always matches the browser's Back; a direct link (`from: null`) goes to the parent (docs → About → app) with
  `replaceState`. The Back label names the target (`backLabel`).
- The docs pages load lazily per language: `loadDocsPage(lang)` = `TechDocsPage` chunk + `lib/docsContent.<lang>.ts`
  (Markdown + SVGs). Prefetched while About is open (skipped on Save-Data). A failed chunk shows
  `PageLoadBoundary` (Back / Try again → reload: browsers cache a failed module import, so re-importing fails).
- On About and the docs pages the header hides the open document's controls (name, Assist, Edit/Preview, Copy,
  Export; ⌘S and ⌘⇧C do nothing) — they'd act on a document that isn't on screen. The docs pages show a disabled
  "Read-only" in place of Edit (desktop; phones say it in the page bar) and a **Copy Markdown** button that copies
  the page source as in the repo. Docs stay read-only: no "open in editor" (Pablo's call).

## Preview rendering
- Performance contract: `MarkdownPreview` is `memo`ized and gets `useDeferredValue` text from `App.tsx` — keep its
  props referentially stable (no new `[]`/objects per render; `useSmartAssist` returns shared empty arrays for this).
  Documents ≥ 20,000 chars render in pieces split at column-0 ATX headings (`lib/chunks.ts`; not inside fences or
  `<pre>/<script>/<style>/<textarea>` blocks; reference definitions copied to every piece; documents with footnotes
  aren't split). Pieces tag `data-chunk` + `data-rel-line`; a layout effect writes the document's `data-line`. Output
  was checked identical to one parse (modulo whitespace between blocks) on the repo's docs. `CodeBlock` is memoized
  with a highlight cache; `buildOutline` caches per heading / section text. Measure typing with the 400-section file
  approach from the 2026-10-28 QA (see the Implementation Context, §29) before and after preview changes.- Fenced code: `components/CodeBlock.tsx` (Prism via refractor, `lib/highlight.ts`, lazy-loaded by `hooks/useHighlighter.ts` the
  first time a tagged block shows; ~30 KB gzip). Token colors are `.token.*` rules in `index.css` — keywords follow the accent.
  Untagged blocks stay plain on purpose. The wrapper div keeps the block's `data-line`.
- Docs diagrams: `docs/*.svg` (architecture, models-inference, models-training) are generated by `scripts/diagrams.py`; the Markdown shows the SVG and the
  same diagram in Mermaid under `<details>` (GitHub renders both). In the app, `TechDocsPage` turns that group into a
  `DocDiagram` with a Drawn / Mermaid switch (Mermaid lazy-loads, ~650 KB gzip, only on that click). A Mermaid
  failure shows a message + Try again and logs `[diagram] Mermaid failed:` to the console — never a silent switch back.
  A failed *download* offers "Reload the page to try again" instead (a re-import of a failed module fails again).

## Roadmap and timeline
- `ROADMAP.md` — what's next (BYOK, Laya as a general decision model, dogfooding, small items, showcase).
- Docs must match the code: when a model, test set or number changes, update `docs/MODELS.md` §7 (model cards)
  and §8 (versions and test sets), `docs/SMART-ASSIST.md` §4–5 (EN + PT-BR), `training/README.md` and the timeline.
  Dates in the timeline and version tables are git commit dates (America/Sao_Paulo).

## Verify before committing
`npx tsc -b` · `npm run lint` · `npm run eval:assist` · manually check light/dark, desktop/mobile, and reduced motion.
