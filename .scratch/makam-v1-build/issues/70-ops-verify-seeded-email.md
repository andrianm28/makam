# Ops: mark an Admin Platform's email as Email Terverifikasi from the CLI

Status: resolved
Blocked by: 67
Spec: Domain modules > 1. Identity & Access (Email Terverifikasi, first Admin Platform seed); ADR 0003 amendments

## What to build

Decided with the user on 2026-09-26. Before the live WhatsApp adapter exists (ticket 62), the first Admin Platform on staging cannot log in: the WhatsApp Kode Masuk port refuses, and email login needs an Email Terverifikasi, which itself needs a login. Anyone who can run commands inside the `web` container is already fully trusted, so ops may mark an **Admin Platform's** email as Email Terverifikasi from the CLI, audited.

## Acceptance criteria

- [ ] `seed:admin <phone> <email> --email-terverifikasi` creates the first Admin Platform with that email already an Email Terverifikasi.
- [ ] A separate ops command `npm run verify-email -- <phone> --alasan "<reason>"` (built as `dist/verify-email.mjs`) marks the email on record of an **existing Admin Platform** as Email Terverifikasi. It is refused for any Akun that is not an Admin Platform, for an Akun with no email, for an empty reason, and when another Akun already holds that email as Email Terverifikasi (the unique index decides, as in ticket 67).
- [ ] Both write an Entri Audit with actor role `ops_cli` (the seed keeps `seed_cli`), action `akun.email_verifikasi`, before/after `{ terverifikasi: false → true }` and the reason; no secret in it.
- [ ] Neither creates an Akun other than the seed's own, and neither logs anyone in; the Admin Platform still passes TOTP after the email login.
- [ ] The runbook documents both, next to `seed:admin` and `reset-totp`, and says this is the bootstrap path until ticket 62.
- [ ] Tests at the CLI-command function seam (like `seed-admin-command.test.ts` and `reset-totp-command.test.ts`): each refusal, the audit entry, and that an email login then works for that Admin Platform (fake EmailSender).

## Comments

- 2026-09-26 — Implemented test-first at the CLI-command seam (`src/cli/verify-email-command.test.ts`, new; `src/cli/seed-admin-command.test.ts`, three new cases). Each slice was watched red for its own reason before the code: the stub command's usage exit, the email in the entry's before/after, a Mitra Jasa's email being marked, an empty reason accepted, the unique violation surfacing as "Gagal ... (Error)", a second run writing a false "before", and the seed flag rejected as usage.
  - Domain: one write in identity, `recordOpsEmailVerification` (`src/domain/identity/email.ts`), used by `markEmailVerifiedByOps({ phoneNumber, reason })` (actor `ops_cli`) and by `seedFirstAdminPlatform({ ..., emailTerverifikasi: true })` (actor `seed_cli`, same transaction as the seed, fixed reason `seed:admin --email-terverifikasi (jalur bootstrap sebelum WhatsApp live)`). Both run through `audit.staffWrite`; "now" comes from the Clock. Uniqueness is the database's: the `identity_user_verified_email_idx` violation is mapped to `email_sudah_dipakai` (shared `isVerifiedEmailTaken` from ticket 67), and for the seed that rolls back everything, so no Admin Platform is created.
  - Refusals: not an Admin Platform (also a number with no Akun, which creates none), empty reason, no email on record, email taken by another Akun's Email Terverifikasi, plus one not listed: the email already is its Email Terverifikasi (`sudah_terverifikasi`), so every entry's `before: { terverifikasi: false }` is true.
  - Entri Audit: `akun.email_verifikasi`, before/after `{ terverifikasi: false }` → `{ terverifikasi: true }`, the reason, no email, code or secret.
  - CLI: `src/cli/verify-email.ts` + `verify-email-command.ts` (Zod over `parseArgs`), `npm run verify-email`, `dist/verify-email.mjs` in `scripts/build-worker.mjs`; `seed:admin` gained `--email-terverifikasi` (usage line updated). Runbook: new section "Bootstrap: an Admin Platform's Email Terverifikasi" after `reset-totp`, and a note in `seed:admin`.
  - The "no email" refusal is set up with one SQL `update` in its test: no identity path leaves an Akun Staf without an email.
  - Verified: lint 0, typecheck 0, Vitest 486/486 (exit 0), `npm run build` 0, `npm run build:worker` 0 with `dist/verify-email.mjs`.
- 2026-09-26 — Code-review fixes.
  - **Pre-existing seed bug fixed** (red first, `src/domain/identity/staff-access.test.ts`): when `seed:admin` reuses an Akun whose email changes, `emailVerifiedAt` is cleared, so an unproven address never becomes an Email Terverifikasi. With `--email-terverifikasi` the new email is then marked through the audited write (`seed_cli`). A reused Akun whose Email Terverifikasi already is the seeded email stays verified and the seed succeeds, with no misleading `sudah_terverifikasi` (which the seed can no longer return). Tests: "reusing a Pemesan's Akun with a different email: the new email is not an Email Terverifikasi", "... and emailTerverifikasi: the new email is its Email Terverifikasi, audited by seed_cli", "reusing a Pemesan's Akun whose Email Terverifikasi is the seeded email, with emailTerverifikasi: it stays verified and the seed succeeds". All three were red before the fix (verified `true` / `ok: false`).
  - `markEmailVerifiedByOps` lives in `src/domain/identity/ops-email-verification.ts`: one transaction that locks the Akun's row (`for update`), checks `admin_platform` through `rolesOf`, then marks. The inline role query is gone. The shared write is `markEmailOnRecordVerified` in `email.ts`, and callers check `sudah_terverifikasi` on the row they locked. The seed's local `seed()` is now `createFirstAdminPlatform`.
  - The `tanpa_email` refusal, its two CLI messages and the raw-SQL test are removed. No public path leaves an Admin Platform without an email, so the ops path throws on it as a defensive guard.
  - Guard test `src/app/no-ops-email-verification.test.ts`: nothing under `src/app` references `markEmailVerifiedByOps`. It was checked with a temporary probe file (red), then the probe was removed.
  - Tests tightened: the seed's `akun.email_verifikasi` entry is compared with `toEqual` on actor, entity, before, after and reason. The non-Admin `verify-email` case no longer checks email login, which had nothing to prove.
  - Runbook: the `seed:admin` section's broken closing fence is fixed, and a note covers the reused-Akun behaviour. The "Akun has no email" refusal is gone from `verify-email`'s exit list.
  - `seed:admin` has one success return.
  - Verified: lint 0, typecheck 0, Vitest 489/489 (48 files, exit 0), `npm run build` 0, `npm run build:worker` 0.
- 2026-09-26 — Merged to `main` after a two-axis review and fixes: `seed:admin` clears a stale Email Terverifikasi when a reused Akun's email changes, raw-SQL test removed, row lock before the role check, guard test keeps `markEmailVerifiedByOps` out of `src/app`, runbook fence fixed. Verified: 489/489 on the branch, 559/559 combined with ticket 12.
- 2026-09-26 — ADR 0004: superseded in part: the bootstrap problem this solved ("before the live WhatsApp adapter exists, ticket 62") is gone, since ticket 62 is out of scope and every Akun is keyed by an Email Terverifikasi. `seed:admin` seeds the email as the Email Terverifikasi (the `--email-terverifikasi` flag becomes the default or goes away) and `verify-email` either keys on the email or is retired; the runbook drops "until ticket 62". Decided in ticket 82.
