# Project status

Last updated: 2026-11-20
Last merged: BL-009 - Safety and prompt-quality evaluation (PR #4)

## Active work
- **Max:** Starting `BL-019` (Optional parallel pre-generation of all story choice continuations — `NFR-08`, `NFR-01`, `FR-23`, `FR-26`) so Part 1 streams immediately while choice continuations pre-generate in parallel in the background.

## Where we are
`BL-001` (hackathon demo) and `BL-012` (NVIDIA Nemotron Ultra backend adapter) are `implemented` and verified live on `localhost` with `NVIDIA_API_KEY`. All 39 unit/integration tests pass. `BL-009` (Samy) is merged, waiting for Samy's human check. `BL-019` is now `draft` and being planned/built by Max.

## Next step
1. Teammate deploys `BL-002` to a public URL with `NVIDIA_API_KEY` (or `ANTHROPIC_API_KEY`) and persistent `PLAN_SECRET` set on the host.
2. Max writes `docs/requirements/BL-019.md` and implements `BL-019` (optional parallel story pre-generation; `BL-016` stays queued next).
3. Samy (`BL-009` check → `BL-013`) and Satwik (`BL-003` / `BL-006`) proceed in parallel tracks below.

## Team work split (conflict-free)

Pull the latest `main`, then create separate branches and stay within your owned files:

| Person | Backlog / Focus | Scope | Owned files |
|---|---|---|---|
| **Max** | `BL-019` (Parallel story pre-generation, `NFR-08`) → `BL-016` (next) | `BL-012` and `BL-001` live check passed (`implemented`). Now picking up `BL-019` (optional parallel background pre-generation of choice continuations after Part 1 streams); `BL-016` (server-side signing of plan & options) queued next. Public deploy (`BL-002`) handed off to teammate. | `src/nvidia.js`, `src/app.js`, `src/server.js`, `.env.example`, `architecture.md`, `docs/SETUP.md`, `docs/requirements/BL-019.md`, `backlog.md`, `project-status.md`, `test/app.test.js` |
| **Samy** | `BL-009` (Safety & prompt quality eval, `SR-01..SR-06`, fixing `KI-002`) | Build an evaluation suite testing no real names (`SR-01`), calm/non-punitive tone (`SR-02`, `SR-06`), age fit (`SR-04`), and refusal on worrying notes (`SR-03`); harden prompts and the offline safety check (`KI-002`). | `src/prompts.js`, `src/parse.js`, new test file(s) (e.g. `test/safety-eval.test.js`) |
| **Satwik** | `BL-003` (Parent accounts & gate: `FR-50`, `FR-52`) **or** `BL-006` (Read aloud: `FR-40`) | **Option A (Backend, unblocks `BL-004`/`BL-005`):** Build parent auth/storage and parent gate as standalone modules.<br>**Option B (Frontend, zero backend overlap):** Add read-aloud controls and mobile UI polish. | **Option A:** New `src/auth.js`, `src/db.js`, `test/auth.test.js`<br>**Option B:** `public/index.html`, `public/style.css`, `public/app.js` |

### Coordination rules
- Do not edit `src/app.js` simultaneously—wire new modules (`BL-003`) into `src/app.js` via small, sequential PRs after the standalone modules are tested.
- Coordinate any `public/app.js` changes for `BL-019` with Satwik if `BL-006` (read-aloud) is open at the same time.
- Resolve open questions #2 (age range) and #8 (whether to keep parent notes) in `docs/REQUIREMENTS.md` Section 10 before starting `BL-004` (saved stories).

## BL-009 (Samy)
Merged in PR #4 (2026-11-20), waiting for Samy's human acceptance check. Offline check: 94/94 test notes caught,
0/80 false alarms, 4/10 on unseen wordings. Story scanner, prompt fencing and the live
eval are built; the eval is tested only with a stand-in AI. Next: let the eval run on
the NVIDIA provider from BL-012 (it only drives Claude today), then BL-013.

## Open decisions
- All open questions in `docs/REQUIREMENTS.md` section 10 (name, age range, choice moments, launch markets, price, safety review, AI provider, keeping parent notes).

## Security incidents
- 2026-11-20: an NVIDIA API key was pasted into the chat of a Claude Code session
  (BL-009 kickoff). Not used, not stored, not committed. Open: the owner revokes it at
  build.nvidia.com and creates a new one; keys go only into `.env` or the host's
  secret settings.

## Gotchas
- BL-009 stuck rule (2026-11-20): three attempts to make the offline phrase list in
  `public/safety.js` both catch serious notes and avoid false alarms. Round 1 review:
  10 false alarms. Fix 1 removed them but created misses (round 2 High). Fix 2 caught
  all 44 test notes, but a fresh review of 57 new serious notes found 21 misses
  (bare family words "dad hit mummy", "he'd", threats with "kill", neglect wordings) and
  19 new false alarms ("dad beat me at chess", "mum works at the hospital"). Each round
  finds a new family of wordings: a phrase list cannot reliably recognise meaning.
  Decided by Samy: one final patch (done: all 94 + 80 sentences pass), then stop
  patching the list and do BL-013.
- `npm start` does not read `.env` (no loader), so a key in `.env` is ignored and the
  app stays offline. Still true after BL-012: `NVIDIA_API_KEY` in `.env` is ignored
  too. Fix: start with `node --env-file=.env` or load it in `src/server.js`.
  (Found in BL-009, 2026-11-20.)
- Anthropic keys cannot be stored as cloud-session secrets, so the live path could not be tested in the build session. Test it on the deployed app.
