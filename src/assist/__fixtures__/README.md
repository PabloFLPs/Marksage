# Smart Assist fixtures

Up to three sets per feature. `npm run eval:assist` scores each separately; `-- --real` runs only the held-out set.

| File | Set | n | What it is |
|---|---|---|---|
| `fences.json` / `pastes.json` / `lines.json` | authored | 42 / 15 / 36 | Written alongside the heuristics. Regression tests: they should stay at 100 %, which says nothing about real-world quality. |
| `lines.dev.json` | real, dev | 212 | Same method as `lines.real.json`, but from *other* sources: 36 from 23 repos/wikis (javascript-algorithms, 30-Days-Of-JavaScript and system-design-primer translations, clean-code-javascript, ossu, fd, bat, and the fzf, sway, Proton, jq, rclone, ranger, yabai, scrcpy wikis…), plus 176 (2026-10-28) from GitHub issues of 20 repos and 16 wikis, with `line` naming the labelled line. Tune F3 against this one. |
| `fences.dev.json` | real, dev | 280 | Fenced code blocks from 28 repos that are neither train nor test (built by `training/build-sets.ts`). Tune / calibrate F1 against this. |
| `fences.real2.json` | real, held out (2nd) | 284 | A second, fresh code-block set from 72 repos used nowhere else (`training/sources-test2.json`), leak-checked against the whole collection; built once for model v2 and frozen. |
| `fences.real.json` | real, held out | 314 | Fenced code blocks from 66 test repos, ≤ 15 per language, labelled with the author's own info string. The first 64 are the original hand-sampled set; the rest were added by `training/build-sets.ts` (see `training/README.md`). |
| `pastes.dev.json` | real, dev | 27 | Pastes from *other* sources than `pastes.real.json` (datasets, `/etc/protocols`/`services`, `dotnet`/`tiup`/`kubectl` output, rendered pt-BR lists, JSONC configs…). Tune smart paste against this. |
| `pastes.real.json` | real, held out | 31 | Excerpts of real files and real command output, as someone would paste them. |
| `lines.real.json` | real, held out | 30 | Lines the F3 pre-filter flags in real docs and wikis, labelled by hand. |
| `lines.real2.json` | real, held out (2nd) | 227 | Near-miss lines from GitHub issues, pull requests and comments of 43 repos used nowhere else (2026-10-28, built for the structure model): ±3-line windows, `line` = the labelled line, `note` on arguable cases. Frozen. |
| `pastes.real2.json` | real, held out (2nd) | 53 | Real pastes from 19 sources outside the training corpus (2026-10-28, built for the paste model): CSV/TSV files, spreadsheet copies, `pip`/`kubectl` output, source files, configs, README lists and paragraphs (EN + PT). Frozen. |

**Held-out rule:** don't tune heuristics (or retrain the model) against the `*.real.json` sets. Tune against
the authored and `*.dev.json` sets (a dev set comes from *other* sources than the real set), then run
the real set once to measure. Every real fixture has a `source` so it can be traced; `note` marks
the hard or arguable cases.

## How the real sets were built (committed 2026-10-24, ccd7ca0)

F1 dev/test now come from the `training/` pipeline (split by repo, leak-checked against the training
data); the notes below describe the original hand-built sets.

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

## Outline heading rule

`headings.json` (authored): headings → expected section type, or `null` when the heading alone shouldn't decide
(long headings where a type word is incidental, competing types, navigation like "See also"). It guards
`headingType` in `sections.ts`. The section model itself is evaluated on held-out repositories by
`training/train-sections.ts` (labels come from headings there, see `training/README.md`).

## Document tab

`docstats.json` (authored): small documents with the expected kind (README, changelog, article, or none) and the
exact flags (`kind:line`) `computeDocStats` should report — one document triggers every flag type. Heading rule
only (no model), so it's deterministic.
