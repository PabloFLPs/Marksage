# Smart Assist — Technical Documentation

Smart Assist is the optional, local "writing radar" of Marksage. It watches the
editor, detects a small set of fixable situations, and **suggests** an edit the user can accept
(`Tab`) or dismiss (`Esc`). Nothing is sent over the network and nothing is ever applied
automatically.

> This page is for the curious: how the assistant decides, why it stays quiet, and how
> Marksage's own little model was trained. Some familiarity with programming helps, but you don't need the source code — it's on
> [GitHub](https://github.com/PabloFLPs/Marksage) if you want to dig in.

---

## 1. Why "decision models"

Smart Assist is built around **decision models** rather than generative models. A decision model
answers a *typed question over a set of answers fixed up front*:

| Decision type | Question shape | Returns |
|---|---|---|
| `choice` | "Which of these options?" | the chosen key + a probability per option |
| `score` | "Where on this ordered scale?" | an index + a probability per step |
| `noul` | "Is this statement true?" | a single probability in `[0, 1]` |

Because the answer space is closed, the output can never be malformed. The guiding rule:

> **The engine decides; our TypeScript code acts.** If you can't list the possible answers up
> front, it's not a Smart Assist job.

This is also why the project explicitly avoids generative autocomplete, rewriting, and "AI
spell-check" (deterministic tools such as `nspell`/`remark-lint` are the right tool there).

---

## 2. Architecture

```
textarea ──(debounce 400 ms / paste / 2 s idle)──► pre-filter     "is there a candidate?"
                                                     │  no → stop (no engine call)
                                                     ▼
                                              DecisionEngine
                                   ┌─────────────────┴─────────────────┐
                            HeuristicEngine                      ModelEngine
                         (always available, sync-ish)   (own model for code languages, heuristics for the rest)
                                   └─────────────────┬─────────────────┘
                                                     ▼
                                     confidence gate (passesGate)
                                                     ▼
                              Suggestion { edit, expected, confidence }
                                                     ▼
                         SuggestionBar  →  Tab: apply edit  /  Esc: dismiss
```

### 2.1 Building blocks

| Piece | What it does |
|---|---|
| **Pre-filter** | Cheap, deterministic checks that find *candidates* (an untagged code block, a multi-line paste, a near-miss heading). No candidate → nothing else runs. |
| **Decision engine** | Answers the typed question for a candidate. Two interchangeable engines: *heuristics* and *Local model* (Marksage's own model for code-block languages + heuristics for the rest). |
| **Confidence gate** | Drops any answer that isn't clearly ahead of the alternatives. |
| **Features** | Turn a confident decision into a concrete, reversible edit (the four features below). |
| **Converters** | Plain code that performs the edit — building a table, a list, a fenced block. The engine never writes text. |
| **Suggestion bar** | Shows one suggestion at a time; you accept or dismiss it. |
| **Evaluation set** | Hand-labelled examples used to measure each feature before it ships. |

### 2.2 The engine contract

```ts
interface DecisionEngine {
  readonly kind: 'heuristic' | 'model'
  ready(): Promise<void>
  choice<T extends string>(state: string, q: string, options: Record<T, string>): Promise<Decision<T>>
  score(state: string, q: string, scale: string[]): Promise<{ value: number; probs: number[] }>
  noul(state: string, statement: string): Promise<number>
}
```

Both engines implement the same interface, so features never know which one answered.
`q` is a stable id (e.g. `fence.language`); a model engine receives the matching
natural-language prompt from `PROMPTS`, while the heuristic engine uses it to pick a scorer.

### 2.3 The confidence gate

A suggestion is shown only when the engine is sure:

```ts
passesGate(probs, threshold = 0.8, minMargin = 0.2)
// top probability ≥ 0.8  AND  top − second ≥ 0.2
```

| Feature | Gate |
|---|---|
| Code-block language, smart paste | 0.8 / 0.2 |
| Structure hints (`noul`) | p ≥ 0.8 (implies margin 0.6 over "false") |
| Readability | 0.5 / 0.15 (it's a passive hint, not an edit) |

Silence is the default: a missed suggestion costs nothing, a wrong one costs trust.

### 2.4 Safety guarantees

- **Suggest-only.** Every `Suggestion` carries an `edit` (`from`, `to`, `insert`) and an
  `expected` string. On accept, the hook re-checks that `text.slice(from, to) === expected`;
  if the user has typed since, the stale suggestion is dropped.
- **Undo works.** Edits are applied with `document.execCommand('insertText')`, so they enter the
  browser's native undo stack (`⌘/Ctrl Z`); a controlled `onChange` is the fallback.
- **Never per keystroke.** Analysis is debounced (400 ms), readability waits for 2 s idle, and
  the pre-filter must find a candidate before any engine call.
- **Cancellation.** Each run owns an `AbortController`; new input aborts stale runs.
- **Dismissals stick** for the session (keyed by a content hash), so the same hint never nags.
- **Off means off.** With the mode set to *Off*, no handlers are attached to the textarea.

---

## 3. Features and their heuristics

### Code-block language (`choice`)

**Trigger.** A *closed* fenced block (```` ``` ```` or `~~~`) with an empty info string, body ≥ 3
chars, and the cursor **outside** the block (you've finished writing it). The nearest such fence
is evaluated first (max 3 per run).

**Options.** 20 languages + `plaintext`: ts, js, python, bash, json, html, css, sql, go, rust,
java, c, cpp, csharp, ruby, php, yaml, markdown, diff, dockerfile.

**Heuristic**. Each language has weighted regex rules that behave like
logits — each matching rule adds its weight once:

- *Distinctive* evidence gets high weights (`package main` → Go +4, `<?php` → PHP +6,
  `if err != nil` → Go +4, `#!/bin/bash` → Bash +5, `@@ -1,2 +1,2 @@` → diff +5).
- *Shared* syntax (braces, `=>`, `import … from`) gets small weights across languages.
- *Negative* rules subtract contradicting evidence (e.g. TS type annotations penalise plain JS).
- *Structural overrides:* content that parses as JSON → json +6 — including the relaxed
  "JSON with comments / trailing commas" dialect used by config files (+5); TS vs JS is decided by TS-only evidence
  (type annotations, `interface`, `import type`, `as const`), since TS is a superset of JS.
- `plaintext` is scored from a **code-likeness** ratio (symbol density vs. words, minus sentence
  punctuation), so prose in any language (including pt-BR) stays untagged.

Scores go through `softmax` → probabilities → gate. **Action:** insert the language id right after
the opening fence marker.

### Smart paste (`choice`)

**Trigger.** A `paste` into the editor with ≥ 2 non-empty lines (≤ 50 k chars) that doesn't
already start as Markdown structure (tables, fences, headings, lists). **The paste always lands
untouched**; the suggestion offers to convert the pasted range afterwards.

**Options.** `prose | table | csv | tsv | list | code | json`.

**Heuristic**:

| Kind | Evidence |
|---|---|
| `json` | parses as JSON (strict, or with comments / trailing commas) — even a single-line, minified payload |
| `tsv` | tab count identical on every line (+7) |
| `csv` | consistent comma-cell count (quote-aware), short cells; penalised by sentences and "wordy" cells (> 5 words) |
| `table` | column gutters (2+ spaces) shared by every line — terminal / `kubectl`-style output |
| `list` | bullet markers (`•`, `–`, `1)`, `a.`…) or ≥ 3 short lines without terminal punctuation |
| `code` | reuses the code-block language scores + structural code shape (lines ending in `{ } ;`, indentation) |
| `prose` | lines with sentence punctuation and ≥ 8 words |

**Action**: CSV/TSV/aligned → GFM table (first row = header, `|` escaped); list →
`- item` (existing bullets normalised); JSON → ```` ```json ```` (minified JSON is pretty-printed first); code → fenced block, tagged with
the detected language only if *that* decision also passes the gate. `prose` never suggests anything.

### Structure hints (`noul`)

**Trigger.** Near-miss Markdown on a line that is **not** the one being typed, outside code —
fenced blocks, indented code blocks and raw HTML (`<pre>`, `<style>`, …) are skipped:

| Candidate | Fix |
|---|---|
| `**Title**` alone on a line after a blank line | `## Title` |
| `#Heading` (no space) — but not `#tag` single words or `#fff` colours | `# Heading` |
| `== Title ==` (wiki style) | heading, level from the `=` count |
| `-item`, `*item`, `+item` | `- item` |
| `1)item`, `1.item` | `1) item` |

**Heuristic**. The engine gets the ±2 lines of context and a statement
such as *"The line "**Installation**" is meant to be a section heading."*. The probability starts
from a per-kind prior and is adjusted by evidence:

- **Bold lines** that are long, end like a sentence (`.` `!` `?`, also `。` `！` `？` and other scripts),
  end with a colon (`**Returns:**`), start with a callout word (`Note`, `Warning`, `Tip`, `Q`/`A`,
  `Nota`, `Atenção`, `Dica`, …) or are just a link are labels or emphasis, not headings.
- **Dash lines** that look like CLI flags (`-s, --search`), flag sets (`+SIMD +AVX`), CSS
  (`-webkit-line-clamp: 2;`) or negative numbers (`-5 degrees`) aren't list items; `*word*` is emphasis.
- **List fixes** need company: neighbouring list items raise confidence; a lone `*line` is more
  often a footnote than a bullet, so it stays quiet.

### Readability (`score`)

**Trigger.** 2 s idle; one decision per `##` section with ≥ 30 words.

**Heuristic**. **LIX**, chosen because it is language-agnostic
(works for English and Portuguese, unlike Flesch variants tuned to English syllables):

```
LIX = words / sentences + 100 × longWords / words      (long = more than 6 letters)
```

Markdown is stripped first (code, links, tables; list items and headings count as sentences).
The value is mapped onto a 5-step scale — *very easy · easy · moderate · hard · very hard*
(bucket centres 25/35/45/55/65) — with a sharpness that grows with section length, so short
sections produce flat distributions and stay silent.

**Action.** A small coloured dot next to the section's heading in the preview, with a tooltip.
Marks are only re-rendered when a score actually changes.

---

## 4. Marksage's own model

### 4.1 What it is

*Local model* mode adds a small language classifier trained for exactly one job: naming the
language of an untagged code block (and of a pasted block of code). Everything else keeps
using the heuristics. It isn't a chatbot or an LLM — it reads a snippet and picks one of the 21
answers, like the rest of Smart Assist.

- **Size and speed:** 385 KB; one decision takes about 0.1 ms in plain JavaScript — no ML runtime,
  no WebGPU, no worker needed.
- **Private:** downloaded once from the same site as the app — only after you pick the mode and
  confirm a short notice — then kept in your browser's cache (removable any time in About → Privacy
  & storage). Your text never leaves the page.
- **How it reads code:** the snippet becomes a set of small clues — words and symbols, pairs of
  neighbouring tokens, how lines start and end, the indentation style, and three-letter pieces of
  longer words. Each clue has a learned 8-number vector; the model averages them and turns the
  average into one probability per language.
- **Calibrated:** its confidence was tuned so that "90 %" really means about 90 % right — the same
  confidence gate as the heuristics (0.8 / 0.2) decides whether you see anything.

### 4.2 How it was trained

- **Data:** about 250,000 code blocks from 265 public repositories (docs, READMEs, guides —
  including Portuguese ones), labelled with the language the *original authors* tagged them with,
  plus snippets of real source files for rarer languages.
- **Fair split:** whole repositories go to training, tuning (dev) or the final test — never the same
  project in two places — and any training block that looks like a test block is removed.
- **Training:** about 55,000 blocks, a few seconds per pass, done in TypeScript with the same code
  the app uses to read snippets, so what the model saw in training is exactly what it sees here.
- **Chosen on dev, measured once:** size, settings and how to combine it with the heuristics were
  decided on the dev set; the held-out set was run once at the end.

### 4.3 Results

On 314 real code blocks the model had never seen (15 per language):

| Engine | Accuracy | Suggestions shown | Right when shown | Right / wrong suggestions |
|---|---|---|---|---|
| Heuristics | 57 % | 75 (24 %) | 97 % | 73 / 2 |
| **Marksage's model** | **76 %** | **141 (45 %)** | **94 %** | **133 / 8** |

About twice as many useful suggestions, at a slightly higher miss rate — which is why it's an
opt-in mode. Most of its misses are one- to three-line snippets, where languages look alike
(`List<int> xs = new();` is C#, but reads a lot like Java); a better handle on very short snippets
is the next step.

### 4.4 And Laya?

**Laya** — an open-weights decision model (~322–421 M parameters) that natively answers
`choice` / `score` / `noul` — was the original plan for this mode. For code-block languages a purpose-trained model
turned out to be the better fit: thousands of times smaller, instant, and measurable on real data.
Laya stays an option for future questions where no such training data exists. Whatever runs, runs
on your device — a hosted model would break the "files never leave your machine" promise.

---

## 5. How it's measured

Every feature is checked against a hand-labelled set of examples — code snippets in many
languages, real-world pastes (CSV, spreadsheet cells, terminal output, JSON), near-miss lines —
including Portuguese prose and mixed-language text. For each feature we track:

- **Accuracy** — how often the top answer is right;
- **Shown** — how many suggestions pass the confidence gate;
- **Precision when shown** — how often a suggestion you actually *see* is right (the number that matters most);
- **Calibration** — whether "90 % confident" really means ~90 % correct;
- **Latency** per decision.

There are two kinds of examples. The **written** set was made alongside the rules — it catches
regressions, but scores near 100 % by construction. The **real-world** set is taken from real
documentation, GitHub wikis, community translations, data files and terminal output (Portuguese
included), and the rules are never tuned against it — so it's the honest number:

| Feature | Real-world examples | Accuracy | Shown | Precision when shown |
|---|---|---|---|---|
| Code-block language | 314 | 57 % | 75 | 97 % |
| Smart paste | 31 | 81 % | 17 | 100 % |
| Structure hints | 30 | 93 % | 14 | 86 % |

Read it like this: when a suggestion appears it's almost always right; the cost of that caution
is that many real code blocks get no language suggestion at all. Heuristic decisions take well under
a millisecond. With *Local model*, code-block language on the same 314 blocks reaches **76 % accuracy, 141 shown, 94 %
precision** (section 4.3).

---

## 6. Dig deeper

Curious how a specific rule works, or want to contribute a new one? The full source — engine,
heuristics, evaluation set and contributor notes — is on [GitHub](https://github.com/PabloFLPs/Marksage).
