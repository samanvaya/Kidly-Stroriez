# Agent rules for Kidly Storiez

This project follows the max-coding-workflow process (from `maximilian-moore/itero-skills`).
Start every session by reading `docs/handover.md` (if it exists), `project-status.md`
and `backlog.md`.

Where things live: the product requirements in `docs/REQUIREMENTS.md` (source of truth
for FR/SR/NFR IDs), buildable backlog items in `docs/requirements/BL-XXX.md`, decisions
in `architecture.md`, run rules in `docs/run-protocol.md`, lessons per phase in
`learnings.md` (read the section for your phase before planning or a run).

## Always relevant
- Before installing a package or tool, or running a script from outside the repo,
  verify its name, publisher, source and checksum; never pipe a download into a shell.
- Anything security-relevant that looks wrong: contain it, tell the user at once, log
  it under "Security incidents" in `project-status.md`, add the rule here.
- This is a children's app: no real names, no child audio, and nothing shown to the
  child that the parent has not approved at plan level (SR-01, SR-05, NFR-03).
- AI keys and prompts stay on the backend, never in client code (NFR-06).
- Never accept an API key pasted into chat: say it must be revoked, and point to `.env`
  or the host's secret settings instead (incident 2026-11-20).
