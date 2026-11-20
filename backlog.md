# Backlog

States: idea, draft, ready, implementation, implemented, cancelled.
Requirement IDs (FR/SR/NFR) refer to `docs/REQUIREMENTS.md`.

| ID | Title | Covers | Value | Effort | Status | Blocked by |
|---|---|---|---|---|---|---|
| BL-001 | Hackathon demo: day to plan to interactive story | All Must items, FR-05, FR-14, FR-25-29, FR-32 | High | M | implementation | - |
| BL-002 | Deploy the demo to a public URL with the API key | NFR-01, NFR-06 | High | S | draft | BL-001 |
| BL-003 | Parent accounts and parent gate | FR-50, FR-52 | High | L | idea | - |
| BL-004 | Save and re-read stories | FR-51, FR-53, NFR-03 | High | M | idea | BL-003 |
| BL-005 | Recurring cast across stories | FR-31, FR-33, FR-34 | Medium | M | idea | BL-004 |
| BL-006 | Read aloud | FR-40 | Medium | M | idea | - |
| BL-007 | Illustrations with consistent characters | FR-41 | Medium | L | idea | - |
| BL-008 | Voice dictation for the parent | FR-04 | Low | S | idea | - |
| BL-009 | Safety and quality evaluation set for prompts | SR-01..SR-06 | High | M | idea | - |
| BL-010 | Pricing, free tier and paid plan | FR-60..FR-63 | Medium | L | idea | open question 5 |
| BL-011 | Compliance review for children's apps per market | NFR-04 | High | M | idea | open question 4 |
| BL-012 | Support NVIDIA Nemotron Ultra AI provider | Open question 7, NFR-01, NFR-06 | High | S | ready | - |

## Next up
1. BL-012 - add NVIDIA Nemotron Ultra support (Max)
2. BL-001 - finish the demo check (human acceptance test in `docs/requirements/BL-001.md`)
3. BL-002 - deploy for the demo
4. BL-004 - saved stories (asked for by the team after the demo)

## Known issues
- KI-001 (BL-001): the live AI path is untested against the real API in this session
  (no key available here). Test it before the demo; the offline story covers outages.
- KI-002 (BL-001): the offline safety check is a keyword list, so it can miss worrying
  notes worded differently. Live mode uses the model's judgement. Fix in BL-009.
- KI-003 (BL-001): the plan-signing secret is random per server start unless
  PLAN_SECRET is set; a restart mid-story asks the parent to make the plan again.
