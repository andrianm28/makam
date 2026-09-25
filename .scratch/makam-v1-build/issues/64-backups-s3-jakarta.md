# Encrypted Postgres backups to S3 Jakarta and restore test

Status: ready-for-agent
Blocked by: 03, 07
Spec: Implementation Decisions > Architecture (backups); ADR 0002

## What to build

Split from ticket 07 on 2026-09-25. Daily client-side-encrypted backups of the `makam-staging` and `makam-prod` Postgres to the `makam-prod-backups` bucket in `ap-southeast-3`, and a scripted restore test.

## Acceptance criteria

- [ ] Daily backup (pgBackRest with `repo-cipher-type`, or wal-g with libsodium), encrypted client-side; WAL/retention settings documented in the repo.
- [ ] A restore script restores the latest backup into a scratch Postgres and runs a row-count check; it has been run once and the result recorded in `## Comments`.
- [ ] Tests: the restore script is exercised in CI against a local backup of the test database.
- [ ] The runbook in `docs/ops/` gains backup and restore sections.
