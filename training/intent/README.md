# training/intent — the command palette's intent model

Query (EN / PT-BR) → a command id of `src/commands/registry.ts`, or `none`. Plan and decisions: ROADMAP §0.3.

```bash
node --experimental-strip-types training/intent/build.ts             # train / val → training/data/intent (gitignored)
node --experimental-strip-types training/intent/eval-fuzzy.ts val    # the FuzzyMatcher baseline on val
node --experimental-strip-types training/intent/make-test-template.ts  # the blank sheet for the test set
```

## Data v1 (2026-11-17)

| Set | Rows | Templates | Source |
|---|---|---|---|
| train | 1,956 | 764 | registry titles (both languages, every toggle state), search words that belong to one command only, 4 in 5 handwritten phrases with their variants |
| val | 390 | 134 | 1 in 5 handwritten phrases with their variants (by template hash, at least one per command and language); 23 rows left out because they repeated a train row |
| test | — | — | **Pablo's**, `test.v1.md` (written in Marksage from `test.v1.template.md`, read by `testSet.ts`), frozen in `training/locks/` before any training |

- **Sources.** `phrases.ts`: 7–14 phrases per command per language and 38 `none` per language (things the palette can't
  do: bold, images, undo, translate…), written before the test set existed. The registry's search words mix both
  languages (`lang: "any"`); a word several commands share ("english" on both language commands, "assist" on the
  three modes) is left out, as it would teach contradicting answers.
- **Variants** of each phrase: no accents / lower case, one typo in a word of 4+ letters (swapped, dropped, doubled
  or wrong letter), a polite prefix ("please", "por favor"…). Seeded (`SEED = 1`): same inputs, same bytes —
  `manifest.v1.json` keeps the counts and the SHA-256 of both files.
- **Split by template, never by variant**, so val holds no near-copy of a train row; val rows equal to a train row
  once accents, case and punctuation are ignored are left out. One query, one answer: the build stops if the same text
  appears under two commands (it caught "italic": a search word of Remove formatting, and a `none` phrase — now "make
  it italic").

## Baseline: the FuzzyMatcher on val

| | Commands, top-1 | Commands, top-2 | `none`: said nothing |
|---|---|---|---|
| EN (n = 169 / 18), first matcher | 18.9% | 18.9% | 100% |
| PT-BR (n = 184 / 19), first matcher | 17.4% | 17.4% | 100% |
| **EN, filler words ignored** | **34.3%** | **34.3%** | **100%** |
| **PT-BR, filler words ignored** | **30.4%** | **32.1%** | **100%** |

The first matcher needed **every** typed word somewhere in the command, so "paste **from** clipboard" or "copia
**isso**" found nothing. Pablo's call (2026-11-17): filler words on their own are too vague to count, so the matcher
ignores them (`FILLER` in `src/commands/fuzzyMatcher.ts`, EN + PT; never *off, no, up, down, all, sem*, which decide
the command). That roughly doubled it, and that second matcher is the baseline: the model has to beat the best plain
matcher, not a weak one. What's left needs meaning, not words: "show preview" while the row says Edit, "lights off"
for the theme. With filler words ignored, "nothing" was right 13.6% of the time (37 of 273). Every command is offered in this measurement (the model is scored the same way); in the app both see only
what `when` allows. The bar the model must clear is on Pablo's test set, not this one (D7: top-1 ≥ FuzzyMatcher + 10
points in each language, `none` precision ≥ 90%).
