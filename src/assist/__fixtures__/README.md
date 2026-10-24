# Smart Assist fixtures

Up to three sets per feature. `npm run eval:assist` scores each separately; `-- --real` runs only the held-out set.

| File | Set | n | What it is |
|---|---|---|---|
| `fences.json` / `pastes.json` / `lines.json` | authored | 42 / 15 / 23 | Written alongside the heuristics. Regression tests: they should stay at 100 %, which says nothing about real-world quality. |
| `lines.dev.json` | real, dev | 36 | Same method as `lines.real.json`, but from *other* sources (23 repos/wikis: javascript-algorithms, 30-Days-Of-JavaScript and system-design-primer translations, clean-code-javascript, ossu, fd, bat, and the fzf, sway, Proton, jq, rclone, ranger, yabai, scrcpy wikis…). Tune F3 against this one. |
| `fences.real.json` | real, held out | 64 | Fenced code blocks from real docs (25 public repos), labelled with the author's own info string. |
| `pastes.real.json` | real, held out | 31 | Excerpts of real files and real command output, as someone would paste them. |
| `lines.real.json` | real, held out | 30 | Lines the F3 pre-filter flags in real docs and wikis, labelled by hand. |

**Held-out rule:** don't tune heuristics (or Laya prompts) against the `*.real.json` sets. Tune against
the authored and `*.dev.json` sets (a dev set comes from *other* sources than the real set), then run
the real set once to measure. Every real fixture has a `source` so it can be traced; `note` marks
the hard or arguable cases.

## How the real sets were built (2026-10-23)

- **Fences:** all labelled fences from READMEs/docs of laravel/docs, rails guides, fastapi (en + pt),
  reactjs/pt-br.react.dev, axios (multi-language docs), zod, gin, cobra, axum, clap, ripgrep, nlohmann/json,
  cJSON, gson, Polly, devise, pgvector, jbranchaud/til, actions/checkout, hadolint, httpx,
  nodebestpractices (translations), docker docs, duckdb docs, bootstrap — 18k blocks. Info strings
  were normalised (`sh`/`shell`/`console` → `bash`, `tsx` → `ts`, `jsonc`/`json5` → `json`, …); tags outside
  `LANGUAGES` were dropped; blocks of 1–40 lines. Stratified random sample: 4 per language for
  ts/js/bash/python/json, 3 for the rest; max 2 per repo and 1 per file per language. Includes
  comments in pt-BR, Chinese and Japanese.
- **Pastes:** CSV from datasets/gdp, datasets/airport-codes, datasets-br (pt-BR, quoted cells),
  ripgrep benchmarks; TSV from IANA tzdata `.tab` files and UD Portuguese-Bosque (CoNLL-U);
  aligned tables from `bin/rails routes`, `ps`, `pip list`, `ls -l`; lists from rendered docs pages
  (bullets dropped, as a browser copy does), a numbered rails list, `ls -1`, a contributors list;
  code from gin, httpx, zod, axum sources; JSON from `npm view`, tsconfig, a commented VS Code
  settings file, vercel.json; prose from rails/httpx docs, the axios LICENSE, pt-BR React and FastAPI docs.
- **Lines:** the pre-filter (`findStructureCandidates`) run over the doc corpus above plus 14 GitHub
  wikis (vscode, neovim, node, rust, qBittorrent, Sonarr, tmux, …) and coding-interview-university
  translations (curated docs almost never contain `#Title`/`-item` mistakes; wikis and translations do).
  Stratified sample by candidate kind; each `doc` is the smallest window around the line (up to
  ±3 lines) that holds exactly one candidate; CRLF normalised to LF as a textarea does.
  Labelling rule: `true` when the line titles the content after it (heading) or belongs to the
  surrounding list (list item), so accepting the fix makes the document more correct. Bold
  labels that introduce one value/table/list (`**Returns:**`, `**Note**`), emphasised sentences,
  CLI flags, terminal output, CSS and wrapped prose are `false`.
