# Production backups, restore test and health watchdog

Status: resolved
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

### Build (2026-10-04, builder)

Branch `ticket-108-production-backups-watchdog`, four commits on `0fd6bf41`. `Status:` untouched.

What changed:
- **Units.** `deploy/systemd/makam-prod-{db-backup,files-backup,restore-test,health}.{service,timer}` (8 files): staging's units mirrored with `--env prod`, with the same `User`, `Type`, timeouts, `Persistent`, random delays and the four sandbox directives. Hours (WIB): database 01:15, FileStore 01:45, restore check Mondays 05:15 (staging keeps 02:15, 03:15, Mondays 04:15). The health unit runs `makam-healthcheck http://127.0.0.1:3100/api/health` every minute (`OnBootSec=5min`, as staging), then `makam-diskcheck /`. `systemd-analyze verify` on the four pairs printed nothing and `systemd-analyze calendar` accepts the three hours.
- **`deploy/install-host.sh`.** The unit glob already installs the new files. After `daemon-reload` it enables the four prod timers only when `/opt/makam-v1/prod/deployed.env` has a non-blank `MAKAM_DIGEST`, read the way `makam-deploy`'s `current_digest` reads it, so the blank line a rolled-back first deploy leaves keeps the gate shut. Otherwise a `NOTE` names the file, says to run the script again after the first production deploy, and gives the `sudo systemctl enable --now ...` command. `makam-prod-deploy.timer` is still never enabled.
- **Tests, `tests/tooling/systemd-units.test.ts` (new, 48 tests).** Staging's backup, restore and health units are found on disk, so a staging unit added later needs a twin too. Each twin equals staging's after `staging` to `prod` and the URL swap, ignoring only `Description` and `OnCalendar`, so hardening, user, timeouts, `After=`, `Persistent`, delays and the order of the two health checks are all compared. No prod directive names staging. The three hours are exact, and no two jobs' windows (hour + `RandomizedDelaySec` + `TimeoutStartSec`; a weekly job counted as daily) meet, staging's included. `install-host.sh` itself runs with `MAKAM_ROOT` in a temp dir and a fake `sudo` and `systemctl` that only record, in five gate cases (no file, empty file, no digest line, blank digest, digest present) and a re-run after the first deploy. Mutation check: four deliberate breaks (a prod unit with `--env staging`, the files timer at 02:20, `ProtectSystem` dropped, the gate forced open) failed 12 tests, then were restored.
- **Runbook.** The file table, the `install-host.sh` paragraph, "File storage", "Database backup and restore" (six-row hours table, a "Production's units" subsection with the gate and the commands to look at them, the passphrase, the restore check, alerting), "Uptime alarm" (the prod watchdog), "The 85 % warning", "Production (ticket 65)" and Hari switch step 3 (one sentence: run `install-host.sh` again after the first production deploy). The stale "no makam-prod unit is installed yet" comments in `makam-backup-db` and `makam-restore-test` are gone.

Beyond the four criteria (two small commits of their own, `70be097b` and `ddab50fb`; drop them if unwanted):
- `makam-restore-test` removed its throwaway Postgres with `docker rm -f`. The Postgres image declares `VOLUME /var/lib/postgresql`, so the container has an anonymous volume holding the whole restored database, and `-f` leaves it behind. Shown on the host with a named probe container: the volume survived `rm -f` and was gone after `rm -fv`. Each weekly check therefore kept a full copy of the Dump, where the Dump itself is kept 7 days, and from this ticket the check runs against makam-prod. The cleanup and the `--keep` hint now use `rm -fv` (a named volume is never touched by `-v`, and the container mounts none). `tests/tooling/makam-restore-test-volume.test.ts` (new, 2 tests, fake docker) was red first.
- `tests/tooling/db-backup.test.ts` cleaned its containers up with `rm -f` too: five leaked volumes per run. Dangling anonymous volumes on the host: 58 before my first run, 63 after it, 68 after a second, 68 before and after a run with `rm -fv`. `scripts/clean.mts` already used `-v`.

Decisions:
- The prod health unit repeats the disk check, as a literal mirror ("same hardening"). Staging's unit and the runbook said one check covers the whole host; now both units report a full disk, with the same tag, and the runbook says so. Prod's watchdog no longer depends on staging's timer staying enabled. To report it once, delete the second `ExecStart` of the prod unit and its line in the test.
- The gate is `deployed.env` only, as written. A missing `/opt/makam-v1/prod/backup-passphrase` does not hold the timers back: the backup and the restore check then refuse loudly (exit 78, unit failed) and the installer's existing `NOTE` names the file on every run.
- The health unit checks the loopback port, not nginx and TLS (the criterion): until the switch `makam.co.id` still reaches the old app. The external monitor stays the alarm.

Spec gaps and decisions for the owner:
- **Order of the go-live steps.** The prod timers exist only after the first production deploy and a re-run of `install-host.sh`. Ticket 107's preflight FAILs unless the four are enabled, and the Hari switch lists the preflight as step 1, before the first deploy in step 3. Either the first production deploy and the re-run come before the preflight (as the rehearsal in ticket 72 can do), or 107 and 113 reorder the steps. Not edited here beyond step 3's sentence.
- **Volumes the old runs left.** Staging's weekly restore checks since ticket 64 each left one anonymous volume, and so did earlier test runs. They have random names and nothing marks them as makam's; 68 dangling anonymous volumes sit on the host, from all projects (`docker system df`: local volumes 5.3 GB, 2.5 GB reclaimable). I removed none: no prune is allowed here and which of them are ours is the owner's call. The runbook says never to prune them.

Tests (counts read off whole logs):
- Red first: `systemd-units` 46 of 48 failed before the units existed; `makam-restore-test-volume` 2 of 2 failed before the fix.
- `npx vitest run` on `systemd-units`, `makam-restore-test-volume`, `db-backup` (real Docker), `nginx-blocks`, `image-retention`, `makam-preflight` and `katalog-lama-runbook`: exit 0, 7 files, 137 tests passed. `db-backup` again after the cleanup change: exit 0, 12 passed.
- `tests/tooling/ticket-workflow.test.ts` after this entry: exit 0, 62 passed.
- `npm run lint` exit 0 (0 errors, 6 warnings, all in `src/`, none in the files of this ticket) and `npm run typecheck` exit 0, both on the final tree. No `npm run build`: the ticket needs none.

### Review and merge (2026-10-04, orchestrator; fixed point origin/main 0fd6bf41, head be0c0db8)

Two-axis review: the Standards and Spec reviewers (sonnet) ran in parallel, from the build workflow. Both reported **Hard: 0** on the first round, and every acceptance criterion was MET. The builder's tests were read from a whole log. Merged in batch MB1 with 106, 107 and 108.

Follow-ups (soft, deliberately left):
- **Stale comments:** `makam-diskcheck`/`makam-healthcheck` header comments and the staging health unit's "one check covers the whole host" are out of date.
- **Runbook:** `list-timers 'makam-prod-*'` will also match `makam-prod-deploy.timer`; name the four timers instead.
- **Tests:** one recorded call-order assertion (daemon-reload before enable).
- **Disclosed extras beyond the ACs:** restore-test cleanup with `docker rm -fv` and its volume test. The gate needs a non-blank MAKAM_DIGEST.
- **Owner decision (rehearsal order):** the prod timers exist only after the first prod deploy plus a re-run of install-host.sh. G1 in the approved plan already orders it that way, and 113 documents it.
