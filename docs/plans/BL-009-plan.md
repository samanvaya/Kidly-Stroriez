# BL-009: Safety and prompt-quality evaluation - implementation plan

## Goal
Every safety rule (SR-01 to SR-06) has an automated check: free ones on every change,
and a paid, opt-in run against the real AI. The offline worrying-notes check catches
far more phrasings (KI-002).

## Approach
Two layers. Layer A is plain unit tests on the prompts, a new `public/safety.js` phrase
check and a new `storyIssues` helper; they run in `verify.sh`. Layer B is `eval/run.js`,
which starts the real app with a recording wrapper around the Anthropic client, plays
20 invented days through `/api/plan` and `/api/story`, scores them with code checks
and a Claude judge, and only spends money with `--yes`.

## Files
- `public/safety.js` - new - wider offline worrying-notes check (KI-002)
- `public/index.html` - modified, after Satwik agrees - `<script src="safety.js"></script>` before `app.js`
- `public/app.js` - modified, after Satwik agrees - `WORRYING.test(notes)` becomes `window.KidlySafety.isWorrying(notes)`; the `WORRYING` constant is removed
- `src/parse.js` - modified - add `storyIssues`
- `src/prompts.js` - modified - hardening, one change per commit, driven by eval results
- `test/safety-eval.test.js` - new - BL-009-T01 to T09, T11
- `test/safety-cases.js` - new - the 25+ worrying and 25+ ordinary invented notes
- `test/eval.test.js` - new - BL-009-T10, T12, T13
- `eval/cases.json`, `eval/rubric.md`, `eval/grade.js`, `eval/run.js`, `eval/fixtures/*.json` - new
- `package.json` - modified - add `"eval": "node eval/run.js"`
- `.gitignore` - `eval/results/` (already added)
- Docs: `architecture.md`, `docs/SETUP.md`, `backlog.md`, `project-status.md`, `learnings.md`, `docs/evidence/BL-009.md`

## New dependencies
None. Node's test runner, `node:vm` and the already-pinned `@anthropic-ai/sdk` 1.5.0
cover everything.

## Steps
1. Branch `feat/BL-009-safety-eval` from `main`; BL-009 to `implementation`; commit
   the requirement and this plan.
2. Write `test/safety-cases.js`, then measure the current regex against it (the
   "before" numbers for KI-002).
3. `public/safety.js` + T04-T06 until both lists pass.
4. `storyIssues` + T07-T09.
5. Prompt tests T01-T03. T02 will need a small prompts.js change: strip `<` and `>`
   from notes before wrapping, so a typed `</notes>` cannot close the block.
6. Eval: cases, rubric, grader, runner, fixtures, tests T10-T13. Dry run end to end.
7. Wire safety.js into the page, once you confirm Satwik agreed. Rerun the browser
   check on the offline flow.
8. verify.sh green; probe 2-3 tests by breaking their code; PR; review rounds 1 and 2.
9. Live eval and prompt hardening: only after your OK on the cost, and only where a
   key is available (see Risks).

## Automated tests
- T01-T03: a prompt edit that drops a safety rule, unwraps the notes or leaks the name.
- T04-T06: the offline check missing a serious phrasing or flagging an ordinary day.
- T07-T09: the story scanner missing a banned word or a copied name, or crying wolf.
- T10: a grader that is too lenient (bad fixture passes) or broken (oracle fails).
- T11: a case file missing a category or reusing an id.
- T12: an eval run that spends money without `--yes`.
- T13: the runner not working against the real routes.

## Human acceptance test
See `docs/requirements/BL-009.md` section 10.

## Architecture impact
None to the app. `architecture.md` gets an "Evaluation" section describing the two
layers and how to run them.

## Cost of one live run (estimate, to approve before any paid call)
Per safe case: 1 plan + 3 parts on `claude-opus-5-5` at low effort, about 8k input and
4k output tokens including thinking, about $0.11, plus the judge (about 3k in, 1k out
at medium effort, about $0.03). Unsafe cases stop after the plan. 20 cases x 1 rep:
**about $2.50 per run**; a before/after pair is about $5. The runner prints the real
cost from the API's token counts after each run.

## Risks
- **No Anthropic key here.** The live eval cannot run in this session. You or Max run
  `npm run eval -- --yes` with a key, and I read the results from
  `eval/results/<run>/summary.md`. Prompt hardening waits for those numbers.
- The NVIDIA Nemotron key cannot replace this: the app uses Claude, so stories
  written by Nemotron with our prompts would measure a different model, and prompt
  fixes tuned on it may not carry over. Nemotron could act as the judge only, but the
  stories still need Claude, so it does not unblock anything today. I recommend
  leaving it out.
- A phrase list can never catch everything. Live mode relies on the model's judgement
  (tested in Layer B). The offline list targets the 25+ table, not all language.
- Judge scores vary from run to run; use `--reps 3` before trusting small differences.

## Out of scope
- Wiring `storyIssues` into `/api/story` (needs `src/app.js`): follow-up PR.
- CI runs of the paid eval.
- Deploy and live verification (BL-002, Max).

---
Approved by user: [ ] on YYYY-MM-DD
