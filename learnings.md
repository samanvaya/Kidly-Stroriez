# Learnings

What made work slower, more expensive or buggier here, and what to do instead.
Read the section for what you are about to do, by heading; never the whole file when
one section is enough. Written at the end of every phase, run, checkpoint and
handover. See references/learnings.md in the max-coding-workflow skill.

<!--
One entry: an instruction, the reason, the date.
- Run the e2e tests with `--workers=1`; two specs share the demo user and fail in
  parallel. (YYYY-MM-DD)
At most three new entries per run. Merge instead of appending. Keep the file below
about 8 KB: delete what no longer applies before adding. A trap that can hit in any
turn belongs in AGENTS.md instead. No secrets or personal data.
-->

## Planning
- Query the provider's live `/v1/models` endpoint instead of guessing model IDs; NVIDIA NIM's Nemotron Ultra ID is `nvidia/nemotron-3-ultra-550b-a55b`. (2026-11-20)

## Design

## Build

## Testing
- Take full-page screenshots at phone size and check `scrollWidth`; a hidden radio input
  without a positioned parent made the page scroll sideways. (2026-11-20)
- Any CSS `display` rule on an element overrides the `hidden` attribute; keep the
  `[hidden] { display: none !important; }` rule. (2026-11-20)

## Review
- A fallback path must not skip a safety check: the offline story was shown whenever
  the live plan failed, including on worrying notes. Fall back only on a clear
  "offline" signal and run the safety check on every path. (2026-11-20)
- Validate configurable external base URLs (`https://` only except loopback) and set `redirect: "error"` on `fetch` so Bearer keys, system prompts, and user notes cannot leak via HTTP or 307/308 redirects. (2026-11-20)

## Deploy

## Process
<!-- Lessons about the workflow itself, worth carrying into the next project. -->
- The itero-skills plugins cannot be installed with /plugin in cloud sessions; the skills are synced to the account, so invoke them directly and read reference files from a read-only clone of the repo. (2026-11-20)
