# Contract step of ADR 0008: drop identity_totp, the session's TOTP columns and TOTP_ENCRYPTION_KEY

Status: ready-for-agent
Blocked by: 128 released to production (the running release must no longer read the table)
Spec: ADR 0008, point 3; AGENTS.md "Migrations are expand/contract"

## What to build

- In `src/domain/identity/schema.ts`, delete `identityTotp` and the `totpPassedAt` / `totpWrongAttempts` columns of `identitySession`; `npm run db:generate`.
- In the generated migration, put `-- contract: ADR 0008, TOTP removed in ticket 128` directly above each `DROP TABLE` / `DROP COLUMN`.
- Remove `TOTP_ENCRYPTION_KEY` from `src/lib/env.ts` and its test; then the owner removes it from `staging.env` / `production.env` on the host (runbook row "`TOTP_ENCRYPTION_KEY` retired").

## Acceptance criteria

- [ ] CI's expand/contract check passes, migrating from the release that carries ticket 128 with rows in `identity_totp`.
- [ ] No `totp` left in `src/` except the history-only audit actions `akun.totp_daftar` / `akun.totp_reset` and their labels.

## Comments

Opened 2026-11-02 with ticket 128.
