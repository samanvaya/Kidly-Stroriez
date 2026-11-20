# Project status

Last updated: 2026-11-20
Last merged: BL-012 - Support NVIDIA Nemotron Ultra AI provider (PR #5)

## Active work
- **Max:** `BL-012` (NVIDIA Nemotron Ultra support) is merged and waiting for Max's live human acceptance check (`docs/requirements/BL-012.md` & `docs/requirements/BL-001.md`), then moving to `BL-002` (Deploy).

## Where we are
`BL-001` (hackathon demo) and `BL-012` (NVIDIA Nemotron Ultra backend adapter) are merged to `main`. The app runs with `NVIDIA_API_KEY`, `ANTHROPIC_API_KEY`, or the built-in offline story, and all 26 unit/integration tests pass with fake/mocked clients.

## Next step
1. Max runs the live human acceptance test in `docs/requirements/BL-012.md` and `docs/requirements/BL-001.md` locally with a fresh `NVIDIA_API_KEY` in `.env`.
2. Plan and deploy `BL-002` with `NVIDIA_API_KEY` (or `ANTHROPIC_API_KEY`) and `PLAN_SECRET` set on the host.
3. Samy (`BL-009`) and Satwik (`BL-003` or `BL-006`) proceed in parallel tracks below.

## Team work split (conflict-free)

Pull the latest `main`, then create separate branches and stay within your owned files:

| Person | Backlog / Focus | Scope | Owned files |
|---|---|---|---|
| **Max** | `BL-012` (Nemotron provider) → `BL-001` acceptance + `BL-002` (Deploy & live verification) | Add NVIDIA NIM (`nvidia/nemotron-3-ultra-550b-a55b`) support (`BL-012`), deploy to a public URL with `NVIDIA_API_KEY` / `ANTHROPIC_API_KEY` and persistent `PLAN_SECRET` (resolves `KI-001`, `KI-003`), and run the 10-step human acceptance test in `docs/requirements/BL-001.md` on a phone. | `src/nvidia.js`, `src/app.js`, `src/server.js`, `.env.example`, `architecture.md`, `docs/SETUP.md`, `backlog.md`, `project-status.md`, `test/app.test.js` |
| **Samy** | `BL-009` (Safety & prompt quality eval, `SR-01..SR-06`, fixing `KI-002`) | Build an evaluation suite testing no real names (`SR-01`), calm/non-punitive tone (`SR-02`, `SR-06`), age fit (`SR-04`), and refusal on worrying notes (`SR-03`); harden prompts and the offline safety check (`KI-002`). | `src/prompts.js`, `src/parse.js`, new test file(s) (e.g. `test/safety-eval.test.js`) |
| **Satwik** | `BL-003` (Parent accounts & gate: `FR-50`, `FR-52`) **or** `BL-006` (Read aloud: `FR-40`) | **Option A (Backend, unblocks `BL-004`/`BL-005`):** Build parent auth/storage and parent gate as standalone modules.<br>**Option B (Frontend, zero backend overlap):** Add read-aloud controls and mobile UI polish. | **Option A:** New `src/auth.js`, `src/db.js`, `test/auth.test.js`<br>**Option B:** `public/index.html`, `public/style.css`, `public/app.js` |

### Coordination rules
- Do not edit `src/app.js` simultaneously—wire new modules (`BL-003`) into `src/app.js` via small, sequential PRs after the standalone modules are tested.
- Resolve open questions #2 (age range) and #8 (whether to keep parent notes) in `docs/REQUIREMENTS.md` Section 10 before starting `BL-004` (saved stories).

## Open decisions
- All open questions in `docs/REQUIREMENTS.md` section 10 (name, age range, choice moments, launch markets, price, safety review, AI provider, keeping parent notes).

## Security incidents
- None recorded.

## Gotchas
- Anthropic keys cannot be stored as cloud-session secrets, so the live path could not be tested in the build session. Test it on the deployed app.
