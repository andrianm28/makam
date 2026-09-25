# WhatsApp OTP login and the Pemesan account

Status: ready-for-agent
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
- **OTP values** (constants in `src/domain/identity/otp.ts`, exported from `@/domain/identity`):
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
- **Web**: `/masuk` (cold number, no orders needed), `/akun` (Akun Saya, empty shell for ticket 27), reusable `OtpVerification` in `src/components/otp/` for Kirim in the wizards (pass a verify Server Action, the request action's dispatch, `key={sent.sentAt}`, and `fallback`). `guarded()` in `src/server/guard.ts` is the body of every signed-in Server Action: authenticate → `authorize` → Zod → domain. `currentActor()` / `setSessionCookies()` / `endCurrentSession()` in `src/server/session.ts`. `/api/dev/whatsapp-outbox?to=+62…` shows what the fake WhatsAppSender sent (development/test only; 404 elsewhere) for Playwright.
- **For 09 (staff roles, TOTP, audit log)**: extend `Role`, `Action`, `Resource` and the `switch` in `src/domain/identity/authorize.ts`; `actorFromCookies` currently gives every account `roles: ["pemesan"]`, so read staff roles there. Session length is one constant today (`PEMESAN_SESSION_MS`, set in the `session.create.before` hook): make that hook pick 30 days (staff, trusted device) or 12 h (any account holding Admin Platform, whatever else it holds). Better Auth's `twoFactor` plugin also stamps system time; either apply the same pattern (hooks + module-side checks against the Clock) or keep TOTP in the module. Record OTP logins / lockouts in the audit log if 09 wants them; nothing is audited yet.
- **For 60 (email fallback)**: the slot is the `fallback` prop of `OtpVerification`, shown when `fallbackInSeconds` (from `requestOtp().fallbackAt`) runs out; Masuk passes an interim hint there now. The real email needs its own nullable column on `identity_user` (not `placeholder_email`). Reuse `identity_otp_request` (add a channel column) so the email code shares expiry, attempts and lockout; `verifyOtp` already works for any code in that table. Offer email only when the number's existing account has one on record; otherwise show the CS WhatsApp pointer (Pengaturan Operator).
