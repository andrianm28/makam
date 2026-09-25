# SumoPod merchant account and email (SMTP relay) for PT Jaya Korpora Prima

Status: ready-for-human
Spec: Implementation Decisions > Adapter ports > PaymentProvider, EmailSender; Billing > Payment; Architecture (cutover); Data and privacy; Further Notes > Pre-launch checklist; ADR 0001; ADR 0002 (amendment 2026-09-25, later)

## What to build

Configure the single collecting payment account in SumoPod for the Operator, so the real PaymentProvider adapter (ticket 61) can be built and tested. The merchant account already exists and is live: the frozen Laravel app uses it today.

## Acceptance criteria

- [ ] Confirm the existing SumoPod merchant account is registered to PT Jaya Korpora Prima (KYC complete), with settlement to PT JKP's own bank account; record the answer.
- [ ] VA and QRIS payment methods enabled (confirm on the existing account).
- [ ] `PAYMENT_MERCHANT_REF` and `PAYMENT_BADAN_USAHA_REF` already exist in `/opt/makam/compose/.env.beta`; copy them into v1's production env on the VPS.
- [ ] The API key and the webhook signing secret: not found in any env file on this host. Fetch them from the SumoPod dashboard (or from wherever the old app stores them) and store them as `SUMOPOD_API_KEY` and `SUMOPOD_WEBHOOK_SECRET` (sandbox and production) in VPS/CI secrets. Never write their values in this ticket, the repo or any doc.
- [ ] Sandbox / test mode credentials available.
- [ ] v1's own webhook URL `https://makam.co.id/api/webhooks/sumopod` registered for production (and a sandbox URL for testing), with its Svix signing secret stored as above.
- [ ] Record how v1's webhook coexists with the old app's until the cutover (ticket 07): whether SumoPod allows more than one webhook URL per account; which URL and path the old app's webhook uses today; and, since nginx sends all of `makam.co.id` to the old app until the switch, whether `/api/webhooks/sumopod` is routed to v1 before the switch or v1's URL is registered at the switch. Also record what happens to old-app payments still open at the switch.
- [ ] Confirm and record: payment-link expiry time, the webhook event names for paid / expired, whether a payer reference or metadata field can carry the Nomor Tagihan, and the API docs URL.

## Notes

SumoPod has no payout or refund API; Pencairan and refunds stay manual in v1 (no action needed here). v1 acknowledges and ignores webhook events that match no v1 Tagihan (ticket 61), so events for the old app's payments do no harm.

## Amended (2026-09-25, decided with the user)

- Sandbox credentials are used by staging (`dev.makam.co.id`) until the switch; the webhook-coexistence question is resolved: v1 production registers its live webhook only on the switch day, so the old app's live webhook is never shared or split.

## Amended (2026-09-25, later): email through the SumoPod SMTP relay

SES is dropped from v1. Every email from v1 goes through SumoPod's SMTP relay (`smtp.sumopod.com`, port 465, SMTPS): login codes, Verifikasi email codes, Tagihan / Bukti copies and Undangan Staf. The adapter is ticket 68 and waits on this checklist, and email login (ticket 67) goes live with it. The self-hosted Stalwart on this host is for human mailboxes only.

**Facts checked on 2026-09-25:**
- `makam.co.id` has no SPF, DKIM, DMARC or MX record today.
- The frozen Laravel app already sends as `no-reply@makam.co.id` through `smtp.sumopod.com:465` (SMTPS), so its mail goes out unauthenticated for the domain.
- For how this was done for `fundforindonesia.org` (the SumoPod "Custom Domain" tab, the 3 generated records, SPF `include:spf.kirim.email`), see `/home/ubuntu/mail-setup/STATUS.md` and `/home/ubuntu/mail-setup/RELAY-fundforindonesia.md`.

**Human checklist (email):**
- [ ] In the SumoPod dashboard, "Custom Domain" tab: add `makam.co.id`.
- [ ] Publish the 3 records it generates, copying the values from the dashboard (they cannot be guessed):
  - [ ] the DKIM TXT at `<selector>._domainkey.makam.co.id`;
  - [ ] the SPF TXT at `makam.co.id`: `v=spf1 include:spf.kirim.email ~all`. There is no SPF today. If one is added before this, merge the two into a single SPF record, because a domain may have only one;
  - [ ] the `sumo-verification=…` TXT at `makam.co.id`.
- [ ] Add DMARC at `_dmarc.makam.co.id`: `v=DMARC1; p=none; rua=mailto:<address>` to start (choose the report address and record it). Tighten to `quarantine` later, once the reports show only SumoPod sending.
- [ ] Click "Verify DNS settings" in the dashboard until all 3 show verified.
- [ ] Provide SMTP credentials for v1, preferably separate from the old app's, and store them on the VPS as `SMTP_USER` / `SMTP_PASSWORD` for staging and production (ticket 68). Never write them in this ticket, the repo or any doc.
- [ ] Choose and record v1's sender address (e.g. `no-reply@makam.co.id`, as the old app uses, or another address on `makam.co.id`) and display name "Makam.co.id".
- [ ] Record under `## Comments`: the DKIM selector; the date each record was verified; whether SumoPod offers bounce / complaint reporting; any sending limits on the account; and where SumoPod's relay processes mail (the country of its servers), for the spec's Data and privacy section.
- [ ] After the records are verified, check whether an email from the old app now passes SPF and DKIM too (it sends from the same domain through the same relay) and record the answer. A DMARC policy stricter than `p=none` must wait until it does.
