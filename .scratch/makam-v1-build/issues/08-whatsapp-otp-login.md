# WhatsApp OTP login and the Pemesan account

Status: ready-for-agent
Blocked by: 01
Spec: Domain modules > 1. Identity & Access; stories 26, 27, 98; ADR 0003

## What to build

The Identity & Access module's login path through Better Auth: an account keyed by one WhatsApp number, created or logged into by an OTP sent through the WhatsAppSender port (Meta's authentication template), with a "Kirim lewat SMS" button after about 60 s through the SmsSender port. Build a Masuk page that works cold with just a number (no orders needed), a reusable OTP component the booking wizards will embed at Kirim, and the authorisation check that every Server Action calls. Pemesan is the implicit role of every account.

## Acceptance criteria

- [ ] Phone numbers are normalised to one canonical form (e.g. `+62…`) so `0812…`, `62812…` and `+62812…` are one account.
- [ ] OTP request sends via the WhatsAppSender fake using the authentication template; verify creates the account if none exists, else logs in.
- [ ] "Kirim lewat SMS" is disabled until ~60 s after the WhatsApp OTP was sent, then sends the same kind of OTP via SmsSender.
- [ ] OTP expiry, attempt limits and resend rate limits are enforced (values chosen and documented); an OTP failure creates no Antrean row.
- [ ] Pemesan sessions last 90 days (read from the Clock).
- [ ] An exported `authorize(actor, action, resource)` check exists; Server Actions call it; unauthenticated actions are rejected.
- [ ] Masuk works for a number with no orders and lands on Akun Saya (an empty shell until ticket 27).
- [ ] The OTP screen says the code arrives only on the phone (not WhatsApp Web or Desktop).
- [ ] Tests (Vitest, real Postgres, fake Clock and senders): OTP login creating the account; login of an existing account; SMS fallback timing; session expiry after 90 days; number normalisation.

## Notes

No self-service recovery and no shared family access (spec, Out of Scope).
