# Real EmailSender adapter (SumoPod SMTP)

Status: resolved
Blocked by: 04 (SumoPod email setup: domain authentication and SMTP credentials) — only for the still-open staging check below
Spec: Adapter ports > EmailSender; Domain modules > 1. Identity & Access (email Kode Masuk); 15. Notifications; Data and privacy; Further Notes > Pre-launch checklist; ADR 0002 (amendment 2026-09-25, later: email goes through SumoPod SMTP)

## What to build

Implement the `EmailSender` port on the **SumoPod SMTP relay**: `smtp.sumopod.com`, port 465, SMTPS (implicit TLS), authenticated with v1's own SMTP credentials from ticket 04, sending from `makam.co.id`. The frozen Laravel app already sends `no-reply@makam.co.id` through this relay. This adapter carries every email of v1:

- the Kode Masuk, at Masuk and at Kirim (ticket 67; the only login since ticket 82);
- Verifikasi email codes (ticket 67);
- every family notification with its Tagihan / Bukti links, and the email copy of each Peringatan Staf (tickets 20, 21);
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

## Comments

- 2026-09-25 — Adapter built (agent, branch of this worktree; not merged, not deployed).
  - **Env contract** (`src/lib/env.ts`, Zod; `.env.example`; runbook `staging.env` table):
    - `SMTP_HOST` (default `smtp.sumopod.com`), `SMTP_PORT` (default `465`);
    - `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` (an email address, e.g. `no-reply@makam.co.id`): **required in staging and production**; `migrate`, `web` and `worker` refuse to start without them, with an error that names the missing key and never prints a value;
    - `EMAIL_FROM_NAME` (default `Makam.co.id`).
    - Development and test need none of these and always use the fake EmailSender, even when they are set. The validated env exposes one `env.smtp` value (`host`, `port`, `user`, `password`, `from { address, name }`), and `readEmailEnv()` reads only these settings, for the CLI.
    - `staging.env` already holds these names (ticket 04). `prod.env` (ticket 65) must add them before the first production deploy.
  - **Adapter** `src/adapters/live/smtp-email-sender.ts` (nodemailer 10):
    - implicit TLS (`secure: true`), TLS 1.2 or later, certificate verified against the system roots; there is no STARTTLS or plaintext path;
    - connection, greeting and DNS timeouts of 15 s each (30 s socket idle limit);
    - one connection per send and no retries;
    - `Message-ID <uuid@makam.co.id>` (on the `EMAIL_FROM` domain) and a `Date` header; the returned `messageId` is that Message-ID;
    - PDF attachments are passed as bytes, and file and URL access is disabled;
    - nodemailer's logger and debug are off.
  - **Errors**:
    - `EmailSendError` is exported from `src/ports/email-sender.ts`. `kind` is `rejected` (the relay answered and refused: an SMTP reply of 4xx or 5xx, `EAUTH` or `EENVELOPE`) or `unavailable` (DNS, connect, TLS or certificate failure, timeout, dropped connection). It also carries `responseCode` and nodemailer's `code`.
    - The message is only `Email tidak terkirim (<kind>: <code> <responseCode>)`. There is no `cause`, no relay reply text, address, code, body or credential, so it is safe for logs and GlitchTip, and nothing in it needs `scrub.ts`.
  - **Composition**: `createAdapters({ appEnv, smtp: env.smtp })` wires `SmtpEmailSender` in staging and production. If `smtp` is missing there, the port is `notConfigured("EmailSender (SumoPod SMTP)")`, never the fake. The web runtime, `seed-admin` and `reset-totp` pass `env.smtp`. The worker builds no adapters yet (Notifications, ticket 20, will).
  - **Contract**: `src/adapters/email-sender.contract.ts` holds the shared assertions. It runs against the fake (`src/adapters/memory/fake-email-sender.test.ts`) and against the live adapter talking to an in-process SMTPS relay (`smtp-server` with a self-signed certificate generated per run, `tests/support/smtp-relay.ts`). No container is needed, and CI runs it inside `npm test`. The automated tests never contact the real SumoPod relay. The fake gained `failNextSend(count)`, which throws `EmailSendError("rejected")` and records nothing.
- **Manual real send after merge** (the ticket's staging check, still open): deploy, then

  ```bash
  cd /opt/makam-v1/staging
  S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
  $S exec worker node dist/email-check.mjs dmarc@makam.co.id
  ```

  It sends `[makam v1] email-check <code>` and prints the relay, the check code and the Message-ID, never the address. The exit code is 0 when the relay accepted it, 1 for `Gagal kirim: …` (codes only), 2 for usage and 78 when settings are missing. In Stalwart, open the raw message and record here that it has a `DKIM-Signature` with `d=makam.co.id; s=trx_ke`, with `dkim=pass`, SPF pass (for SumoPod's return-path domain) and `dmarc=pass`. In development, `npm run email-check -- <to>` does the same with the local `.env` settings (see runbook, "Test email").
- **What ticket 67 needs from this**:
  - Catch `EmailSendError` (both kinds) around `adapters.email.send` for the email Kode Masuk and Verifikasi email codes. Show "gagal kirim", do not count the attempt against the limits, and send exactly once (the adapter never retries).
  - Keep treating `PortNotConfiguredError` the same way. It can still happen when `createAdapters` is called without `smtp` in staging or production.
  - Log or report only `error.kind` / `error.code` / `error.responseCode`, never the address or the code.
  - Tests use `FakeEmailSender.failNextSend()` to drive the "gagal kirim" path.
  - If 67 builds adapters in new entry points, pass `smtp: env.smtp`.
- Still open under this ticket: the real send on staging and its header check (above), and whether SumoPod offers bounce reporting. Ticket 04 records where SumoPod's relay processes mail: in Indonesia, `ip03.s01.kirimemail.com`.
- 2026-09-26 — ADR 0004: **this adapter is a launch requirement**: email is the only channel to families and the only login, so production (ticket 65, now blocked by 68) cannot go live without it. The "Kirim lewat email" fallback no longer exists.
- 2026-09-27 — **Verified on `main`, no code changes needed**: the adapter described above (`src/adapters/live/smtp-email-sender.ts`, the `EmailSender` port with `EmailSendError`, `src/adapters/email-sender.contract.ts`, `tests/support/smtp-relay.ts`, the `SMTP_*`/`EMAIL_FROM*` env contract in `src/lib/env.ts` and `.env.example`, `email-check` CLI, and the composition/CLI wiring passing `env.smtp`) was already committed to `main` (present since the repo's initial history, an ancestor of `origin/main`) and matches every acceptance criterion here except the staging real-send check. Re-ran the full checks on branch `ticket-68-smtp-emailsender` (from fresh `origin/main`): `npm run lint` clean, `npm run typecheck` clean, `npm run test:shared` 1162/1164 passing (the 2 failures are the known environment-only ones unrelated to this ticket: `tests/tooling/deps-store.test.ts` and `src/adapters/live/chromium-pdf-renderer.test.ts`); the `EmailSender contract` suite passes against both the fake and the real adapter over the in-process SMTPS test relay, and `src/cli/email-check-command.test.ts` passes. Identity & Access (ticket 67, resolved) already routes the email Kode Masuk, Verifikasi email and Undangan Staf through this port and shows "gagal kirim" on `EmailSendError`/`PortNotConfiguredError`. No new npm package was needed. **Human steps still open** (blocked by ticket 04, matches ticket 61's pattern): after a staging deploy with real `SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`, run the `email-check` command against an Operator address per the runbook ("Test email" section) and record here whether the message shows `DKIM-Signature d=makam.co.id; s=trx_ke` with `dkim=pass`, and SPF/DMARC pass; also confirm with SumoPod whether they offer bounce reporting (still unconfirmed).
