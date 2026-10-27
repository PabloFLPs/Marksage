# Marksage

**The Markdown editor that notices.** A minimalist, local-first Markdown editor with a small
on-device assistant (Smart Assist).
Everything runs in the browser — files never leave your machine.

## Features

- **Preview-first** rendering with GFM (tables, task lists, strikethrough, autolinks)
- **Open** via file picker, drag & drop, or paste; **live split editor** with a resizable divider
  and **synced scrolling** (preview and editor stay on the same passage); start/end buttons on long documents
- **Smart Assist** (opt-in, local): code-fence language, smart paste (CSV/TSV/aligned text → table,
  lists, JSON/code → fenced block), structure hints (`**Title**` → heading, `-item` → list…),
  per-section readability dots. Suggest-only: `Tab` accepts, `Esc` dismisses, undo still works.
  Two modes: **Heuristics** (instant, no download) and **Local model** — Marksage's own tiny models
  (385 KB each, ~0.1 ms per decision, trained in this repo), downloaded once after a notice.
- **Outline panel** — every section with its type (setup, reference, explanation…) and key sentence;
  a **Document** tab with what the file looks like, reading time, readability, tone signals and things
  worth a look (heading jumps, untagged code, images without alt text…)
- **Code blocks** with syntax colors (~30 languages, loaded only when needed) and a copy button
- **Recent documents** — up to 15, kept in this browser, searchable (`⌘/Ctrl ⇧ H`)
- **Privacy & storage** — no cookies, accounts or tracking; everything stored is listed on the About page
  and removable with one click
- **Autosave**, export `.md`, copy Markdown, word/char counts
- **English and Português (BR)** — auto-detected, switchable on the About page, remembered
- **Appearance** — app icon + accent palette (Classic, Mono, Outline, Sunset), light/dark theme,
  macOS or Windows keyboard-shortcut labels
- **About page** (`#about`) documenting every feature, with a Smart Assist playground, and two technical
  pages: how Smart Assist works (`#smart-assist`) and how the two models work (`#models`)
- Fluid, fast animations; all disabled under `prefers-reduced-motion`

## Shortcuts

| Keys | Action |
|---|---|
| `⌘/Ctrl O` | Open file |
| `⌘/Ctrl N` | New document |
| `⌘/Ctrl S` | Export |
| `⌘/Ctrl ⇧ C` | Copy Markdown |
| `⌘/Ctrl ⇧ H` | Recent documents |
| `Tab` / `Esc` | Accept / dismiss a suggestion |

## Development

```bash
npm install
npm run dev          # dev server
npm run build        # type-check + production build
npm run lint         # oxlint
npm run eval:assist  # Smart Assist fixture evaluation (Node ≥ 22.6)
```

The data pipeline and trainers for Smart Assist's own models live in [`training/`](training/README.md).
[`examples/marksage-models.mjs`](examples/marksage-models.mjs) runs both models outside the app (no
dependencies; the model cards are in `docs/MODELS.md` §7).

### Link previews

Shared links show a preview card (`public/og-image.png`, 1200×630) on WhatsApp, Slack, Discord, X, etc.
These services need absolute URLs, so set your deployed URL before building:

```bash
cp .env.example .env   # then edit VITE_SITE_URL, or set it in your host's env vars
```

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4, `react-markdown` + `remark-gfm`, `lucide-react`,
`refractor` (Prism grammars, lazy) and `mermaid` (docs diagram view, lazy).
See `AGENTS.md` for architecture and conventions, `docs/SMART-ASSIST.md` for the Smart Assist
technical documentation (heuristics, Marksage's own models, evaluation), `docs/MODELS.md` for the models
from zero (model cards, version history), [`training/`](training/README.md) for the model pipeline,
`ROADMAP.md` for what's next, and `SMART-ASSIST — Implementation Context.md` for the design notes and
timeline.

## License

Copyright (C) 2026 PabloFLPs.

Marksage — the app, the training code and the model files — is free software under the
[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`). You can use, study, change and share it;
if you distribute it, or run a modified version for others over a network, you must offer your source under
the same license.
