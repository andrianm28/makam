# Production environment: deploy, backups, uptime alarm

Status: ready-for-agent
Blocked by: 01, 02, 03
Spec: Implementation Decisions > Architecture (production, CI, backups); Further Notes > Pre-launch checklist; story 187; ADR 0002

## What to build

Take the walking skeleton to the Jakarta VPS as the `makam-prod` compose project, so every later ticket ships to a live environment. Extend the CI pipeline with a deploy job: pull the image from ghcr, run Drizzle migrations as a separate step, then `docker compose pull && up -d` for `web` and `worker`. Add daily client-side-encrypted Postgres backups to the S3 Jakarta backups bucket, a scripted restore test, and the external uptime alarm on `/health`.

## Acceptance criteria

- [ ] A push to `main` deploys: image pulled from ghcr, `migrate` runs and must succeed before `web`/`worker` restart; no builds on the VPS.
- [ ] `makam-prod` has its own Postgres (never shared with makam-app nonprod) and memory/CPU limits on every service.
- [ ] `/health` is reachable over TLS on the chosen hostname and reports DB and worker heartbeat.
- [ ] Sentry receives an intentional test error from `web` and from `worker`, with no body or phone number in the event.
- [ ] Daily backup (pgBackRest with `repo-cipher-type` or wal-g with libsodium) to `makam-prod-backups` in `ap-southeast-3`, encrypted client-side; WAL/retention settings documented in the repo.
- [ ] A restore script restores the latest backup into a scratch Postgres and runs a row-count check; it has been run once and the result recorded in `## Comments`.
- [ ] The external uptime monitor watches `/health` and alerts on failure, including when the worker heartbeat is stale.
- [ ] A runbook in the repo (`docs/ops/`) covers deploy, rollback to the previous image tag, restore, and rotating secrets.
- [ ] Tests: CI runs the deploy job only on `main`; the restore script is exercised in CI against a local backup of the test database.

## Notes

The cutover from the frozen Laravel beta on `makam.co.id` is decided near launch and is not part of this ticket.
