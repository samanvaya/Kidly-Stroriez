# Architecture

## Stack
- **Node.js 20+ with Express 5** serves the page and two API routes. One language
  (JavaScript) end to end, so a non-developer team can run it with `npm start`.
- **Plain HTML, CSS and JavaScript** in `public/`, no build step. Mobile-first web app.
- **Anthropic SDK** (`@anthropic-ai/sdk`, pinned) and **NVIDIA NIM** (built-in `fetch`, OpenAI-compatible) call AI models from the server only.
- **Tests:** Node's built-in test runner (`node --test`), no extra dependency.

## Structure
```
src/server.js    starts the server (PORT, default 3000)
src/app.js       routes: GET /api/config, POST /api/plan, POST /api/story; provider resolution
src/nvidia.js    NVIDIA NIM Chat Completions & SSE stream adapter (Nemotron Ultra)
src/prompts.js   system prompt, plan and story-part prompts, hero list
src/parse.js     JSON extraction, plan normalising, stream marker splitter
public/          index.html, style.css, app.js (client), fallback.js (offline story)
test/            unit and API tests (fake Claude client & mocked NVIDIA fetch)
```

## How a story flows
1. `POST /api/plan` with age, hero and the parent's notes returns a plan JSON
   (theme, lesson, setting, echo, two choice moments) or `{safe:false, message}` (SR-03).
2. The parent approves; only then does the client call `POST /api/story`, which
   rejects requests without `approved: true` (FR-13, SR-05).
3. Each of the 3 parts streams as NDJSON: `text` lines, then `options` (parts 1-2) or
   `end` with lesson and parent questions (part 3). The model ends the prose with a
   `@@@` line followed by JSON; the server hides that and parses it.
4. If the server has no key (503) or there is no network, the client runs the built-in
   story in `public/fallback.js` (NFR-02), after a keyword safety check on the notes.
   Any other failure shows an error with "Try again", never the offline story.
5. The server signs each plan it writes (HMAC over plan + notes); `/api/story` only
   accepts a plan with a valid signature, so the approval step cannot be skipped.
6. Per-visitor rate limit (in memory) and `max_tokens` (`4000` Anthropic / `8192` NVIDIA) cap the cost of a public URL.
7. If a server-side safety fallback switches models mid-part, the server sends `reset`
   and the client clears that part before the new text arrives.

## Evaluation (BL-009)
Two layers, both in the repo:
- **Free checks in `./scripts/verify.sh`:** the prompts state every safety rule and
  fence the parent's text in `<notes>`/`<change>` tags (angle brackets stripped);
  `public/safety.js` is the offline worrying-notes check, tested on invented notes in
  `test/safety-cases.js`; `storyIssues` in `src/parse.js` finds banned labels and
  copied names.
- **Paid live eval, opt-in (`npm run eval`):** `eval/run.js` starts the real app
  (`createApp`) with the same AI provider the app would use (`resolveProvider`: NVIDIA
  or Claude, BL-018) wrapped to record every call, plays the 21
  invented days in `eval/cases.json` through `/api/plan` and `/api/story`, and grades
  them with code checks (`eval/grade.js`) and a Claude judge (`eval/rubric.md`).
  Without `--yes` it only prints the estimated cost. `--dry-run` uses a stand-in AI
  (reference answers; `=null` gives useless answers and must fail). Results go to
  `eval/results/` (git-ignored), a summary to `docs/evidence/BL-009.md`.

## Cost
Rough estimate: a story is 1 plan + 3 parts, about 4 x 1.5k input and 4 x ~400 output
tokens plus thinking at low effort. On claude-opus-5-5 ($4 / $20 per million tokens)
that is roughly 5 to 6 US cents per story; switching `CLAUDE_MODEL` to
claude-haiku-5-5 brings it well under 1 cent. Hosting: free tier is enough for a demo.

## Decision log (ADR)
- **ADR-001 (2026-11-20) Mobile web app, not native.** Fastest path for a 2-hour demo;
  can be wrapped for the stores later.
- **ADR-002 (2026-11-20) No accounts and no storage in the demo.** Stories live in the
  browser tab only. Accounts (FR-50) and saved stories (FR-51) are BL-003/BL-004.
- **ADR-003 (2026-11-20) The child's name never leaves the device.** The hero stands in
  for the child, so no real name can reach the model or a story (SR-01, NFR-03).
- **ADR-004 (2026-11-20) AI calls only on the server** (NFR-06). Model and effort are
  environment settings. Server-side refusal fallback (`fallbacks: "default"`) is on.
- **ADR-005 (2026-11-20) Plain JS, no build step, no framework.** Fewer moving parts
  for a team without a developer; revisit when the UI grows (accounts, history).
- **ADR-006 (2026-11-20) Multi-provider server adapter (Anthropic + NVIDIA NIM).**
  `src/nvidia.js` adds OpenAI-compatible support for `nvidia/nemotron-3-ultra-550b-a55b`
  using Node's built-in `fetch` (no new dependencies), selected via `AI_PROVIDER` /
  `NVIDIA_API_KEY` / `ANTHROPIC_API_KEY` on the server only (preserving ADR-003/ADR-004).
