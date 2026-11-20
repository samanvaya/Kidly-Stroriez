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

## Design

## Build

## Testing
- Keep a held-out set when tuning a phrase list or prompt: the safety regex scored
  29/29 on the notes it was written against but 2/10 on fresh ones. (2026-11-20)
- Run every eval harness against a "perfect answers" and a "useless answers" stand-in
  before any paid run; it proves the grader can both pass and fail. (2026-11-20)
- Take full-page screenshots at phone size and check `scrollWidth`; a hidden radio input
  without a positioned parent made the page scroll sideways. (2026-11-20)
- Any CSS `display` rule on an element overrides the `hidden` attribute; keep the
  `[hidden] { display: none !important; }` rule. (2026-11-20)

## Review
- A fallback path must not skip a safety check: the offline story was shown whenever
  the live plan failed, including on worrying notes. Fall back only on a clear
  "offline" signal and run the safety check on every path. (2026-11-20)

## Deploy

## Process
<!-- Lessons about the workflow itself, worth carrying into the next project. -->
- The itero-skills plugins cannot be installed with /plugin in cloud sessions; the skills are synced to the account, so invoke them directly and read reference files from a read-only clone of the repo. (2026-11-20)
