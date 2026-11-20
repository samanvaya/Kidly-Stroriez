# BL-015: NVIDIA Nemotron as the AI provider - implementation plan

## Goal
The app and the safety eval run live on NVIDIA Nemotron Ultra, with Claude still
available by setting `AI_PROVIDER=anthropic`.

## Approach
Add a small adapter (`src/nvidia.js`) that talks to NVIDIA's OpenAI-compatible
streaming API but looks to the rest of the app exactly like the Anthropic client calls
it already makes. A tiny `src/ai.js` picks the provider from settings. Prompts, parsing,
plan signing, safety checks and the eval logic do not change.

## Files
- `src/nvidia.js` - new - NVIDIA adapter (streaming, reasoning removal, error mapping)
- `src/ai.js` - new - provider switch
- `src/app.js` - modified - get the client from `src/ai.js` (about 3 lines)
- `src/server.js` - modified - load `.env`, log the live provider
- `eval/run.js` - modified - use `src/ai.js` for the app and the judge; NVIDIA not priced
- `test/nvidia.test.js` - new - BL-015-T01 to T07
- `.env.example`, `docs/SETUP.md`, `architecture.md`, `README.md`, `backlog.md`,
  `project-status.md`, `learnings.md`, `docs/evidence/BL-015.md`

## New dependencies
None. Node's built-in `fetch` and streams.

## Steps
1. Adapter with a fake-fetch test suite (T02-T05).
2. Provider switch (T01) and `.env` loading (T07).
3. Wire into `src/app.js`, `src/server.js` and `eval/run.js`; T06 through the real routes.
4. verify.sh green; probe 2-3 tests; PR; review rounds 1 and 2.
5. With a new key in the secure form: one live smoke test (one plan, one story part,
   very few credits). Then, only with your OK, the eval on Nemotron
   (21 cases; uses trial credits, no money).

## Automated tests
- T01: the wrong provider chosen, or live mode without a key.
- T02: a wrong URL, header, model or field (e.g. sending Anthropic-only fields).
- T03: text lost or duplicated when the stream arrives in odd chunks.
- T04: the model's reasoning shown to the child.
- T05: an API error or broken stream hidden as an empty story.
- T06: the adapter not fitting the real routes.
- T07: `.env` overriding real environment settings.

## Human acceptance test
See `docs/requirements/BL-015.md` section 10.

## Architecture impact
ADR-006: switchable AI provider, NVIDIA Nemotron by default. ADR-004 (AI on the server,
Anthropic) remains true for the Anthropic path.

## Risks
- The safety prompts were written and reviewed for Claude. Nemotron may follow them
  less well (names, tone, the `safe:false` verdict, the `@@@` marker). Only the eval on
  Nemotron can show this; until then live mode on Nemotron is untested for safety.
- Nemotron has no automatic safety fallback like Claude's.
- `reasoning_effort: none` keeps stories fast; if story quality is poor we can try
  `medium` (slower first words, NFR-01).
- Trial credits are limited; the eval uses 21 x ~5 calls.

## Out of scope
- Prompt tuning for Nemotron (after the first eval run).
- Deploy (BL-002), BL-012, BL-013, BL-014.

---
Approved by user: [ ] on YYYY-MM-DD
