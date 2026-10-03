# 05: Thread-mode cost report, makam

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The usage report covers thread mode: the cost of each ticket from the platform's per-session cost, the coordinator's share, and its wakes by cause (watcher, report-back, hourly poll, owner), so the effect of idle mode, rotation and ticket threads can be measured week on week (the analysis's recommendation 14).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Given the coordinator's session and its child sessions, the report lists each thread's role, ticket and cost, the total per ticket, and the coordinator's cost split by wake cause.
- [ ] It runs on saved session records (for tests) and against the platform when available.
- [ ] The manual's Token discipline section shows how to run it and records the first week's numbers.

## Comments

- 2026-10-03, build (sonnet builder), head 9632465: `scripts/agents/thread-cost-report.py` + Vitest file `thread-cost-report.test.ts` (7 tests) + fixtures + manual bullets.
- 2026-10-03, **first review, Standards** (head 9632465): blocking 0, should-fix 2, nit 3. S1 wake vocabulary (wake, watcher, report-back, hourly-poll) is not in CONTEXT.md; S2 compare path with `usd` None is untested (works by luck). Nits: main(argv) style vs neighbour; W_* constants duplicate usage-report.py; long line at :201.
- 2026-10-03, **first review, Spec** (head 9632465): blocking 0, should-fix 1, nit 2. P1 `--since/--until` window threads and wakes but the coordinator `cost_usd` is cumulative, so windowed USD split and Total mix cumulative and windowed figures, which breaks the week-on-week compare. Nits: `\b\d+\b` ticket fallback matches any number in a title; rec. 14's "registry from `list_sessions`" is not in the ACs.

### Spec gaps and decisions for the owner

- **"Against the platform when available" cannot be met from a script.** The platform's per-session cost (`cost_usd`, `status_bucket`) is reachable only through the session tools (`get_session`, `list_sessions`), which a Python script cannot call, and the repo has no platform credential for a REST call. The script therefore reads a plain JSON file that a coordinator saves from `get_session`/`list_sessions` (documented in the docstring and the manual); the criterion is not narrowed, it needs an owner decision on a credentialed fetch.
- **First week's numbers (AC3)**: none exist yet (idle mode and rotation have not run for a week); the manual carries a placeholder line and no invented figures. To be filled in after the first real run.
