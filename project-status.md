# Project status

Last updated: 2026-11-20
Last merged: BL-001 - Hackathon demo, day to plan to interactive story (PR #1)

## Where we are
`BL-001` is merged to `main` (PR #1). The hackathon demo works end to end on a phone with the built-in offline story, and the live Claude path is built and unit-tested with a fake client. Phases 1-4 were compressed into a few decisions because the hackathon is today (2 hours).

## Next step
1. Deploy (`BL-002`) with `ANTHROPIC_API_KEY` and `PLAN_SECRET` set on the host, then run the human acceptance test in `docs/requirements/BL-001.md` against the live AI.
2. Split into parallel, conflict-free tracks below.

## Team work split (conflict-free)

Pull the latest `main`, then create separate branches and stay within your owned files:

| Person | Backlog / Focus | Scope | Owned files |
|---|---|---|---|
| **Max** | `BL-001` acceptance + `BL-002` (Deploy & live verification) | Deploy to a public URL with `ANTHROPIC_API_KEY` and persistent `PLAN_SECRET` (resolves `KI-001`, `KI-003`); run the 10-step human acceptance test in `docs/requirements/BL-001.md` on a phone. | Hosting/env config, `docs/SETUP.md`, `backlog.md`, `project-status.md` (`src/server.js` only if host env/port tweaks are needed) |
| **Samy** | `BL-009` (Safety & prompt quality eval, `SR-01..SR-06`, fixing `KI-002`) | Build an evaluation suite testing no real names (`SR-01`), calm/non-punitive tone (`SR-02`, `SR-06`), age fit (`SR-04`), and refusal on worrying notes (`SR-03`); harden prompts and the offline safety check (`KI-002`). | `src/prompts.js`, `src/parse.js`, new test file(s) (e.g. `test/safety-eval.test.js`) |
| **Satwik** | `BL-003` (Parent accounts & gate: `FR-50`, `FR-52`) **or** `BL-006` (Read aloud: `FR-40`) | **Option A (Backend, unblocks `BL-004`/`BL-005`):** Build parent auth/storage and parent gate as standalone modules.<br>**Option B (Frontend, zero backend overlap):** Add read-aloud controls and mobile UI polish. | **Option A:** New `src/auth.js`, `src/db.js`, `test/auth.test.js`<br>**Option B:** `public/index.html`, `public/style.css`, `public/app.js` |

### Coordination rules
- Do not edit `src/app.js` simultaneously—wire new modules (`BL-003`) into `src/app.js` via small, sequential PRs after the standalone modules are tested.
- Resolve open questions #2 (age range) and #8 (whether to keep parent notes) in `docs/REQUIREMENTS.md` Section 10 before starting `BL-004` (saved stories).

## BL-009 (Samy)
In review on branch `feat/BL-009-safety-eval`: offline check widened, story scanner,
prompt fencing and the live eval (built and tested with a stand-in AI). The paid live
run waits for an Anthropic API key; nobody on the team has one yet.

## Open decisions
- All open questions in `docs/REQUIREMENTS.md` section 10 (name, age range, choice moments, launch markets, price, safety review, AI provider, keeping parent notes).

## Security incidents
- 2026-11-20: an NVIDIA API key was pasted into the chat of a Claude Code session
  (BL-009 kickoff). Not used, not stored, not committed. Open: the owner revokes it at
  build.nvidia.com and creates a new one; keys go only into `.env` or the host's
  secret settings.

## Gotchas
- `npm start` does not read `.env` (no loader), so a key in `.env` is ignored and the
  app stays offline. Fix for BL-002: start with `node --env-file=.env` or load it in
  `src/server.js`. (Found in BL-009, 2026-11-20.)
- Anthropic keys cannot be stored as cloud-session secrets, so the live path could not be tested in the build session. Test it on the deployed app.
