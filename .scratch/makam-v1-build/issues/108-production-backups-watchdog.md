# Production backups, restore test and health watchdog

Status: ready-for-agent
Blocked by: none (go-live blocker by owner decision 2026-10-04)
Spec: ticket 64 (backups of makam-staging and makam-prod); `docs/ops/runbook.md` "Backups", "Uptime alarm"; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

`deploy/systemd` has backup, restore-test and health units for staging only. For production it has only `makam-prod-deploy.*`, and `deploy/install-host.sh` enables only the staging timers. Production uploads would have no backup at all. Ticket 64 promised makam-prod backups and was counted as a cleared go-live gate. The owner made production backups a go-live blocker (2026-10-04).

## Acceptance criteria

- [ ] **Units:** `deploy/systemd/makam-prod-db-backup.{service,timer}`, `makam-prod-files-backup.*`, `makam-prod-restore-test.*` and `makam-prod-health.*` mirror the staging units with `--env prod`.
  - Same hardening as the staging units.
  - Times do not overlap staging's: DB around 01:15 WIB, files around 01:45, restore test Monday around 05:15.
  - The health unit runs every minute against `http://127.0.0.1:3100/api/health`.
- [ ] **`deploy/install-host.sh`** installs them and enables the prod timers only once `/opt/makam-v1/prod/deployed.env` contains `MAKAM_DIGEST` (the prod stack really runs). Otherwise it prints a NOTE saying how to enable them later. Re-running it after the first prod deploy enables them.
- [ ] **Tests:** `tests/tooling/systemd-units.test.ts` (new) proves that every staging backup, restore and health unit has a prod twin with `--env prod`, the same hardening and non-overlapping times, and that install-host enables the prod timers only behind the gate.
- [ ] **Runbook:** the backup and uptime sections describe the prod units, how to check them, and the restore test.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB1). Not money code. 107 checks these four timer names.
