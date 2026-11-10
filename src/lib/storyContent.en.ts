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
      date: '2026-09-26',
      title: 'Decision models, not generative ones',
      body: [
        'Decision models — popularized by Jev, from TypeSafe AI (Sep 15), and Laya, an open-weight model (Sep 18) — answer fixed questions instead of writing text. The answer is always one of the listed options, so it never comes back in an unexpected shape. That is the right fit for “which language is this code?”. The plan was a general one running in the browser; for this question, a small model trained just for it was the better fit — over a thousand times smaller than a general decision model (about 262 thousand parameters against the smallest Laya’s 322 million), instant, and measurable on real code, which its authors already label.',
        'It became the way every feature is built: break the problem into small questions and solve them one at a time, each with the simplest tool that is good enough — heuristic rules first, then a small model trained for that question, and a general decision model only when neither works. The features built into Marksage never use a generative model; connecting other AI models, when it comes, will be opt-in.',
      ],
      facts: ['Marksage’s code model: about 262 thousand parameters, 385 KB', 'Laya: 322–421 million parameters'],
      link: { label: 'The model cards: how the models work', hash: 'models' },
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
      date: '2026-10-23',
      title: 'A 385 KB model trained for one question',
      body: [
        'Which language is a code block in? Public repositories hold the answer hundreds of thousands of times, written by the authors themselves: the `python` after a fence’s opening backticks. About 250,000 blocks were collected for the first model and split by repository, so no project seen in training ever appears in the tests.',
        'The model is fastText-style: hashed clues from the code, 8 numbers per clue, averaged, one linear layer. It runs in plain TypeScript — no ML runtime — and the same code builds its clues in training and in the browser. The bar was set before measuring: beat the rules on held-out data without losing precision. v1 met part of it: 1.8× the right suggestions, but 3 points less precise and just short of the coverage target. So it shipped as an opt-in mode, not the default.',
      ],
      facts: [
        '314 held-out blocks: rules 73 right (97% when shown) · model v1 133 (1.8×, ~94%)',
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
        'On the fresh set it was still about a point under the rules’ precision (91.8% vs 92.9%), so the AI mode stays opt-in.',
      ],
      facts: ['63,751 training blocks from 309 repositories', 'Held-out: 164 suggestions shown, 95.7% right · fresh set: 158, 91.8%'],
      link: { label: 'How the models work', hash: 'models' },
    },
    {
      date: ['2026-10-24', '2026-10-27'],
      title: 'A second model reads whole sections',
      body: [
        'The Outline gives every section a type — setup, reference, security… — from its heading. When the heading doesn’t say, a second 385 KB model reads the text. It is trusted only where it learned something: “explanation” sections got 0 right in two training rounds, so that type stays heading-only.',
      ],
      facts: ['134 held-out repositories: 13.5% of sections typed by the model, 88.9% agreeing with their heading'],
      link: { label: 'How the models work', hash: 'models' },
    },
    {
      date: ['2026-10-24', '2026-10-25'],
      title: 'AGPL-3.0, and a page that says what is stored',
      body: [
        'Marksage’s code and models are free software under the AGPL-3.0: anyone who makes a changed version available to other people, even as a website, must offer them its complete source. A Privacy & storage page lists everything kept in the browser and deletes it in one click.',
      ],
    },
    {
      date: '2026-10-28',
      title: 'The models that didn’t ship',
      body: [
        'Two more models were trained: one for formatting hints, one for paste types. On fresh data the formatting model beat the rules by a single line — too thin to justify a download — and the paste model was less precise than the rules. Neither ships; both results are documented next to the ones that worked.',
        'The policy since: a model is used only where, on a fresh held-out set, it gets clearly more answers right than the rules at about the same precision. The modes say exactly that: Off, Rules, Rules + AI.',
      ],
      facts: ['Formatting hints, 227 held-out lines: rules 140 shown / 88.6% · rules + model 141 / 88.7%', 'Paste types, 53 held-out pastes: rules 97.6% · model 90.9%'],
      link: { label: 'How Smart Assist works', hash: 'smart-assist' },
    },
    {
      date: '2026-10-29',
      title: 'Typing stays smooth on long documents',
      body: [
        'Long documents render in pieces split at their headings, each memoized, at lower priority than typing: keystrokes paint first and the preview catches up a moment later, re-rendering only the piece that changed.',
      ],
    },
    {
      date: '2026-10-30',
      title: 'Launch QA by five AI agents',
      body: [
        'Before launch, five AI agents each played a first-time user — impatient, skeptical, on a phone over slow 3G, a non-native English speaker, and one trying to break it — driving the real app in a browser. They reported 36 findings: 35 were fixed, one change per commit, each documented; one is planned.',
        'Two show the method. A 25-second freeze on big tables looked like slow rendering; profiling traced it to a quadratic loop in a Markdown parser dependency, and an update took it to 1.7 s. And when the code model called clearly typed TypeScript “JavaScript”, a clue-by-clue breakdown showed five decisive clues (`: number` the strongest) averaged away among 65 the two languages share. For now, that led to letting the rules decide when they’re nearly certain (measured before it went in), and to the next model’s design.',
      ],
      facts: ['36 findings: 35 fixed, 1 planned', 'Big tables: ~25 s → 1.7 s', 'Fallback: +1 right on the tuning set, held-out sets unchanged, 0 new mistakes'],
    },
    {
      date: '2026-10-30',
      title: 'Better overall, not where it was aimed',
      body: [
        'The next code model kept each dimension’s strongest clue next to the average (mean + max pooling), so one decisive clue like `: number` couldn’t be averaged away. It was tuned on predictions for repositories it never trained on, then judged once on a third fresh test set — 842 blocks from 158 repositories — against a bar written down before the run: more right suggestions on the near-twin languages (TypeScript/JavaScript, C++/C, C#/Java) without losing precision.',
        'Overall it beat the model in use. On the near-twin languages it didn’t: less precise, and worse on TypeScript/JavaScript. The cause was in the labels, not the model — only 42% of the code tagged TypeScript in training has any TypeScript-only syntax; the rest is valid JavaScript. It didn’t ship, and the result is documented next to the ones that did.',
        'Rebuilding the training data also showed that the model in use couldn’t be reproduced exactly from its recorded sources. So the shipped file became the fixed baseline every new model is compared with, and every code model shipped from now on carries a fingerprint of the data it learned from.',
      ],
      facts: [
        '842 held-out blocks · near-twin languages: 103 right, 88.0% vs 106, 89.8% for the model in use',
        'Overall: 391 right, 93.8% vs 380, 93.1%',
        'Rules fallback re-measured: +3 right, 0 new mistakes — it stays',
        'Next shipped code model: a fingerprint of its training data, checked on each rebuild',
      ],
      link: { label: 'How the models work', hash: 'models' },
    },
    {
      title: 'What comes next',
      body: [
        'Fixing TypeScript/JavaScript where the problem is: labels that say what the code is, not which project it came from. Then connecting other AI models (bring your own key): an AI agent, with the model and the key you choose, to help with anything inside Marksage — opt-in and off by default.',
      ],
    },
  ],
  credit: 'Built by {author}, with AI assistance (Claude) for implementation and review; the architecture, the measurement bars and every ship / don’t-ship call are his. Source, training code and model files: {source} (AGPL-3.0).',
}

export default content
