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

### Build (2026-10-04)

Builder (sonnet), branch `ticket-107-preflight-deploy-hardening`, from origin/main 0fd6bf41. One red/green pair per behaviour, one commit per slice. Shell scripts, runbook and tests only, so no `npm run build`.

**What changed**
- **Deployment probe** (`check_github_deployments` in `deploy/bin/makam-preflight`): it sends `"ref":"<revision>"`, the bare commit SHA from the image's revision label, once. It passes when GitHub accepts it and the probe is deleted. The second probe and its obsolete `sha-` 422 diagnosis are gone. A 422 on the bare SHA is reported as GitHub's own refusal, naming the revision. The "no revision label" FAIL no longer talks about the ref `sha-`.
- **`--rilis N`** (1, 2 or 3; anything else is usage, exit 64, before any check runs). Two lines: `open release` (the env file must hold `RILIS_TERBUKA=N`) and `open release (running stack)` (`/api/health` on `127.0.0.1:<MAKAM_WEB_PORT>` must report `rilisTerbuka=N`). The stack line is a SKIP, with the reason, when the field is absent (an image from before 106) or nothing answers. Without `--rilis` one SKIP line prints the value the env file holds, or says it is unset and production then opens Rilis 1.
- **Production timers**: `check_production_timers` asks `systemctl is-enabled` for `makam-prod-db-backup`, `makam-prod-files-backup`, `makam-prod-restore-test` and `makam-prod-health` (`.timer`) and FAILs unless each says `enabled`. Only the unit names are taken from 108.
- **Pull retries**: `makam-deploy` (the timer's `:latest`, `--tag`, `--digest`, and the roll back's pull of the previous digest) and the preflight's pull try up to 3 times, 10 s then 30 s apart, then give up with the message each had before. In `makam-deploy` a retry is a `WARNING pull ... failed (try N of 3)` line in `deploy.log`; in the preflight it is a note on stderr.
- **Runbook**: the preflight section (option, table rows for the open release and the timers, the Deployment ref, the pull's tries, a paragraph on what FAILs or SKIPs before the first deploy) and step 1 of "Staging deploy".
- **Tests**: `makam-preflight.test.ts` 37 to 54 tests, `makam-deploy.test.ts` 28 to 34. The fakes gained `systemctl`, `sleep` (the backoffs are recorded, not waited for), a `/api/health` answer, and a pull that fails its first N times.

**Decisions**
1. "Retry up to 3 times, with 10 s and 30 s backoff" is read as 3 tries in all: wait 10 s after the first failure, 30 s after the second, nothing after the last. It is the only reading in which the two named backoffs are complete. A pull that always fails now costs 40 s; the deploy units' timeouts (15 and 20 min) cover it.
2. An unset `RILIS_TERBUKA` FAILs under `--rilis`, N=1 included: the criterion says FAIL when the env file lacks `RILIS_TERBUKA=N`, and the point is that unset silently means 1. The value is read as compose hands it to the app (quotes and padding removed, the last line wins).
3. The stack is read on its own port, not through nginx, so the check works before the switch. A 503 still counts (a stale worker still reports its release). The body is read with `sed` for `"rilisTerbuka":N` (no `jq` needed); the field's shape is taken from ticket 106's text.
4. Without `--rilis` the line is a SKIP, not a PASS: nothing is proven. A ready host now shows 4 SKIP lines (S3 moved to v2, open release, uptime monitor, nginx switch).
5. Only `enabled` passes a timer: `static`, `masked`, `disabled` and not installed FAIL, with the state in the line. No `is-active` check; the criterion says enabled.
6. The pull helper is written twice (`makam-deploy`, `makam-preflight`), each pointing at the other, because a shared file would mean editing `deploy/install-host.sh`, which 108 changes in the same batch.
7. Brackets: `[72, 107]` for the open release, `[64, 108]` for the timers.

**Spec gaps and decisions for the owner**
- **Rehearsal order.** Ticket 72's Rehearsal item makes the preflight the first step and says it "has no FAIL". Two lines need the running production stack: "backup and restore" (already so) and now "production timers", because 108's `install-host.sh` enables the timers only once `deployed.env` names a `MAKAM_DIGEST`. Before the first production deploy the preflight FAILs on both by design (the runbook says so). The run with no FAIL is the one after the rehearsal's deploy and before the nginx switch. I reworded neither requirement. Decide whether the Rehearsal item should say so, or whether 108 should enable the production timers before the first deploy.
- **Not verified on a host.** `systemctl is-enabled`'s output and 106's `/api/health` field are fakes in the tests (systemd's documented behaviour and ticket 106's text). Nothing here ran against real units, ghcr, GitHub or a stack.

**Counts** (read off whole logs): `npx vitest run tests/tooling/makam-preflight.test.ts tests/tooling/makam-deploy.test.ts` gives 2 files, 88 tests passed, exit 0. `npx vitest run tests/tooling/image-retention.test.ts tests/tooling/ticket-workflow.test.ts tests/tooling/makam-deploy-status.test.ts` gives 3 files, 81 tests passed, exit 0. `npm run lint` exit 0 (0 errors, the 6 existing warnings, none in these files). `npm run typecheck` exit 0.
