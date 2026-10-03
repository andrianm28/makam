# 05: Thread-mode cost report, makam

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The usage report covers thread mode: the cost of each ticket from the platform's per-session cost, the coordinator's share, and its wakes by cause (watcher, report-back, hourly poll, owner), so the effect of idle mode, rotation and ticket threads can be measured week on week (the analysis's recommendation 14).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Given the coordinator's session and its child sessions, the report lists each thread's role, ticket and cost, the total per ticket, and the coordinator's cost split by wake cause.
- [ ] It runs on saved session records (for tests) and against the platform when available.
- [ ] The manual's Token discipline section shows how to run it and records the first week's numbers.

## Comments
