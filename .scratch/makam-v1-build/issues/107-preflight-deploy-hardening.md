# Preflight and deploy hardening for the first production deploy

Status: ready-for-agent
Blocked by: none (pairs with 108; blocks the rehearsal, 72)
Spec: ticket 72 (rehearsal: a preflight with no FAIL); `docs/ops/runbook.md` "Production preflight"; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

Since ticket 102, `makam-deploy-status` sends the bare commit SHA as the Deployment `ref`. `deploy/bin/makam-preflight` (~550) still probes with `sha-<rev>` first. When GitHub accepts the bare SHA it reports a FAIL anyway, with the old diagnosis: a false FAIL, while the rehearsal requires no FAIL.

The preflight also never checks two things:
- **The open release.** `RILIS_TERBUKA`: production opens 1 at the switch and 3 later (owner decision 2026-10-04, ADR 0006 amendment). An unset value silently means 1.
- **The production timers from ticket 108.**

Separately, ghcr pulls fail now and then with a TLS handshake timeout (six times on 2026-10-03), which costs a whole timer cycle.

## Acceptance criteria

- [ ] **Deployment probe:** sends the bare revision as `ref` and passes when GitHub accepts it and the probe is deleted. The obsolete `sha-` 422 diagnosis is removed.
- [ ] **`makam-preflight --rilis N`:** FAIL when the env file lacks `RILIS_TERBUKA=N`, or when the running stack's `/api/health` reports a different `rilisTerbuka` (field added by 106; SKIP with a clear line when the field is absent or the stack is down). Without `--rilis` it prints the value it found.
- [ ] **Production timers:** a preflight line FAILs unless the four `makam-prod-*` timers from 108 (db-backup, files-backup, restore-test, health) are enabled.
- [ ] **Pull retries:** `deploy/bin/makam-deploy` (the normal pull and the roll-back pull) and the preflight's pull retry up to 3 times, with 10 s and 30 s backoff, before giving up with the same message as today.
- [ ] **Tests:** `tests/tooling/makam-preflight.test.ts` and `tests/tooling/makam-deploy.test.ts`. The runbook preflight table is updated.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB1). Not money code. Use the same unit names as 108.
- 2026-10-04 (builder): Done, all five ACs. Probe sends the bare revision and the `sha-` 422 branch is gone (a 422 fails generically). `--rilis N` adds an "open release" line [72]: FAIL on env mismatch or a different `rilisTerbuka` on `/api/health` (127.0.0.1:MAKAM_WEB_PORT), SKIP when the field is absent or the stack is unreachable; without the flag it is a PASS printing the value (unset means 1), so the ready-host SKIP count stays 3. A "production timers" line FAILs naming timers not enabled. Pull retries (3 attempts, `MAKAM_PULL_BACKOFF="10 30"`, tests pass "0 0") in `makam-deploy` pull and roll-back pull and in the preflight. Runbook table updated. Spec gap: none. One test greps the script for the default `10 30` because waiting 40 s in a test is not worth it.
- 2026-10-04 (review, Standards + Spec, sonnet): Spec 0 blocking / 0 should / 2 nit. Standards 0 blocking / 1 should / 3 nit. Should-fix: red commit 8c5063b batches the pull-retry tests of makam-deploy and the preflight in one red commit; accepted as is, since the branch is already pushed and splitting means rewriting history (the commit order is valid: red first, then green). Nits left as they are: duplicated `pull_retry` in the two standalone scripts, the one-line nested `case` validating `--rilis`, and the test that greps the default `10 30`. No fix pass, so no re-review. Tests 81/81, lint and typecheck 0, TDD-order pass (no commit touches the checked paths; every code commit follows a `test(red)`).
