# Admin Platform tanpa TOTP: the Kode Masuk is the only login factor

Amends the v1 spec (user story 168; Identity & Access > Kode Masuk, Roles "Admin Platform (TOTP required)" and Sessions) and ADR 0004 ("Admin Platform still with TOTP"). Owner decision, 2026-11-02.

The whole TOTP system for Admin Platform is removed: enrolment and the TOTP step after the Kode Masuk (`/staf/totp`), the per-session TOTP check in `authorize` (the `perlu_totp` refusal), the encrypted secret box, the `reset-totp` CLI and its runbook section. **The Kode Masuk by email is the only login factor for every role**, Admin Platform included. The owner chose the simpler login over the second factor, knowing what it costs (below).

The owner's answers to the three questions this left open:

1. **The Admin Platform session stays 12 h.** An Akun holding Admin Platform still gets the strictest session for the whole account, whatever other roles it holds (`ADMIN_PLATFORM_SESSION_MS`); 30 days for other staff and 90 days for a Pemesan are unchanged. With no second factor, the short session is the main control left on the accounts that move money.
2. **No step-up Kode Masuk for money actions.** Pencairan, Pengembalian Dana and Tarif need only a live Admin Platform session, as every other Admin Platform action does, and stay audited. A fresh code sent to the same mailbox would not help in the case that matters (the mailbox itself taken over) and would only guard against a stolen session cookie, which the 12 h session already bounds.
3. **The data goes expand/contract.** This release stops reading and writing `identity_totp` and the `identity_session.totp_passed_at` / `totp_wrong_attempts` columns but keeps them, so the running release still works during the rollout. `TOTP_ENCRYPTION_KEY` becomes optional and is ignored, so an existing `.env` still loads. The next release drops the table and the two columns, each under a `-- contract: ADR 0008` line, and removes `TOTP_ENCRYPTION_KEY` from `src/lib/env.ts` and the hosts' env files.

## Consequences

- **An Admin Platform account is only as safe as its mailbox.** Whoever can read that inbox can log in and approve Pencairan, refunds and Tarif changes. Each Admin Platform's email account should have its own 2FA (from the email provider) and a strong password; the runbook says so. Accepted risk, owner's decision.
- The 12 h session, the Audit Log on every staff write, Pemulihan Akun only by another Admin Platform, and the Kode Masuk's own limits (per email and per IP) stay as they are.
- Admin Platform who enrolled an authenticator may delete the Makam entry from their authenticator app; nothing reads it any more.
- Audit Log entries `akun.totp_daftar` and `akun.totp_reset` from before this change stay readable; nothing writes them now.
- UAT G4 (and any check that types an authenticator code) now checks that an Admin Platform lands on its menu straight after the Kode Masuk.
- A later version that wants a second factor again (passkeys, TOTP) brings it back through a new ADR; it is not kept idle in the code.
