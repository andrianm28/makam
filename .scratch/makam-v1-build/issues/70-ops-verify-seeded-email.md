# Ops: mark an Admin Platform's email as Email Terverifikasi from the CLI

Status: ready-for-agent
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
