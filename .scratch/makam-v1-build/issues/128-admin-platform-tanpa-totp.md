# Admin Platform tanpa TOTP: the Kode Masuk is the only login factor

Status: in-progress
Blocked by: —
Spec: ADR 0008 (amends spec user story 168, Identity & Access > Kode Masuk, Roles, Sessions; ADR 0004)

## What to build

Owner decision 2026-11-02: remove the whole TOTP system. Every role, Admin Platform included, logs in with the Kode Masuk by email alone.

- Remove TOTP enrolment and the TOTP step after the Kode Masuk (`/staf/totp`), the `perlu_totp` refusal in `authorize` and every message for it, the secret box, the `reset-totp` CLI and the runbook section "Resetting an Admin Platform's TOTP".
- Expand step only: keep `identity_totp` and `identity_session.totp_passed_at` / `totp_wrong_attempts` in the schema, unread and unwritten; no migration in this release.
- `TOTP_ENCRYPTION_KEY` optional and ignored in `src/lib/env.ts` (an existing `.env` still loads); no longer required in staging or production.
- The Admin Platform session stays 12 h; no step-up Kode Masuk for money actions (owner, ADR 0008).
- Update e2e, `uat/support` (masuk.ts, persona.ts, kode.ts), `tests/uat`, the UAT checklists and the runbook.

## Acceptance criteria

- [x] Domain test "Admin Platform masuk hanya dengan Kode Masuk": right after the Kode Masuk, a new Admin Platform may open its menu, save Tarif and invite staff; its session ends after 12 h.
- [x] No `/staf/totp` page, no `reset-totp` CLI or worker bundle, no `perlu_totp` reason anywhere in `src/`.
- [x] `readRuntimeEnv` loads staging and production without `TOTP_ENCRYPTION_KEY`, and ignores one still set.
- [x] `npm run db:generate` reports no schema change.
- [x] e2e `staf.spec.ts`: the seeded Admin Platform lands on its menu straight after the Kode Masuk.

## Comments

Built 2026-11-02 on branch `claude/project-thread-tb33wr`; waits for the two-axis review and the merge thread. The contract step is ticket 129, in the next release.
