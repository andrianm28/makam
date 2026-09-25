# Real EmailSender adapter (SumoPod SMTP)

Status: ready-for-agent
Blocked by: 04 (SumoPod email setup: domain authentication and SMTP credentials)
Spec: Adapter ports > EmailSender; Domain modules > 1. Identity & Access (email Kode Masuk); 15. Notifications; Data and privacy; Further Notes > Pre-launch checklist; ADR 0002 (amendment 2026-09-25, later: email goes through SumoPod SMTP)

## What to build

Implement the `EmailSender` port on the **SumoPod SMTP relay**: `smtp.sumopod.com`, port 465, SMTPS (implicit TLS), authenticated with v1's own SMTP credentials from ticket 04, sending from `makam.co.id`. The frozen Laravel app already sends `no-reply@makam.co.id` through this relay. This adapter carries every email of v1:

- the email Kode Masuk (email login and the "Kirim lewat email" fallback, ticket 67);
- Verifikasi email codes (ticket 67);
- Tagihan / Bukti copies and the document-message fallback (ticket 20);
- Undangan Staf (ticket 20).

Select it by env in the composition root. It replaces today's `notConfigured("EmailSender (SES)")`. The in-memory fake stays the default for tests and development. The app never sends through the self-hosted Stalwart on this host: Stalwart is for human mailboxes only. There is no AWS dependency.

## Acceptance criteria

- [ ] Env: `SMTP_HOST` (default `smtp.sumopod.com`), `SMTP_PORT` (default 465), `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` (address and display name "Makam.co.id"; the address is recorded in ticket 04). These are required in staging and production and added to `.env.example`. Secrets live only on the VPS, never in the repo or a ticket.
- [ ] Connects with implicit TLS on 465 and verifies the certificate; never falls back to plaintext.
- [ ] `send()` supports `to`, subject, text, optional HTML and attachments (PDF copies), and returns the relay's message id.
- [ ] An SMTP rejection or connection failure throws a typed error that callers can handle: Identity & Access shows "gagal kirim"; Notifications records gagal and applies its retry rules (ticket 20). Nothing retries inside the adapter.
- [ ] A contract test suite runs the same assertions against the fake and, when SMTP credentials are present, the real adapter (sending to an address set by env).
- [ ] A one-off check on staging sends a real email to an Operator address and records under `## Comments` that the headers show a DKIM signature for `makam.co.id` and that SPF and DMARC pass.
- [ ] No email addresses, codes or bodies in logs or GlitchTip.
- [ ] Update the `EmailSender` port's doc comment, which still says Amazon SES.

## Notes

- Bounces that arrive later go to the envelope sender; v1 has no bounce webhook. Only rejections at send time are recorded as gagal. Record in Comments whether SumoPod offers bounce reporting.
- Moved here from ticket 60 on 2026-09-25 (the SES EmailSender), rewritten for SumoPod SMTP.
