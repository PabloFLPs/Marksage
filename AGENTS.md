# AGENTS.md — Marksage

Guidance for AI coding agents (and humans) working on this repo.

## Product rules (non-negotiable)
- **Local-first.** No backend, no network calls with user content, no analytics. Persist only to `localStorage`.
- **Minimal UI, fluid motion.** New UI must animate in *and* out, fast (enter 160–260 ms, exit 120–220 ms).
- **Suggest, never auto-apply.** Smart Assist only proposes edits; the user accepts (Tab) or dismisses (Esc).
- **Assist Off = original behavior.** With Smart Assist off, the editor must behave exactly as without it.

## Map
```
src/
  App.tsx                 composes the screen (about / empty / edit / preview) from the hooks below and holds the
                          document actions (open, new, paste, export, copy, close, the sample); the layout is its JSX
  components/
    DocumentView.tsx      everything while a document is open (preview, editor, Smart Assist, Outline, doc bar) — its
                          own chunk, kept out of the start screen's script (`lib/documentView.ts`: prefetched after the
                          first paint; with a stored document index.html preloads it and main.tsx renders once it's
                          here). Mounted on About too (renders nothing) so Smart Assist keeps its state. Anything only
                          a document needs goes here, not in App — `npm run size` (≤ 110 KB gzip) will say so.
    Header.tsx            toolbar; conditional items wrapped in <CollapseX>
    DocName.tsx           the document name in the header — click to rename (lib/file.ts `normalizeFilename`);
                          `RenameSheet` = the phone version, from MoreMenu's "Rename…" (the header has no room for the name)
    ExportMenu.tsx        Export button + "Export as" panel; ⌘/Ctrl S opens it (state in App), again downloads;
                          "Save as PDF" there = the print dialog on the rendered document (lib/printCopy.ts)
    DocBar.tsx            the bar above every rendered document and the docs pages: type (useDocKind → Document tab's
                          `computeDocStats().kind`, after typing settles) or name, Copy Markdown, one icon per panel tab
                          (`tabs` / `openTab` / `onTab`: open there, or close when that tab shows; the type = Document);
                          container queries. App watches it (IntersectionObserver): on screen → the header's Outline hides
    MarkdownEditor.tsx    textarea + line numbers (a hidden mirror wraps like the textarea; numbers in the gutter; pieces of
                          200 lines memoized) — keep the mirror's text classes = the textarea's. The mirror scrolls by a
                          scroll-driven animation (`.editor-lines`, `--scroll-max`; compositor, same frame as the text) —
                          a scroll listener only where unsupported (it trails a frame). Textarea: `overscroll-none`.
                          The caret line (brighter number): read `selectionStart` once per frame — it costs O(text).
    EmptyState.tsx        start screen (<main>, the page's h1): tagline + one line on what Marksage is, Try it on a sample
                          document (lib/sampleDocument) and the story link, then Open / Paste / Start writing, Privacy link
    PageLoad.tsx          <PageLoading> + <PageLoadBoundary> (Try again / Back) for lazily loaded pages
    motion.tsx            <Presence> (exit animations) and <CollapseX> (toolbar width collapse)
    AboutPage.tsx         feature docs + Appearance (app icon, key style) — keep in sync with features
    StoryPage.tsx         #story: the architecture decisions and models as a timeline (showcase, not docs); content in
                          lib/storyContent.<lang>.ts, lazily loaded — neutral voice, date order, numbers = MODELS / training
    CommandPalette.tsx    ⌘/Ctrl + K: every action of the current screen + recent documents, searchable (EN + PT words);
                          the list is built in `hooks/usePaletteCommands.tsx`. Rules + AI from it opens the Assist menu on the notice
                          (`assistNoticeRequest`) until the notice was seen — never skip it.
    HistoryMenu/HistoryList (the menu numbers the first 9 other documents — 1–9 open them while the search is empty;
                          `numberedEntries` in lib/history), SuggestionBar, AssistToggle, AppIconPicker, SplitPanes, Markdown*
  assist/                 Smart Assist — see "Smart Assist" below (model/ = own models: features + inference; sections.ts / outline.ts = Outline)
  hooks/                  useMarkdownFile (doc + history), useTheme, useAppIcon, useKeyStyle, useMediaQuery;
                          App's parts: useInfoPages (#about… navigation, Back, tab title, lazy docs/story pages),
                          useViewMode (preview / editor + its exit animation), useOutlinePanel (open, tab, doc-bar icons),
                          useGlobalInput (shortcuts ⌘K O S ⇧C — no ⌘N, Chrome, Edge and Opera never pass it to a page —,
                          drop, paste outside the editor, Esc on info pages), useTypeToEdit (typing in the preview opens
                          the editor), usePaletteCommands (the ⌘K list)
  lib/                    storage, history, appIcons (icons + accent), keyStyle, file, sampleDocument,
                          chunks (long-document preview pieces), docsContent(.en/.pt-BR) (docs pages per language), docStats (footer counts)
  index.css               theme tokens, accent palettes ([data-accent]), markdown styles, motion keyframes
scripts/eval-assist.ts    fixture evaluation for Smart Assist
scripts/check-docs.ts     Marksage's own documents and the sample, checked by Marksage's features
training/                 Own models' pipeline (collect → split → train; build-sections → train-sections; tried, not shipped: structure, pastes, link text); clones/train data gitignored
```

## Conventions
- **Colours:** use theme tokens (`accent`, `accent-strong`, `dark-accent`, …), never raw Tailwind hues —
  accents are re-themed per app icon via `:root[data-accent=…]` in `index.css` (+ the pre-paint script in `index.html`).
  Theme: a first visit is light (not the system setting — Pablo's call); `marksage:theme` = `dark` makes the pre-paint
  script add the app's own `dark` class (and a dark page background) before anything renders — keep `useTheme` and
  that script on the same rule.
- **Motion:** use the `anim-*` classes in `index.css`; wrap anything that unmounts in `<Presence>` (or
  `<CollapseX>` in the header). Presence wrappers must carry the positioning classes (`fixed`/`absolute`)
  because the animated wrapper becomes the containing block. Everything must respect `prefers-reduced-motion`.
- **Buttons:** header buttons lift on hover automatically (`header button:hover`); non-button controls use `.press`.
  Touch screens get ≥ 40 px targets (`@media (pointer: coarse)` in `index.css`): header buttons, tabs, `.code-copy`,
  the diagram switch and anything with `.tap` — add `.tap` to small tappable controls.
- **i18n:** every user-facing string goes through `useI18n().t(key)`; add keys to `src/lib/locales/en.ts` (source) and `pt-BR.ts`. Long-form copy (About page) uses the `x(en, pt)` helper; the Smart Assist docs exist as `docs/SMART-ASSIST.md` + `.pt-BR.md`.
- **PT-BR voice** (Pablo approved, 2026-11-05 — the rewrite of every PT surface): written as a Brazilian engineer
  would say it, from the meaning, not sentence by sentence. "Você"; the imperative in the UI; short sentences (one
  idea each, ~16 words on average — longer reads "formal" to the Document tab); active voice ("quem lê os arquivos é
  o navegador"); every claim says why; honest hedges; no marketing words; "para", not "pra"; headings are nouns, not
  English "-ing" forms. English stays the source of truth for facts: every number, name, unit and claim identical,
  in PT-BR number format (0,1 ms; 1.215; 1,7–2,2×). Glossary — EN → PT-BR (UI labels as the docs must name them):
  Outline / Document / Suggestions → **Estrutura / Documento / Sugestões**; Rules · Rules + AI · Off → **Regras ·
  Regras + IA · Desligado**; heuristics → **regras heurísticas** (then "regras"); engine → **engine** ("a engine");
  smart paste → **copia & cola inteligente** (paste types → **tipos de conteúdo colado**); structure hints → **dicas de formatação**; held-out set → **conjunto
  de teste**; dev set → **conjunto de desenvolvimento** (never "dev" alone); training → **treinamento** (never "treino"); bar (to ship) → **critério de aprovação** (never "régua"); confidence gate → **filtro de confiança**; key
  sentence → **frase-chave**; section types → **tipos de seção**; Worth a look → **Vale conferir**; untagged code
  block → **bloco de código sem linguagem**; fence backticks → **crases**; Live editor → **Escrita em tempo
  real**; Not done → **Pendente**; model card → **ficha técnica (model card)**; open-weight → **open weight**;
  tiny / small model → **pequeno modelo**, the adjective first ("dois pequenos modelos de IA", "um pequeno modelo treinado para…"; Pablo, 2026-11-09, reversing "modelo pequeno"; never "minúsculo"); "dar tipo a" → **classificar**; feature (product) → **recurso**, named the first
  time. Stays in English: build, commit, deploy (the Deployment section type is "Deploy"), changelog (also the
  section type), bundle, chunk, cache, dataset, prompt, token, pipeline, README, roadmap, issue, pull request,
  hash, slot, softmax, local-first, BYOK, app, link, download / upload; "feature" only as the ML term, next to
  "sinal" (feature → **sinal**, never "pista" or "sugestão": Sugestões is the tab).
- **Storage keys:** `marksage:{doc,history,split,theme,assist,app-icon,key-style,lang,model-notice,outline,remote-images}`, plus the Cache API store `marksage-models-v1` (Rules + AI mode's model files: `lang-v2.bin`, and `sections-v2.bin` once the Outline is opened in that mode) — wrap every access in try/catch.
- **Privacy:** everything stored must be needed by a feature the user chose (no cookies, analytics or third-party requests).
  Images from other websites load only with "Load images from the web" on (`lib/remoteImages.ts`, About → Privacy;
  off shows a placeholder + a bar linking there) and never send a referrer. Any new key or download must be listed in About → Privacy & storage (EN + PT-BR) and be removed by "Delete all Marksage data" (`deleteAllLocalData`). (Renamed from `markdown-preview:*`; `index.html` migrates old keys once on load.)
- **Security headers:** the built page carries a Content-Security-Policy as a `<meta>` (`marksage-csp` in
  `vite.config.ts`: `default-src 'self'`, inline scripts by hash computed at build, images from the web allowed for
  the opt-in setting) plus `vercel.json`'s headers (`frame-ancestors 'none'`, `nosniff`, `no-referrer`, a
  Permissions-Policy that turns off camera, microphone, geolocation, payment and USB — a speech feature would need
  the microphone back). `vite preview` sends the same headers; `tests/e2e/security.spec.ts` fails on any violation.
  A new third-party request, worker or embed needs the policy changed in the same commit.
- **Scroll sync:** preview blocks carry `data-line` (rehype plugin in `lib/scrollSync.ts`); the editor side is measured with a hidden mirror. Keep `rehypeSourceLines` on the preview.
  The preview renders after the editor (deferred): `useScrollSync` re-syncs when the preview's content resizes while
  the editor is the driver (a paste, typing at the end).
- **Focus:** call `focus({ preventScroll: true })` — plain focus during slide animations shifts the layout.
  Header menus and panels (Export, Assist, Recent) use `useReturnFocus(open, rootRef)`: closing with focus inside (Esc,
  a choice, a download) returns it to the editor when it's on screen, else to the menu's button (always the button on
  touch screens — the editor would pop up the keyboard). The editor textarea carries `data-editor`.
- **Files:** `lib/file.ts` `ACCEPTED_EXTENSIONS` — Markdown only (`.md .markdown .mdx .mdown .mkd .mkdn .mdwn`);
  `.txt` is refused on purpose; `looksBinary` refuses renamed binaries. Keep `error.notMarkdown` listing the same set.
- **Saving:** `useMarkdownFile` debounces saves (300 ms) and also flushes on `pagehide` / `visibilitychange`; New
  saves the empty document at once. Don't remove either — a reload right after typing used to lose text.
  "Delete all Marksage data" sets `wiped` (`lib/storage.ts`, `isWiped()`) so that flush and any pending save write
  nothing until the reload — any new writer of user content must check it too.
  Tabs: a tab writes the document only when it differs from what it last wrote or read (`persisted`), follows
  another tab's save (`storage` event) when it has no changes of its own, and asks (conflict bar) when both do.
  Recent (`lib/history.ts`) is shared the same way: every change applies to what storage holds *now*, never the
  tab's own copy (a stale copy written over the key dropped the other tab's documents), and other tabs' changes
  refresh the menu.
- **Printing / Save as PDF:** Save as PDF and ⌘/Ctrl P print from a hidden iframe (`printDocument` in
  `lib/printCopy.ts`: the page's stylesheets and `<html>` attributes, a copy of the preview in `#print-root`), so the
  page on screen never switches to the print layout (it blinked). The browser's own File → Print falls back to
  the page: `installPrintCopy` copies the rendered preview into `#print-root` on `beforeprint`
  (the document's name as the title) and `@media print` in `index.css` shows only that copy, in the app's theme
  (backgrounds and the page margins printed, so dark prints dark). New app
  chrome needs nothing to stay off paper; controls inside the preview are hidden there by `#print-root button`.
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
  renamed on 2026-10-29 from Heuristics / Hybrid, stored values unchanged). A first visit (nothing stored) starts in
  Rules (`loadAssistMode`); a stored `off` stays off. "AI" = Marksage's own small models, nothing hosted.
  Which question uses a model in each mode is a table in three places — SMART-ASSIST §1.3 (EN + PT), the About
  page (`ModeTable`) and the README — keep them in sync. A model is used in Rules + AI only where it gets clearly more
  answers right than the rules on a fresh held-out set, at about their precision (the code model: 1.7–2.2× the
  right answers, within 2 points of their precision); structure and paste models were tried on 2026-10-28 and
  didn't (structure: one line more in 227; paste: less precise — training/README.md). Say it that way everywhere.
- `HeuristicEngine` (always available) routes by question id (`assist/questions.ts`) to `assist/heuristics/*`.
- `ModelEngine` (Rules + AI mode; stored value `model`): Marksage's own code-language model (`assist/model/`, weights in `public/models/lang-v2.bin`)
  answers `fence.language` — plus confident heuristic answers the model agrees with, and heuristic answers ≥ 99% sure
  (`RULES_OVERRIDE`, `assist/model/hybrid.ts`); everything else falls back to `HeuristicEngine`. Lazy fetch + Cache API, main thread
  (~0.1 ms/decision). Retrain with `training/` (see its README); a new model must beat the current one on dev,
  then on a held-out set. (The earlier `LayaEngine` worker scaffold was removed on 2026-10-24 — it's in git history.)
- Flow: deterministic pre-filter (`prefilter.ts`) → engine → confidence gate (`passesGate`, 0.8 / 0.2 margin) → suggestion.
- Outline panel (`components/OutlinePanel.tsx`, `assist/useOutline.ts`, `hooks/useOutlineNav.ts`): sections from `assist/sections.ts`
  (shared with `training/build-sections.ts` — change the splitter or heading rules there and rebuild the section data);
  type = heading rule, else (Rules + AI mode) `sections-v2.bin` reading the text, gate 0.8 (badge) / 0.6 ("probably").
  Visual only — it never edits. Heading lines are 0-based; the preview's `data-line` is 1-based.
  `useOutline(text, enabled, useModel, panelOpen)`: items are built whenever a document is on screen (the document
  bar's type needs them), but the section model is fetched only once the panel opens (Privacy text depends on it).
  The hover tint is square and spans the pane in split view (`data-split-pane` on SplitPanes' left pane).
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
- Hashes: `#about`, `#privacy` (About scrolled to Privacy & storage), `#smart-assist`, `#models`, `#story`. The tab title
  names the page (`hooks/useInfoPages.tsx`, `title.page`); link previews (crawlers, no JS) always show the site's `og:` tags. Open them by setting
  `location.hash` — never `pushState` directly. Each history entry gets `{ ms: 1, from }` (`useInfoPages`, `navState`):
  the screen it was opened from. The in-app Back (`closeAbout`) calls `history.back()` when `from` is set, so it
  always matches the browser's Back; a direct link (`from: null`) goes to the parent (docs → About → app) with
  `replaceState`. The Back label names the target (`backLabel`).
- The docs pages load lazily per language: `loadDocsPage(lang)` = `TechDocsPage` chunk + `lib/docsContent.<lang>.ts`
  (Markdown + SVGs). Prefetched while About is open (skipped on Save-Data). A failed chunk shows
  `PageLoadBoundary` (Back / Try again → reload: browsers cache a failed module import, so re-importing fails).
- On About and the docs pages the header hides the open document's controls (name, Assist, Edit/Preview, Copy,
  Export; ⌘S and ⌘⇧C do nothing) — they'd act on a document that isn't on screen. The docs pages show a disabled
  "Read-only" in place of Edit (desktop; phones show a lock in the page bar, with the word where it fits, and a long Back label truncates). Their page bar is the same `DocBar` every
  document gets (type, **Copy Markdown** — here the page source as in the repo — and Outline). Docs stay
  read-only: no "open in editor" (Pablo's call).

## Preview rendering
- Performance contract: `MarkdownPreview` is `memo`ized and gets `useDeferredValue` text from `App.tsx` — keep its
  props referentially stable (no new `[]`/objects per render; `useSmartAssist` returns shared empty arrays for this).
  Documents ≥ 20,000 chars render in pieces split at column-0 ATX headings (`lib/chunks.ts`; not inside fences or
  `<pre>/<script>/<style>/<textarea>` blocks; reference definitions copied to every piece; documents with footnotes
  aren't split). Pieces tag `data-chunk` + `data-rel-line`; a layout effect writes the document's `data-line`. Output
  was checked identical to one parse (modulo whitespace between blocks) on the repo's docs. `CodeBlock` is memoized
  with a highlight cache; `buildOutline` caches per heading / section text. Measure typing with the 400-section file
  approach from the 2026-10-28 QA (see the Implementation Context, §29) before and after preview changes.
- Fenced code: `components/CodeBlock.tsx` (Prism via refractor, `lib/highlight.ts`, lazy-loaded by `hooks/useHighlighter.ts` the
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
- Reproducibility (training/README.md): the shipped model file is the baseline — never compare against a "rebuilt"
  one; carry a same-data control. `train.ts --save public/models/…` writes `training/locks/<name>.json` (the section trainer doesn't yet) — commit it with
  the model, and run `fingerprint.ts --check` on a rebuild before training on it.

## Verify before committing
`npx tsc -b` · `npm run lint` · `npm test` (unit, `tests/unit`: logic, hooks and components with Testing Library,
the whole app in `app.test.tsx`; `npm run test:coverage` in CI, floor 50% of lines) · `npm run test:e2e` (Playwright, `tests/e2e`: the production build
in desktop + phone Chromium) · `npm run eval:assist` · `npm run check:docs` (`scripts/check-docs.ts`: the README and the
docs pages, EN + PT-BR, run through every Smart Assist and Document-tab feature in both modes — no suggestion, no
"Worth a look" flag, unless approved in its `ALLOWED`; fix the document, never the rules; and the sample's slips,
all of them and nothing else, also after accepting every suggestion; and no `---` right under a paragraph, which CommonMark reads as a heading) · manually check light/dark, desktop/mobile, and reduced motion.
A user-facing flow that changes needs its E2E test changed or added (`tests/e2e/helpers.ts`: openSample, palette, focused…);
wait on state (`expect`, `expect.poll`), never on time. `CROSS_BROWSER=1` adds WebKit (desktop + iPhone) and Firefox; CI runs
them in `e2e-cross-browser` (blocking, like the others, since its first green run on 2026-11-05).
`tests/e2e/a11y.spec.ts` runs axe (WCAG 2.1 A + AA) on every screen in light and dark, and the four accent palettes
(a new palette gets a line there): a new screen, panel or dialog
gets a scan there; fix what it finds rather than disabling rules (accent text on an accent tint: `text-accent-strong`).
Budgets: `npm run size` (after a build — first-load JS ≤ 110 KB gzip, CSS ≤ 16 KB; `scripts/size.ts`) and
`tests/e2e/perf.spec.ts` (typing on a 400-section, 250 KB document: median ≤ 150 ms per key, slowest ≤ 500 ms).
Raise one only in the commit that needs it, saying why; a new dependency in the first load should be lazy instead.
After editing a workflow, parse it (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`):
an invalid file runs no job at all — GitHub only shows "Invalid workflow file" (a `: ` inside an unquoted step name
did it once). GitHub runs the same on every push and pull request (`.github/workflows/ci.yml`: type-check, lint, build, eval, docs check, version
check) and fails if the eval's "✗" count leaves `EVAL_BASELINE` — update it in the commit that changes the count.

## Versioning (since 2026-10-30)
The version comes from the git history (`scripts/version.ts`): `feat` → minor, `fix` / `perf` → patch, other types
don't change it; majors only at the three commits listed in `MAJORS` (the product's generations). Versions before
3.33.3 were assigned retroactively with the same rule. For every commit: `npm run version:next -- "<the commit
message>"` before committing (writes `package.json`, `package-lock.json`'s two version fields and `CHANGELOG.md` — include them in the commit), then
`npm run version:check` after it. Git tags only for milestones (`v1.0.0`, `v2.0.0`, `v3.0.0`) and versions shown
publicly (annotated; Pablo pushes them with `git push --tags`). About shows the version next to the commit.
