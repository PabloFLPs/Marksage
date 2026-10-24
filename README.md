# Marksage

**The Markdown editor that notices.** A minimalist, local-first Markdown editor with a small
on-device assistant (Smart Assist).
Everything runs in the browser — files never leave your machine.

## Features

- **Preview-first** rendering with GFM (tables, task lists, strikethrough, autolinks)
- **Open** via file picker, drag & drop, or paste; **live split editor** with a resizable divider
  and **synced scrolling** (preview and editor stay on the same passage)
- **Smart Assist** (opt-in, local): code-fence language, smart paste (CSV/TSV/aligned text → table,
  lists, JSON/code → fenced block), structure hints (`**Title**` → heading, `-item` → list…),
  per-section readability dots. Suggest-only: `Tab` accepts, `Esc` dismisses, undo still works.
- **Recent documents** — up to 15, kept in this browser (`⌘/Ctrl ⇧ H`)
- **Autosave**, export `.md`, copy Markdown, word/char counts
- **English and Português (BR)** — auto-detected, switchable on the About page, remembered
- **Appearance** — app icon + accent palette (Classic, Mono, Outline, Sunset), light/dark theme,
  macOS or Windows keyboard-shortcut labels
- **About page** (`#about`) documenting every feature, with a Smart Assist playground
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

The data pipeline for Smart Assist's own language model lives in [`training/`](training/README.md).

### Link previews

Shared links show a preview card (`public/og-image.png`, 1200×630) on WhatsApp, Slack, Discord, X, etc.
These services need absolute URLs, so set your deployed URL before building:

```bash
cp .env.example .env   # then edit VITE_SITE_URL, or set it in your host's env vars
```

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4, `react-markdown` + `remark-gfm`, `lucide-react`.
See `AGENTS.md` for architecture and conventions, `docs/SMART-ASSIST.md` for the Smart Assist
technical documentation (heuristics, Laya), and `SMART-ASSIST — Implementation Context.md` for the original design notes.
