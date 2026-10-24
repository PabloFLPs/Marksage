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
  assist/                 Smart Assist — see "Smart Assist" below
  hooks/                  useMarkdownFile (doc + history), useTheme, useAppIcon, useKeyStyle, useMediaQuery
  lib/                    storage, history, appIcons (icons + accent), keyStyle, file, sampleDocument
  index.css               theme tokens, accent palettes ([data-accent]), markdown styles, motion keyframes
scripts/eval-assist.ts    fixture evaluation for Smart Assist
training/                 data pipeline for the F1 model (collect → split); clones/train data gitignored
```

## Conventions
- **Colours:** use theme tokens (`accent`, `accent-strong`, `dark-accent`, …), never raw Tailwind hues —
  accents are re-themed per app icon via `:root[data-accent=…]` in `index.css` (+ the pre-paint script in `index.html`).
- **Motion:** use the `anim-*` classes in `index.css`; wrap anything that unmounts in `<Presence>` (or
  `<CollapseX>` in the header). Presence wrappers must carry the positioning classes (`fixed`/`absolute`)
  because the animated wrapper becomes the containing block. Everything must respect `prefers-reduced-motion`.
- **Buttons:** header buttons lift on hover automatically (`header button:hover`); non-button controls use `.press`.
- **i18n:** every user-facing string goes through `useI18n().t(key)`; add keys to `src/lib/locales/en.ts` (source) and `pt-BR.ts`. Long-form copy (About page) uses the `x(en, pt)` helper; the Smart Assist docs exist as `docs/SMART-ASSIST.md` + `.pt-BR.md`.
- **Storage keys:** `marksage:{doc,history,split,theme,assist,app-icon,key-style,lang}` — wrap every access in try/catch. (Renamed from `markdown-preview:*`; `index.html` migrates old keys once on load.)
- **Scroll sync:** preview blocks carry `data-line` (rehype plugin in `lib/scrollSync.ts`); the editor side is measured with a hidden mirror. Keep `rehypeSourceLines` on the preview.
- **Focus:** call `focus({ preventScroll: true })` — plain focus during slide animations shifts the layout.
- **Imports inside `src/assist/`** use explicit `.ts` extensions so `node --experimental-strip-types` can run the eval.

## Smart Assist
Full technical documentation: `docs/SMART-ASSIST.md` — also rendered in-app at `#smart-assist` (About → "How it works"), written for curious readers with basic dev knowledge — no repo-only instructions there (commands, file paths, contributing steps belong here). Keep EN + PT-BR in sync when changing heuristics or Laya.
- Contract: `DecisionEngine` (`choice` / `score` / `noul`) in `assist/types.ts`. The engine decides; our code edits.
- `HeuristicEngine` (always available) routes by question id (`assist/questions.ts`) to `assist/heuristics/*`.
- `LayaEngine` + `laya.worker.ts`: worker client ready; `loadModel()` is a TODO (model/export undecided).
  The "Local model" option stays disabled until it's wired and beats heuristics on the eval.
- Flow: deterministic pre-filter (`prefilter.ts`) → engine → confidence gate (`passesGate`, 0.8 / 0.2 margin) → suggestion.
- Fixtures: `*.json` = authored regression set, `*.dev.json` = real-world set to tune against, `*.real.json` = held-out real-world set (see `assist/__fixtures__/README.md`). Never tune heuristics against `*.real.json` — tune on dev, then run real once.
- Adding a feature: pre-filter candidates → feature in `assist/features/` returning a `Suggestion` with an
  `expected` guard → fixtures in `assist/__fixtures__/` → extend `scripts/eval-assist.ts` → document it on the About page.

## Verify before committing
`npx tsc -b` · `npm run lint` · `npm run eval:assist` · manually check light/dark, desktop/mobile, and reduced motion.
