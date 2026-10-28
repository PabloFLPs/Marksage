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
    motion.tsx            <Presence> (exit animations) and <CollapseX> (toolbar width collapse)
    AboutPage.tsx         feature docs + Appearance (app icon, key style) — keep in sync with features
    HistoryMenu/HistoryList, SuggestionBar, AssistToggle, AppIconPicker, SplitPanes, Markdown*
  assist/                 Smart Assist — see "Smart Assist" below (model/ = own models: features + inference; sections.ts / outline.ts = Outline)
  hooks/                  useMarkdownFile (doc + history), useTheme, useAppIcon, useKeyStyle, useMediaQuery
  lib/                    storage, history, appIcons (icons + accent), keyStyle, file, sampleDocument
  index.css               theme tokens, accent palettes ([data-accent]), markdown styles, motion keyframes
scripts/eval-assist.ts    fixture evaluation for Smart Assist
training/                 Own models' pipeline (collect → split → train; build-sections → train-sections); clones/train data gitignored
```

## Conventions
- **Colours:** use theme tokens (`accent`, `accent-strong`, `dark-accent`, …), never raw Tailwind hues —
  accents are re-themed per app icon via `:root[data-accent=…]` in `index.css` (+ the pre-paint script in `index.html`).
- **Motion:** use the `anim-*` classes in `index.css`; wrap anything that unmounts in `<Presence>` (or
  `<CollapseX>` in the header). Presence wrappers must carry the positioning classes (`fixed`/`absolute`)
  because the animated wrapper becomes the containing block. Everything must respect `prefers-reduced-motion`.
- **Buttons:** header buttons lift on hover automatically (`header button:hover`); non-button controls use `.press`.
- **i18n:** every user-facing string goes through `useI18n().t(key)`; add keys to `src/lib/locales/en.ts` (source) and `pt-BR.ts`. Long-form copy (About page) uses the `x(en, pt)` helper; the Smart Assist docs exist as `docs/SMART-ASSIST.md` + `.pt-BR.md`.
- **Storage keys:** `marksage:{doc,history,split,theme,assist,app-icon,key-style,lang,model-notice,outline}`, plus the Cache API store `marksage-models-v1` (Local model files: `lang-v2.bin`, and `sections-v2.bin` once the Outline is opened in that mode) — wrap every access in try/catch.
- **Privacy:** everything stored must be needed by a feature the user chose (no cookies, analytics or third-party requests). Any new key or download must be listed in About → Privacy & storage (EN + PT-BR) and be removed by "Delete all Marksage data" (`deleteAllLocalData`). (Renamed from `markdown-preview:*`; `index.html` migrates old keys once on load.)
- **Scroll sync:** preview blocks carry `data-line` (rehype plugin in `lib/scrollSync.ts`); the editor side is measured with a hidden mirror. Keep `rehypeSourceLines` on the preview.
- **Focus:** call `focus({ preventScroll: true })` — plain focus during slide animations shifts the layout.
- **Imports inside `src/assist/`** use explicit `.ts` extensions so `node --experimental-strip-types` can run the eval.

## Smart Assist
Full technical documentation: `docs/SMART-ASSIST.md` — also rendered in-app at `#smart-assist` (About → "How it works"), written for curious readers with basic dev knowledge — no repo-only instructions there (commands, file paths, contributing steps belong here). Keep EN + PT-BR in sync when changing heuristics or the model.
Jev (TypeSafe AI) and Laya (Convai Innovations) are named in the docs factually, as plain words — no logos, no
implied endorsement, the affiliation note stays (SMART-ASSIST §1.1).
`docs/MODELS.md` (+ `.pt-BR`, in-app at `#models`, linked from SMART-ASSIST §4 and About) explains both models from zero with real numbers from the shipped files — retraining a model means re-checking its walkthrough numbers, tables, diagrams and model cards (§7).
`examples/marksage-models.mjs` is the standalone runner documented there; keep it in step with `src/assist/model/`
(the eval fails parity otherwise).
- Contract: `DecisionEngine` (`choice` / `score` / `noul`) in `assist/types.ts`. The engine decides; our code edits.
- `HeuristicEngine` (always available) routes by question id (`assist/questions.ts`) to `assist/heuristics/*`.
- `ModelEngine` ("Local model" mode): Marksage's own code-language model (`assist/model/`, weights in `public/models/lang-v2.bin`)
  answers `fence.language` — plus confident heuristic answers the model agrees with (`assist/model/hybrid.ts`); everything else falls back to `HeuristicEngine`. Lazy fetch + Cache API, main thread
  (~0.1 ms/decision). Retrain with `training/` (see its README); a new model must beat the current one on dev,
  then on a held-out set. (The earlier `LayaEngine` worker scaffold was removed on 2026-10-24 — it's in git history.)
- Flow: deterministic pre-filter (`prefilter.ts`) → engine → confidence gate (`passesGate`, 0.8 / 0.2 margin) → suggestion.
- Outline panel (`components/OutlinePanel.tsx`, `assist/useOutline.ts`, `hooks/useOutlineNav.ts`): sections from `assist/sections.ts`
  (shared with `training/build-sections.ts` — change the splitter or heading rules there and rebuild the section data);
  type = heading rule, else (Local model mode) `sections-v2.bin` reading the text, gate 0.8 (badge) / 0.6 ("probably").
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

## Preview rendering
- Fenced code: `components/CodeBlock.tsx` (Prism via refractor, `lib/highlight.ts`, lazy-loaded by `hooks/useHighlighter.ts` the
  first time a tagged block shows; ~30 KB gzip). Token colors are `.token.*` rules in `index.css` — keywords follow the accent.
  Untagged blocks stay plain on purpose. The wrapper div keeps the block's `data-line`.
- Docs diagrams: `docs/*.svg` (architecture, models-inference, models-training) are generated by `scripts/diagrams.py`; the Markdown shows the SVG and the
  same diagram in Mermaid under `<details>` (GitHub renders both). In the app, `TechDocsPage` turns that group into a
  `DocDiagram` with a Drawn / Mermaid switch (Mermaid lazy-loads, ~650 KB gzip, only on that click).

## Roadmap and timeline
- `ROADMAP.md` — what's next (BYOK, Laya as a general decision model, dogfooding, small items, showcase).
- Docs must match the code: when a model, test set or number changes, update `docs/MODELS.md` §7 (model cards)
  and §8 (versions and test sets), `docs/SMART-ASSIST.md` §4–5 (EN + PT-BR), `training/README.md` and the timeline.
  Dates in the timeline and version tables are git commit dates (America/Sao_Paulo).

## Verify before committing
`npx tsc -b` · `npm run lint` · `npm run eval:assist` · manually check light/dark, desktop/mobile, and reduced motion.
