import type { StoryContent } from './storyContent'

const content: StoryContent = {
  title: 'The story of Marksage',
  intro:
    'From a Markdown previewer to an editor that notices: the architecture decisions and the AI models behind it, in the order they happened — with the numbers that decided each step.',
  upcoming: 'Next',
  entries: [
    {
      date: '2026-08-14',
      title: 'Local-first from the first commit',
      body: [
        'Marksage started as a previewer for reading Markdown documentation at work. Its first architecture decision never changed: no backend and no accounts. Files are read by the browser, and the only place anything is kept is the browser’s own storage.',
      ],
      facts: ['Server-side code: none', 'Where documents live: this browser only'],
    },
    {
      date: '2026-09-25',
      title: 'Decision models, not generative ones',
      body: [
        'Decision models — popularised by Jev (Sep 15) and Laya, an open model (Sep 18) — answer fixed questions instead of writing text, so their output can’t be malformed. That is the right shape for “which language is this code?”. A general one, tried later in the browser, turned out too heavy for an editor and not reliable enough on this task.',
        'It led to a rule for every feature: use the smallest tool that works — rules, then a tiny model trained for one question, then a general decision model. Never a generative model in the built-in features.',
      ],
      link: { label: 'Why decision models', hash: 'smart-assist' },
    },
    {
      date: '2026-09-26',
      title: 'Smart Assist: the engine decides, the code edits',
      body: [
        'Writing help is built on one contract. An engine answers fixed questions — pick one of these options, place this on a scale, is this statement true — and Marksage’s own code makes the edit. Every edit is a suggestion: Tab accepts, Esc ignores, undo works.',
        'A suggestion appears only past a confidence gate: the top answer at 80% or more and at least 20 points ahead of the next. The first engine is plain rules.',
      ],
      facts: ['Gate: top ≥ 0.80, margin ≥ 0.20', 'Edits: proposed, guarded against stale text, undoable'],
      link: { label: 'How Smart Assist works', hash: 'smart-assist' },
    },
    {
      date: '2026-10-24',
      title: 'A 385 KB model trained for one question',
      body: [
        'Which language is a code block in? Public repositories hold the answer hundreds of thousands of times, written by the authors themselves: the `python` after a fence’s opening backticks. About 250,000 blocks were collected and split by repository, so no project seen in training ever appears in the tests.',
        'The model is fastText-style: hashed clues from the code, 8 numbers per clue, averaged, one linear layer. It runs in plain TypeScript — no ML runtime — and the same code builds its clues in training and in the browser. The bar was set before measuring: beat the rules on held-out data without losing precision.',
      ],
      facts: [
        '314 held-out blocks: rules 73 right suggestions, model v1 133 (1.8×), ~94% right when shown',
        '385 KB · ~0.1 ms per decision · downloaded only after opting in',
      ],
      link: { label: 'How the models work', hash: 'models' },
    },
    {
      date: '2026-10-24',
      title: 'Calibrated on code it had never seen',
      body: [
        'A confidence only means something if it holds on unfamiliar projects. Version 2 fits its temperature on predictions for repositories it didn’t train on — five extra models, each holding out a fifth of the repositories, about 7,600 blocks — and raises it until 95% of the suggestions it would show are right.',
        'Where the model is unsure, a confident rules answer is used only if the model’s own first pick agrees: two independent methods agreeing add suggestions without adding mistakes.',
      ],
      facts: ['63,751 training blocks from 309 repositories', 'Held-out: 164 suggestions shown, 95.7% right · fresh set: 158, 91.8%'],
      link: { label: 'Calibration and versions', hash: 'models' },
    },
    {
      date: ['2026-10-24', '2026-10-27'],
      title: 'A second model reads whole sections',
      body: [
        'The Outline gives every section a type — setup, reference, security… — from its heading. When the heading doesn’t say, a second 385 KB model reads the text. It is trusted only where it learned something: “explanation” sections got 0 right in two training rounds, so that type stays heading-only.',
      ],
      facts: ['134 held-out repositories: 13.5% of sections typed by the model, 88.9% agreeing with their heading'],
      link: { label: 'The section model', hash: 'models' },
    },
    {
      date: '2026-10-25',
      title: 'AGPL-3.0, and a page that says what is stored',
      body: [
        'Marksage — code and models — is free software under the AGPL-3.0, so modified versions run for other people stay open too. A Privacy & storage page lists everything kept in the browser and deletes it in one click.',
      ],
    },
    {
      date: '2026-10-28',
      title: 'The models that didn’t ship',
      body: [
        'Two more models were trained: one for formatting hints, one for paste types. On fresh data the formatting model beat the rules by a single line — too thin to justify a download — and the paste model was less precise than the rules. Neither ships; both results are documented next to the ones that worked.',
        'The policy since: a model is used only where it matches or beats the rules on a fresh held-out set. The modes say exactly that: Off, Rules, Rules + AI.',
      ],
      facts: ['Formatting hints, 227 held-out lines: rules 140 shown / 88.6% · rules + model 141 / 88.7%', 'Paste types, 53 held-out pastes: rules 97.6% · model 90.9%'],
      link: { label: 'Tried, not used', hash: 'smart-assist' },
    },
    {
      date: '2026-10-29',
      title: 'Typing stays smooth on long documents',
      body: [
        'Long documents render in pieces split at their headings, each memoised, at lower priority than typing: keystrokes paint first and the preview catches up a moment later, re-rendering only the piece that changed.',
      ],
    },
    {
      date: ['2026-10-29', '2026-10-30'],
      title: 'Launch QA by five AI agents',
      body: [
        'Before launch, five AI agents each played a first-time user — impatient, skeptical, on a phone over slow 3G, a non-native English speaker, and one trying to break it — driving the real app in a browser. They reported 36 findings: 35 were fixed, one change per commit, each documented; one is planned.',
        'Two show the method. A 25-second freeze on big tables looked like slow rendering; profiling traced it to a quadratic loop in a Markdown parser dependency, and an update took it to 1.7 s. And when the code model called clearly typed TypeScript “JavaScript”, a clue-by-clue breakdown showed five decisive clues (`: number` the strongest) averaged away among 65 shared ones — leading to a measured fallback for now and the next model’s design.',
      ],
      facts: ['36 findings: 35 fixed, 1 planned', 'Big tables: ~25 s → 1.7 s', 'Fallback: +1 right suggestion, 0 new mistakes on every test set'],
    },
    {
      date: '2026-10-30',
      title: 'Better overall, not where it was aimed',
      body: [
        'The next code model kept each dimension’s strongest clue next to the average (mean + max pooling), so one decisive clue like `: number` couldn’t be averaged away. It was tuned on predictions for repositories it never trained on, then judged once on a third fresh test set — 842 blocks from 158 repositories — against a bar written down before the run: more right suggestions on the near-twin languages (TypeScript/JavaScript, C++/C, C#/Java) without losing precision.',
        'Overall it beat the model in use. On the near-twin languages it didn’t: less precise, and worse on TypeScript/JavaScript. The cause was in the labels, not the model — only 42% of the code tagged TypeScript in training has any TypeScript-only syntax; the rest is valid JavaScript. It didn’t ship, and the result is documented next to the ones that did.',
      ],
      facts: [
        '842 held-out blocks · near-twin languages: 103 right, 88.0% vs 106, 89.8% for the model in use',
        'Overall: 391 right, 93.8% vs 380, 93.1%',
        'Rules fallback re-measured: +3 right, 0 new mistakes — it stays',
      ],
      link: { label: 'Tried, not used', hash: 'models' },
    },
    {
      title: 'What comes next',
      body: [
        'Fixing TypeScript/JavaScript where the problem is: labels that say what the code is, not which project it came from. Then a lighter first load on slow networks, and optional bring-your-own-key AI, off by default.',
      ],
    },
  ],
}

export default content
