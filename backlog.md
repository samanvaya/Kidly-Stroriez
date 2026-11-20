# Backlog

States: idea, draft, ready, implementation, implemented, cancelled.
Requirement IDs (FR/SR/NFR) refer to `docs/REQUIREMENTS.md`.

| ID | Title | Covers | Value | Effort | Status | Blocked by |
|---|---|---|---|---|---|---|
| BL-001 | Hackathon demo: day to plan to interactive story | All Must items, FR-05, FR-14, FR-25-29, FR-32 | High | M | implementation | - |
| BL-002 | Deploy the demo to a public URL with the API key | NFR-01, NFR-06 | High | S | draft | BL-001 |
| BL-003 | Parent accounts and parent gate | FR-50, FR-52 | High | L | idea | - |
| BL-004 | Story library: save, view and re-read created stories | FR-51, FR-53, NFR-03 | High | M | idea | BL-003 |
| BL-005 | Recurring cast across stories | FR-31, FR-33, FR-34 | Medium | M | idea | BL-004 |
| BL-006 | Read aloud | FR-40 | Medium | M | idea | - |
| BL-007 | Illustrations with consistent characters | FR-41 | Medium | L | idea | - |
| BL-008 | Voice dictation for the parent | FR-04 | Low | S | idea | - |
| BL-009 | Safety and quality evaluation set for prompts | SR-01..SR-06, KI-002 | High | M | implementation (merged, waiting for user check) | - |
| BL-010 | Pricing, free tier and paid plan | FR-60..FR-63 | Medium | L | idea | open question 5 |
| BL-011 | Compliance review for children's apps per market | NFR-04 | High | M | idea | open question 4 |
| BL-012 | Support NVIDIA Nemotron Ultra AI provider | Open question 7, NFR-01, NFR-06 | High | S | implementation (merged, waiting for user check) | - |
| BL-013 | Sturdier offline safety check (e.g. a yes/no question to the parent); next after BL-009 per Samy | SR-03, KI-002 | High | S | idea | - |
| BL-014 | Check finished stories with `storyIssues` before the child sees them | SR-01, SR-02 | Medium | S | idea | BL-009 |
| BL-015 | (cancelled) NVIDIA provider from Samy's side: duplicate of BL-012, which Max shipped in PR #5 | - | - | - | cancelled | - |
| BL-016 | Sign the previous plan and the offered options server-side (story history and change requests cannot be edited by the browser) | SR-05, NFR-06 | High | S | idea | - |
| BL-018 | Share library stories via link (add to recipient's library) | FR-54 | Medium | M | idea | BL-004 |
| BL-019 | Optional parallel pre-generation of all story choice continuations | NFR-01, NFR-08, FR-23, FR-26 | High | M | idea | - |

## Next up
1. BL-012 & BL-001 - run live human acceptance test (`docs/requirements/BL-012.md` & `docs/requirements/BL-001.md`) with `NVIDIA_API_KEY` in `.env`
2. BL-002 - deploy for the demo
3. BL-004 - saved stories (asked for by the team after the demo)
4. BL-013 - wording-independent offline safety check (Samy, after BL-009)

## Known issues
- KI-001 (BL-001): the live AI path is untested against the real API in this session
  (no key available here). Test it before the demo; the offline story covers outages.
- KI-002 (BL-001): the offline safety check is a phrase list. BL-009 widened it (all
  94 test notes caught, 0 of 80 false alarms), but only 4 of 10 unseen wordings
  (docs/evidence/BL-009.md). Needs a sturdier design, see BL-013.
- KI-003 (BL-001): the plan-signing secret is random per server start unless
  PLAN_SECRET is set; a restart mid-story asks the parent to make the plan again.
