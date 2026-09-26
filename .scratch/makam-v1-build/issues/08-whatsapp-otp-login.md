# WhatsApp OTP login and the Pemesan account

Status: resolved
Blocked by: 01
Spec: Domain modules > 1. Identity & Access; stories 26, 98; ADR 0003 (and its 2026-09-25 amendment)

## What to build

The Identity & Access module's login path through Better Auth: an account keyed by one WhatsApp number, created or logged into by an OTP sent through the WhatsAppSender port (Meta's authentication template). Build a Masuk page that works cold with just a number (no orders needed), a reusable OTP component the booking wizards will embed at Kirim, and the authorisation check that every Server Action calls. Pemesan is the implicit role of every account. There is no SMS. The fallback after about 60 s ("Kirim lewat email" through EmailSender, or a pointer to the CS WhatsApp number when the account has no email) is not built here: it lands with the SES adapter in ticket 60, which depends on the human AWS/SES ticket 03. This ticket is not blocked by it.

## Acceptance criteria

- [ ] Phone numbers are normalised to one canonical form (e.g. `+62…`) so `0812…`, `62812…` and `+62812…` are one account.
- [ ] OTP request sends via the WhatsAppSender fake using the authentication template; verify creates the account if none exists, else logs in.
- [ ] The OTP component exposes a slot, shown about 60 s after the WhatsApp OTP was sent, where ticket 60 adds the fallback.
- [ ] OTP expiry, attempt limits and resend rate limits are enforced (values chosen and documented); an OTP failure creates no Antrean row.
- [ ] Pemesan sessions last 90 days (read from the Clock).
- [ ] An exported `authorize(actor, action, resource)` check exists; Server Actions call it; unauthenticated actions are rejected.
- [ ] Masuk works for a number with no orders and lands on Akun Saya (an empty shell until ticket 27).
- [ ] The OTP screen says the code arrives only on the phone (not WhatsApp Web or Desktop).
- [ ] Tests (Vitest, real Postgres, fake Clock and senders): OTP login creating the account; login of an existing account; session expiry after 90 days; number normalisation.

## Notes

No self-service recovery and no shared family access (spec, Out of Scope).

## Comments

- 2026-09-25 — Implemented on branch `worktree-agent-acc5ec31989813459` (not merged). Better Auth 1.7.6 (`better-auth/minimal`, Drizzle adapter, phone-number plugin).
- **OTP values** (constants in `src/domain/identity/otp.ts`; private to the identity module since the 2026-09-25 review, as nothing outside it uses them):
  - length 6 digits (`OTP_LENGTH`);
  - expiry 10 minutes after sending (`OTP_EXPIRES_AFTER_MS`), matching `code_expiration_minutes: 10` in the `kode_verifikasi` template;
  - attempt limit: the 5th wrong code burns the OTP (`OTP_MAX_WRONG_ATTEMPTS`); a new OTP must be sent;
  - resend: "Kirim ulang" opens 60 s after the last OTP to the number (`OTP_RESEND_AFTER_MS`), and at most 5 OTPs per number in any rolling 60 minutes (`OTP_MAX_SENDS_PER_WINDOW`, `OTP_SEND_WINDOW_MS`);
  - lockout: 10 wrong codes on the OTPs sent to a number in the last 60 minutes lock it for 60 minutes from the 10th (`OTP_LOCKOUT_*`): no OTP is sent and no code is accepted, not even an open one;
  - fallback slot shows 60 s after the send (`OTP_FALLBACK_AFTER_MS`).
  - A WhatsApp send that throws returns `gagal_kirim`, is not counted against the limits, and raises no Antrean row.
  - All limits are per number, not per IP. Better Auth's own rate limiter is off (in-memory, system time, and it never sees `auth.api` calls from Server Actions).
- **Clock**: Better Auth reads the system time and cannot take the Clock. So the module generates, stores (HMAC only, `identity_otp_request`), limits and checks codes itself against the Clock; Better Auth's `verifyOTP` hook delegates to it. Every timestamp Better Auth writes (user and session `createdAt`/`updatedAt`, session `expiresAt`) is replaced from the Clock in `databaseHooks`; session refresh is off; sessions are never read via `auth.api.getSession` (system-time expiry) but by `identity.actorFromCookies`, which verifies the signed `makam.session_token` cookie and checks `expiresAt` against the Clock. Better Auth's HTTP handler is not mounted.
- **Public interface** (`createIdentity({ db, clock, whatsapp, secret, baseURL })`, built once in `serverRuntime().identity`): `requestOtp`, `verifyOtp` (returns `accountCreated` and session cookies to set), `accountByPhoneNumber`, `actorFromCookies`, `endSession`; plus `normalisePhoneNumber` and `authorize(actor, action, resource)`.
- **Tables** (all owned by identity, migration `0001_identity_otp_login`): `identity_user`, `identity_session`, `identity_auth_account`, `identity_verification` (Better Auth models user/session/account/verification) and `identity_otp_request`. Better Auth requires a unique email, so `identity_user.placeholder_email` holds `6281…@wa.makam.invalid`; it is never shown or mailed.
- **Env**: `AUTH_SECRET` (min 32 chars) and `APP_BASE_URL` are required in staging and production (add both to `.env.prod`); development and test fall back to local values. `https` in `APP_BASE_URL` makes the cookie Secure.
- **Web**: `/masuk` (cold number, no orders needed), `/akun` (Akun Saya, empty shell for ticket 27), reusable `OtpVerification` in `src/components/otp/` for Kirim in the wizards (pass a verify Server Action, the request action's dispatch, `key={sent.sentAt}`, and `fallback`). `guarded()` in `src/server/guard.ts` is the body of every signed-in Server Action: authenticate → `authorize` → Zod → domain (see the `guarded()` contract below). `currentActor()` / `setSessionCookies()` / `endCurrentSession()` in `src/server/session.ts`. `/api/dev/whatsapp-outbox?to=+62…` shows what the fake WhatsAppSender sent (development/test only; 404 elsewhere) for Playwright.
- **For 09 (staff roles, TOTP, audit log)**: extend `Role`, `Action`, `Resource` and the `switch` in `src/domain/identity/authorize.ts`; `actorFromCookies` currently gives every account `roles: ["pemesan"]`, so read staff roles there. Session length is one constant today (`PEMESAN_SESSION_MS`, set in the `session.create.before` hook): make that hook pick 30 days (staff, trusted device) or 12 h (any account holding Admin Platform, whatever else it holds). Better Auth's `twoFactor` plugin also stamps system time; either apply the same pattern (hooks + module-side checks against the Clock) or keep TOTP in the module. Record OTP logins / lockouts in the audit log if 09 wants them; nothing is audited yet.
- **For 60 (email fallback)**: the slot is the `fallback` prop of `OtpVerification`, shown when `fallbackInSeconds` (from `requestOtp().fallbackAt`) runs out; Masuk passes an interim hint there now. The real email needs its own nullable column on `identity_user` (not `placeholder_email`). Reuse `identity_otp_request` (add a channel column) so the email code shares expiry, attempts and lockout; `verifyOtp` already works for any code in that table. Offer email only when the number's existing account has one on record; otherwise show the CS WhatsApp pointer (Pengaturan Operator).
- 2026-09-25 — Review fixes and user decisions (same branch):
  - **+62 only**: v1 takes only Indonesian (+62) WhatsApp numbers. `normalisePhoneNumber` refuses a well-formed number from any other country as `nomor_bukan_indonesia` ("Gunakan nomor WhatsApp Indonesia (+62)."); malformed input stays `nomor_tidak_valid`. All the +62 spellings still normalise to one `+62…` form.
  - **OTP sent directly, not through Notifications** (deliberate exception, recorded in `AGENTS.md` and the spec under Identity & Access and Notifications): it must arrive at once, background retries would only confuse, and the code is sensitive. The OTP creates no message-log entry and is never retried automatically; on failure the Pemesan sees "gagal kirim" and can retry.
  - **`guarded()` contract**: `guarded({ action, resource, schema, input, run })` takes no actor. It resolves the actor itself from the request's session cookie (`currentActor()`), so a caller cannot skip or fake authentication; then `authorize`, then Zod, then `run(actor, data)`. It returns `{ ok: false, error: GuardError }` on refusal. An action with no state to return a refusal in (a plain form action like `keluar`) throws `GuardRejected(error)`; `keluar` without a session is refused (`belum_masuk`) rather than redirecting as if it had worked. The Masuk actions are the one exception: they skip authenticate and role check because they are the login (`AGENTS.md`).
  - Also: OTP hashes compared with `crypto.timingSafeEqual`; every Better Auth write (user, session, account, verification; create and update) is stamped with Clock time; `akunResource(accountId)` builds the Akun resource; `phoneNumberInput` (`src/server/phone-number-input.ts`) is the shared Zod field; `otpMessage` takes the typed `OtpRefusal` union and is exhaustive.
  - **Still untested: "an OTP failure creates no Antrean row"**. The queues module is empty, so there is no Antrean to read back. Ticket 17 is asked to add this test once the Antrean exists (see its Comments).
- 2026-09-25 — Merged to `main`. Two-axis review (mattpocock-skills:code-review) found no hard violations and no wrong behaviour; fixes applied test-first: +62-only numbers, constant-time OTP hash compare, Clock stamps on every Better Auth write, `guarded()` resolves the actor itself, `keluar` proven to go through the guard, exhaustive `otpMessage`, dedup and trimmed exports. Keluar with an ended session redirects to `/masuk?sesi=berakhir` (not an error page). Verified in the main session: lint 0, typecheck 0, build 0, Vitest 139/139, Playwright 3/3 on a fresh stack.
- Open for ticket 60: whether the email fallback OTP is also sent directly (recommended: yes, same reasons as the WhatsApp OTP).

## Amended (2026-09-25, email login)

- The WhatsApp OTP is no longer the only login. Any Akun with an Email Terverifikasi may also log in with an email Kode Masuk ("Masuk dengan email") at any time (ADR 0003 amendment). That, and the "Kirim lewat email" fallback in the `fallback` slot, are built in **ticket 67**, not ticket 60 (60 is now the S3 FileStore only). This ticket's WhatsApp path is unchanged, and new Akun are still created only by the WhatsApp OTP.
- The open question above is answered: the email code is also sent directly by Identity & Access, not through Notifications.
- The email code uses the same values as the WhatsApp OTP, but counts its limits per email and per IP. The WhatsApp limits here stay per number.
- 2026-09-25 (ticket 67, decision Q10) — The lockout is now **per Akun across channels**: 10 wrong Kode Masuk in 60 minutes by WhatsApp or email lock the Akun for 60 minutes. A number with no Akun yet is still locked by itself. The send limits (60 s, 5 per hour) stay per number for WhatsApp. `identity_otp_request.phone_number` is now `target`, with `channel`, `purpose` and `lock_key` (migration 0003). The lockout test in `otp-login.test.ts` is renamed to "…lock a number with no Akun yet…"; the Akun variant is in `email-login.test.ts`.
- 2026-09-26 — ADR 0004: superseded: the WhatsApp OTP login, the Akun keyed by a WhatsApp number, the WhatsAppSender send of the OTP, the authentication template, the "only on the phone" copy, the fallback slot and the per-number limits. An Akun is now keyed by its Email Terverifikasi and created or logged into by an email Kode Masuk (ticket 82). Still valid: the code rules (6 digits, 10 min, 5th wrong burns, resend 60 s, 5 per hour, lockout 10 in 60 min), HMAC storage with constant-time compare, the Clock-driven module-owned code check, the direct send outside Notifications ("gagal kirim", no row), sessions, and `normalisePhoneNumber` (+62) for the contact phone.
