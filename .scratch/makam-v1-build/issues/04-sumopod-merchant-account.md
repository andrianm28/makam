# SumoPod merchant account for PT Jaya Korpora Prima

Status: ready-for-human
Spec: Implementation Decisions > Adapter ports > PaymentProvider; Billing > Payment; ADR 0001

## What to build

Open and configure the single collecting payment account in SumoPod for the Operator, so the real PaymentProvider adapter (ticket 61) can be built and tested.

## Acceptance criteria

- [ ] SumoPod merchant account registered to PT Jaya Korpora Prima (KYC complete), settlement to PT JKP's own bank account.
- [ ] VA and QRIS payment methods enabled.
- [ ] Sandbox / test mode credentials available; production API key issued.
- [ ] Webhook endpoint registered for sandbox and production (URL `/api/webhooks/sumopod` on the app hostname from ticket 02), with the Svix signing secret recorded.
- [ ] Confirm and record: payment-link expiry time, the webhook event names for paid / expired, whether a payer reference or metadata field can carry the Nomor Tagihan, and the API docs URL.
- [ ] Secrets `SUMOPOD_API_KEY`, `SUMOPOD_WEBHOOK_SECRET` (sandbox and production) stored as VPS/CI secrets, not committed.

## Notes

SumoPod has no payout or refund API; Pencairan and refunds stay manual in v1 (no action needed here).
