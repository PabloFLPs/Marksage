# Marksage

**The Markdown editor that notices.** A minimalist, local-first Markdown editor with a small
on-device assistant (Smart Assist).
Everything runs in the browser — files never leave your machine.

## Features

- **Preview-first** rendering with GFM (tables, task lists, strikethrough, autolinks)
- **Open** via file picker, drag & drop, or paste, or **start writing** from the start screen — Markdown files
  only: `.md`, `.markdown`, `.mdx` (JSX shows as text), `.mdown`, `.mkd`, `.mkdn`, `.mdwn`; plain `.txt` and
  binary files are refused. If the browser won't let "Paste Markdown" read the clipboard, a new document opens
  ready to paste into. **Live split editor** with a resizable divider and **synced scrolling** (preview and
  editor stay on the same passage); start/end buttons on long documents
- **Fast on long documents** — the preview follows the text at low priority and renders in pieces split at
  headings, so a keystroke re-renders only the piece it's in (same HTML as one parse); highlighted code blocks
  and Outline answers are cached. On a 270 KB, 400-section file typing went from ~400 ms to ~20 ms extra per key
- **Smart Assist** (local, on by default in Rules mode; one click to turn off): code-fence language, smart paste (CSV/TSV/aligned text → table,
  lists, JSON/code → fenced block), structure hints (`**Title**` → heading, `-item` / `• item` → list,
  `[text] (url)` → link…), per-section readability dots. Suggest-only: `Tab` accepts, `Esc` dismisses, undo
  still works. Two modes: **Rules** (instant, no download) and **Rules + AI** — Marksage's own tiny models
  where they beat the rules (385 KB each, ~0.1 ms per decision, trained in this repo), downloaded once after
  a notice:

  | Question | Rules | Rules + AI |
  |---|---|---|
  | Code-block language | rules | model, or the rules when the model agrees |
  | Smart paste | rules | rules (a pasted code block's language: as above) |
  | Structure hints | rules | rules |
  | Readability | rules | rules |
  | Outline section types | heading rule | heading rule, then the section model |

  Models for structure hints and paste types were trained too and didn't beat the rules on real text
  (`docs/MODELS.md` §8).
- **Outline panel** — every section with its type (setup, reference, explanation…) and key sentence;
  a **Document** tab with what the file looks like, reading time, readability, tone signals and things
  worth a look (heading jumps, untagged code, images without alt text…), and a **Suggestions** tab listing every
  fix Smart Assist would offer in the document (click → it opens in the editor)
- **Code blocks** with syntax colors (~30 languages, loaded only when needed) and a copy button
- **Recent documents** — up to 15, kept in this browser, searchable (`⌘/Ctrl ⇧ H`)
- **Privacy & storage** — no cookies, accounts or tracking; everything stored is listed on the About page
  (linked from the start screen, `#privacy`), who runs the site, and removable with one click
- **Rename** by clicking the name in the header; **Export** asks for the file name first (the document's name, or
  one from its first heading) and keeps it
- **Autosave** (also on reload, tab close or app switch — nothing typed is lost), export `.md`, copy Markdown, word/char counts
- **English and Português (BR)** — auto-detected, switchable on the About page, remembered
- **Appearance** — app icon + accent palette (Classic, Mono, Outline, Sunset), light/dark theme,
  macOS or Windows keyboard-shortcut labels
- **About page** (`#about`) documenting every feature, with a Smart Assist playground, and two technical
  pages: how Smart Assist works (`#smart-assist`) and how the two models work (`#models`) — loaded on demand,
  only in the current language, prefetched while About is open; a failed download shows *Try again* instead of
  a blank page. Back always returns to the page you came from
- Fluid, fast animations; all disabled under `prefers-reduced-motion`

## Shortcuts

| Keys | Action |
|---|---|
| `⌘/Ctrl O` | Open file |
| `⌘/Ctrl N` | New document |
| `⌘/Ctrl S` | Export — opens the name field; again (or `Enter`) downloads |
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
