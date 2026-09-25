# Email login, Verifikasi email and the "Kirim lewat email" fallback

Status: ready-for-agent
Blocked by: 09
Spec: Domain modules > 1. Identity & Access (Email login, Email Terverifikasi); 15. Notifications (login-code exception); Adapter ports > EmailSender; Data and privacy; stories 27, 189, 190; ADR 0003 (amendment 2026-09-25, later: email login); CONTEXT.md (Kode Masuk, Email Terverifikasi)

## What to build

Let any Akun with an **Email Terverifikasi** (Pemesan and every staff role) log in with a 6-digit Kode Masuk sent to that email, as an equal alternative to the WhatsApp OTP that the user may choose at any time. Decided by the user on 2026-09-25.

- **Masuk dengan email**: a "Masuk dengan email" link on `/masuk` opens an email form. The user enters an email, then the code. The reply to the email step is always "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.", whether the email is verified, unverified, unknown or locked out. A code is sent only when the email is an Email Terverifikasi of an Akun. A successful email login lands where a WhatsApp login lands: Akun Saya for a Pemesan, `/staf` for staff.
- **The fallback**: about 60 s after a WhatsApp OTP (the `fallback` slot of `OtpVerification`, ticket 08), "Kirim lewat email" sends the same email Kode Masuk to the Email Terverifikasi of the number's existing Akun. If the Akun has none, or the number has no Akun yet, the slot shows no email button and points to the CS WhatsApp number instead. An email typed on the same "Data & kirim" screen does not enable it. This moves out of ticket 60.
- **Verifikasi email**: an action in the Akun Saya profile (Pemesan) and in the staff area (every staff role) that sends a code to the Akun's email and marks it verified when the code is entered. The first successful email login also marks it verified; that only happens for an email that is already verified, so in practice verification comes first. An email that has only been typed in is never verified: on an order, in the profile, or by Admin Platform on an Undangan Staf (the invite email becomes the Akun's email unverified, ticket 09). Changing or removing the email clears the verified mark.
- **Uniqueness**: a verified email belongs to at most one Akun. Verifying an email that another Akun already has verified is refused with a message pointing to CS; Admin Platform resolves such cases through CS (no screen for it in v1). Enforce this in the database, not only in code.
- **Staff**: staff may log in by email. An Admin Platform must still pass TOTP afterwards (same `totp` actor state as after a WhatsApp login), and open Undangan Staf for the Akun's number are accepted on an email login as on a WhatsApp login. Session lengths are unchanged: 12 h for any Akun holding Admin Platform, 30 days for other staff, 90 days for a Pemesan.
- **Never creates an Akun**: an email login only opens an existing Akun. New Akun are still created only by the WhatsApp OTP (ADR 0003). The WhatsApp number stays the key.

It is built and tested against the in-memory `EmailSender` fake. Real sending in staging and production comes with the SumoPod SMTP adapter (ticket 68). Until that lands, email login works in development and tests only. On staging and production the send throws `PortNotConfiguredError`. The screen must handle that the way it handles a failed WhatsApp send ("gagal kirim", not counted against the limits), without revealing whether the email is registered.

## Acceptance criteria

- [ ] **Email code rules** (same values as the WhatsApp OTP, ticket 08): 6 digits; expiry 10 min; the 5th wrong code burns it; "Kirim ulang" after 60 s; at most 5 codes per rolling 60 min; lockout for 60 min after 10 wrong codes in 60 min. These limits are counted **per email and per IP**. The IP is taken from the proxy header that the host's nginx sets, trusted only from nginx; record which header in Comments.
- [ ] The email code is sent **directly** by Identity & Access through `EmailSender`, not through Notifications: no message-log entry, no automatic retry, no Antrean row. A failed send shows "gagal kirim" and is not counted against the limits (same exception as the WhatsApp OTP; `AGENTS.md` and the spec).
- [ ] Codes are stored only as HMACs and compared in constant time. Reuse `identity_otp_request` with a channel (WhatsApp / email) and a target, so both channels share the code logic. Every time is read from the Clock.
- [ ] **Masuk dengan email** on `/masuk`: email form → code form; the email step always replies "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim." (same text, same status and the same shape of response for verified, unverified, unknown and locked-out emails, plus a send failure where it can be kept identical); email addresses are trimmed and lower-cased before any lookup.
- [ ] Email login of an existing Akun creates a session with the Akun's normal length and roles; an Admin Platform lands on the TOTP step; open Undangan Staf for the Akun's number are accepted and audited as on a WhatsApp login (`staf.peran_diberikan`), and the strictest-session rule of ticket 09 applies.
- [ ] **Fallback**: "Kirim lewat email" appears in the OTP component about 60 s after a WhatsApp OTP, only when the number's existing Akun has an Email Terverifikasi; it sends the email Kode Masuk, and entering it logs in like the WhatsApp OTP. Without an Email Terverifikasi (or without an Akun) the slot points to the CS WhatsApp number. Read the number from Pengaturan Operator if ticket 63 has landed; otherwise keep Masuk's interim hint and leave a note in ticket 63. The wizards (22, 36, 40, 44, 50) embed the same component, so they get this for free.
- [ ] **Verifikasi email** in the Akun Saya profile: add, change or remove the Akun's email (the profile email field of ticket 27 is built here) and verify it with a code sent to it (same code rules). The screen shows whether the email is verified.
- [ ] **Verifikasi email** in the staff area for every staff role (an Admin Platform must pass TOTP first, as for every other staff action). Verifying from the staff area is a staff write and goes through `audit.staffWrite`, recording an Entri Audit (e.g. `akun.email_verifikasi`, before `{email, terverifikasi: false}`, after `{email, terverifikasi: true}`; never the code). Record whatever the Pemesan-side action logs in Comments.
- [ ] **Uniqueness**: a unique constraint on verified emails (e.g. a partial unique index on the verified email); verifying an email already verified on another Akun is refused (`email_sudah_dipakai`) with a message pointing to CS, and nothing changes.
- [ ] An email typed on a "Data & kirim" screen, in the profile or on an Undangan Staf is stored unverified and never enables email login or the fallback.
- [ ] No email address or code in logs or GlitchTip.
- [ ] Tests (Vitest, real Postgres, fake Clock, fake EmailSender and WhatsAppSender):
  - email login of a Pemesan and of each staff role;
  - Admin Platform must still pass TOTP after an email login, and session lengths stay 12 h / 30 days / 90 days;
  - an unknown, unverified or locked-out email gets the identical reply and no email is sent;
  - an email login never creates an Akun;
  - expiry, 5th wrong code burns, 60 s resend, 5 per rolling hour and the 10-wrong-codes lockout, each per email and per IP;
  - fallback timing and the verified-email rule, with the CS pointer when there is no Email Terverifikasi and an email typed on "Data & kirim" not enabling it;
  - Verifikasi email from the profile and from the staff area, with the staff one producing an Entri Audit;
  - the email of an Undangan Staf is not verified until the staff member verifies it;
  - the uniqueness refusal;
  - changing the email clears the verified mark;
  - Undangan Staf accepted on an email login.
- [ ] Playwright smoke (ticket-requested, fast): Verifikasi email in Akun Saya with the fake email outbox, then Keluar, then Masuk dengan email. Add a development/test-only `/api/dev/email-outbox?to=…` next to the WhatsApp one; it returns 404 elsewhere.

## Notes

- Existing data (ticket 09): the real email is `identity_user.email` (Drizzle `contactEmail`). The Better Auth `placeholder_email` and `placeholder_email_verified` columns are for Better Auth only: never reuse them for this. Add the verified mark as its own column, for example `email_verified_at` from the Clock.
- The email Kode Masuk needs an email template (subject and body in Indonesian: code, 10-minute expiry, "abaikan bila bukan Anda"). There is no Meta template to submit. Also a template for the Verifikasi email code.
- Moved here from ticket 60 on 2026-09-25: the "Kirim lewat email" fallback criteria (timing, offered only for an Akun with an email, CS pointer otherwise, staff always have it). "Staff always have it" no longer holds: staff must verify first.
- The Undangan Staf email itself (sending the invite by email as well as WhatsApp) is not this ticket. It moves behind Notifications in ticket 20 and goes live with ticket 68.
- Open, decide while building (record the answer in Comments): whether wrong email codes also count toward the lockout of the Akun's WhatsApp number (the decision counts per email and per IP; without a shared count, an attacker who knows both could alternate channels); whether an email typed on a "Data & kirim" screen that differs from the Akun's Email Terverifikasi replaces it (and so clears the verified mark) or is kept only on the order.

## Notes (main session, 2026-09-25)

- Update code comments that still name SES or ticket 60 for the email fallback: `src/ports/email-sender.ts`, `src/composition/adapters.ts` (`notConfigured("EmailSender (SES)")` → SumoPod SMTP, ticket 68), `src/domain/identity/schema.ts`, `invites.ts`, `otp.ts`.
