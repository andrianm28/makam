# SumoPod merchant account for PT Jaya Korpora Prima

Status: ready-for-human
Spec: Implementation Decisions > Adapter ports > PaymentProvider; Billing > Payment; Architecture (cutover); ADR 0001

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
