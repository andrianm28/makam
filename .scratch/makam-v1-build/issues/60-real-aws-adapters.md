# Real FileStore (S3 Jakarta) and EmailSender (SES Jakarta) adapters, and the email OTP fallback

Status: ready-for-agent
Blocked by: 03, 08, 63
Spec: Adapter ports > FileStore, EmailSender; Domain modules > 1. Identity & Access (OTP fallback); 17. Pengaturan Operator (CS number); Implementation Decisions > Architecture (files); Data and privacy; story 27; ADR 0003 (amendment 2026-09-25)

## What to build

Implement the FileStore port on AWS S3 in `ap-southeast-3` (upload via presigned PUT, short-lived signed GET URLs, delete) and the EmailSender port on SES in the same region (document copies, fallback emails with the Tagihan / Bukti link, and the login OTP email). Select them by env in the composition root; the in-memory fakes stay the default for tests.

Add the login OTP fallback to ticket 08's OTP component: about 60 s after the WhatsApp OTP, "Kirim lewat email" sends the same kind of OTP through EmailSender to the email on the number's existing account. With no email on record, the component instead points to the CS WhatsApp number from Pengaturan Operator. There is no SMS. The fallback logic is built and tested against the EmailSender fake; it goes live once SES from ticket 03 is set up.

## Acceptance criteria

- [ ] Uploads go directly from the browser to the private bucket via presigned URLs with a content-type and size limit; the app stores only the object key.
- [ ] Signed GET URLs expire within minutes (value documented); no object is public.
- [ ] Delete removes the object (versioning keeps history per bucket policy).
- [ ] SES sends from the verified domain; bounces/complaints are logged in the message log as gagal.
- [ ] "Kirim lewat email" is disabled until ~60 s after the WhatsApp OTP was sent, is offered only when the number already has an account with an email on record, and sends the OTP through EmailSender. An email typed on the same "Data & kirim" screen for a number with no account yet does not enable it.
- [ ] Without an email on record, the screen shows no email button and points to the CS WhatsApp number (from Pengaturan Operator).
- [ ] A contract test suite runs the same assertions against the fake and (when credentials are present) the real adapters.
- [ ] Tests (Vitest, real Postgres, fake Clock and senders): email fallback timing; fallback offered only for an account with an email; CS pointer without one; a staff account (email required at invite, ticket 09) always gets the fallback; login through the email OTP.
- [ ] No personal data in logs or GlitchTip from either adapter.
