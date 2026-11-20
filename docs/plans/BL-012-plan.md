# BL-012: Support NVIDIA Nemotron Ultra AI provider - implementation plan

## Goal
The Kidly Storiez backend can generate story plans and stream interactive stories via NVIDIA NIM (`nvidia/nemotron-3-ultra-550b-a55b`) when `NVIDIA_API_KEY` is configured, while keeping Anthropic Claude and offline fallback working unchanged.

## Approach
Add a zero-dependency OpenAI-compatible NVIDIA NIM adapter (`src/nvidia.js`) using Node's built-in `fetch`, and unify provider selection behind `resolveProvider(env)` and a `{ label, plan, streamStory }` provider contract in `src/app.js`. Explicit `provider` or `client` arguments (including `client: null`) always override env vars so all existing `BL-001` tests stay isolated, while `src/server.js` reuses `resolveProvider` to print the active mode.

## Files
- `src/nvidia.js` - new - `createNvidiaProvider` for `/chat/completions` (`plan` + SSE `streamStory`), ignoring `reasoning_content` and `null` deltas, enforcing `timeoutMs` idle timeout and `AbortSignal`, and mapping `content_filter`/`refusal`/`length`.
- `src/app.js` - modified - export `resolveProvider(env)`, wrap Anthropic in the same provider contract, wire `AbortController` on `!res.writableEnded` close, and suppress `splitter.flush()` on refusal.
- `src/server.js` - modified - reuse `resolveProvider(process.env).label` in startup log.
- `.env.example` - modified - add `AI_PROVIDER`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `NVIDIA_BASE_URL` placeholders.
- `docs/SETUP.md` - modified - document `NVIDIA_API_KEY` (`build.nvidia.com`) and `AI_PROVIDER` selection.
- `architecture.md` - modified - add ADR-006 documenting the multi-provider server adapter.
- `test/app.test.js` - modified - add `BL-012-T01` through `BL-012-T05` using an injected mock `fetchImpl`.

## New dependencies
None. Uses Node 20+ built-in `fetch`.

## Steps
1. Create `src/nvidia.js` implementing `createNvidiaProvider` (`plan` + SSE `streamStory` with `TextDecoder` chunk buffering, `reasoning_content`/`null` filtering, idle `timeoutMs`, and `AbortController`).
2. Update `src/app.js` to export `resolveProvider(env)` and support `{ client, provider, env, limit }`, wrapping Anthropic in the same provider interface and wiring request-abort + refusal safety guards.
3. Update `src/server.js` to log `resolveProvider(process.env).label`.
4. Add `BL-012-T01` through `BL-012-T05` in `test/app.test.js`.
5. Update `.env.example`, `docs/SETUP.md`, and `architecture.md` (ADR-006).
6. Run `scripts/verify.sh`, probe new tests per `references/testing.md`, run 2 independent review rounds, fix any findings, and open the PR.

## Automated tests
- `BL-012-T01`: `/api/plan` with mocked `fetchImpl` sends `Bearer` auth and `nvidia/nemotron-3-ultra-550b-a55b`, omits child's name, and returns signed plan.
- `BL-012-T02`: `/api/story` stitches split CRLF SSE chunks, ignores `reasoning_content` and `null` deltas, strips `@@@`, and streams NDJSON `text` + `options`.
- `BL-012-T03`: upstream HTTP 500 and `finish_reason: "length"` map to `502` / `unavailable`; `content_filter`/`refusal` maps to safe refusal on `/api/plan` and `refused` error on `/api/story` without flushing `options`/`end`.
- `BL-012-T04`: `resolveProvider` & `createApp` handle `AI_PROVIDER` (`auto`, `nvidia`, `anthropic`, invalid, blanks), `NVIDIA_BASE_URL` trailing slash, and `client: null` overriding env vars.
- `BL-012-T05`: client disconnect aborts upstream `fetch`, and idle `timeoutMs` aborts stalled calls.

## Human acceptance test
1. Copy `.env.example` to `.env`, add your `NVIDIA_API_KEY`, and run `npm start`.
2. Confirm the terminal prints `live (NVIDIA Nemotron)`.
3. Open `http://localhost:3000`, enter name, age, hero, and a note from the day, and tap `Make a story plan`.
4. Confirm a plan appears without real names, approve it, and complete both choices to the ending.

## Architecture impact
Adds ADR-006 in `architecture.md`: backend supports an OpenAI-compatible NVIDIA NIM adapter (`src/nvidia.js`) via built-in `fetch` alongside `@anthropic-ai/sdk`, preserving ADR-003 (no child names sent) and ADR-004 (all AI calls and keys stay on the server).

## Risks
- Nemotron Ultra is a large reasoning model; first-token latency (`NFR-01` 3-second target) and adherence to the `@@@` marker format should be confirmed against the live API during your human acceptance test.
- Unlike Anthropic's `server-side-fallback` beta, NVIDIA NIM does not auto-switch models on refusal; `content_filter`/`refusal` maps to a safe refusal message.

## Out of scope
- Prompt tuning per model or safety evaluation benchmarks (`BL-009`).
- Public deployment (`BL-002`) and frontend UI changes (`public/`).

---
Approved by user: [ ] on 2026-11-20
