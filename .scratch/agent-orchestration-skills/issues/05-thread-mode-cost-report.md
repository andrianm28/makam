# 05: Thread-mode cost report, makam

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The usage report covers thread mode: the cost of each ticket from the platform's per-session cost, the coordinator's share, and its wakes by cause (watcher, report-back, hourly poll, owner), so the effect of idle mode, rotation and ticket threads can be measured week on week (the analysis's recommendation 14).

**Blocked by:** None (can start immediately).

**Status:** in progress (waits for the first weekly report, about 2026-10-10)

- [ ] Given the coordinator's session and its child sessions, the report lists each thread's role, ticket and cost, the total per ticket, and the coordinator's cost split by wake cause.
- [x] It runs on saved session records (for tests) and against the platform when available.
- [ ] The manual's Token discipline section shows how to run it and records the first week's numbers.

## Comments

- 2026-10-03, build (sonnet builder), head 9632465: `scripts/agents/thread-cost-report.py` + Vitest file `thread-cost-report.test.ts` (7 tests) + fixtures + manual bullets.
- 2026-10-03, **first review, Standards** (head 9632465): blocking 0, should-fix 2, nit 3. S1 wake vocabulary (wake, watcher, report-back, hourly-poll) is not in CONTEXT.md; S2 compare path with `usd` None is untested (works by luck). Nits: main(argv) style vs neighbour; W_* constants duplicate usage-report.py; long line at :201.
- 2026-10-03, **first review, Spec** (head 9632465): blocking 0, should-fix 1, nit 2. P1 `--since/--until` window threads and wakes but the coordinator `cost_usd` is cumulative, so windowed USD split and Total mix cumulative and windowed figures, which breaks the week-on-week compare. Nits: `\b\d+\b` ticket fallback matches any number in a title; rec. 14's "registry from `list_sessions`" is not in the ACs.

### Spec gaps and decisions for the owner

- **"Against the platform when available" cannot be met from a script.** The platform's per-session cost (`cost_usd`, `status_bucket`) is reachable only through the session tools (`get_session`, `list_sessions`), which a Python script cannot call, and the repo has no platform credential for a REST call. The script therefore reads a plain JSON file that a coordinator saves from `get_session`/`list_sessions` (documented in the docstring and the manual); the criterion is not narrowed, it needs an owner decision on a credentialed fetch.
- **First week's numbers (AC3)**: none exist yet (idle mode and rotation have not run for a week); the manual carries a placeholder line and no invented figures. To be filled in after the first real run.
- 2026-10-03, **fix pass** (fresh sonnet builder, cc6f6a4..81ccde4): P1 windowed coordinator cost via `cost_usd_at_window_start` (without it the figure is labelled cumulative and `--compare` skips it), S2 compare without coordinator cost, ticket fallback regex. S1 declined: the wake terms are orchestration vocabulary defined in `docs/agents/orchestration.md`; CONTEXT.md is the product domain.
- 2026-10-03, **re-review** (fresh two-axis, head 81ccde4). Spec: earlier findings P1, S2, regex nit all OK item by item, S1 decline judged reasonable; 0 blocking, 0 should-fix, 1 nit (an unwindowed run with no coordinator `cost_usd` counts 0 without a flag, so `--compare` shows a misleading total delta). Standards: 0 blocking, 3 should-fix, 2 nit. The three should-fix are history only, in already-pushed commits: 936f139 `test(red)` carries three behaviours at once (horizontal slice), e873cb9 edits two red tests to pass, bf6b5c4 is a test-only commit titled "fix:". The code is not in question. Nits: duplicated USD-nulling in `compare()`; "cumulative" label on a coordinator with no cost at all.

**Decision for the owner**: the Standards should-fix items concern commit history and cannot be fixed without rewriting a pushed branch; I left the branch as is. Accept at merge, or ask for a rebuilt history. The two nits above are unfixed by choice.

### Owner decisions (relayed by the coordinator, 2026-10-03 ~15:14Z, option tool)

1. **Platform data**: the coordinator saves `get_session`/`list_sessions` output to a JSON file each week and the script reads it; no credential goes into the repo or the environment. The owner counts this export as meeting "against the platform when available", so that criterion is ticked and the spec gap above is closed by this decision.
2. **First week's numbers**: merge now. The ticket stays in progress until the coordinator runs the first weekly report (around 2026-10-10) and records the numbers in the manual's Token discipline section; the placeholder line stays until then. The third criterion is therefore still open.
3. **History**: the horizontal red slice in 936f139 (and the two related commits listed in the re-review) is accepted as is; history is not rewritten.
