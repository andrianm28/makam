# Real SumoPod PaymentProvider adapter

Status: ready-for-agent
Blocked by: 04, 19
Spec: Adapter ports > PaymentProvider; Domain modules > 10. Billing (Payment)

## What to build

Implement the PaymentProvider port on SumoPod: create a payment (VA / QRIS) for a Tagihan when the payer clicks Bayar, re-create it when the link has expired, and verify and parse webhooks with the Svix signature into the port's payment events, processed idempotently by ticket 19's handler. No payout or refund methods.

## Acceptance criteria

- [ ] The Nomor Tagihan (or an internal id) is carried to SumoPod so a webhook maps to exactly one Tagihan.
- [ ] Expired links are detected and a new payment is created on the next Bayar.
- [ ] Webhook signature verification uses the Svix secret; bad signatures are rejected with 4xx and logged without bodies.
- [ ] Contract tests run the same scenarios as the fake; a sandbox run records one paid webhook end to end.
- [ ] Amount mismatches between the webhook and the Tagihan are refused and raised to GlitchTip (no PII).
- [ ] Webhook events that match no v1 Tagihan (e.g. the frozen Laravel app's payments on the same SumoPod account, ticket 04) are acknowledged with 2xx and ignored, logged without bodies.

## Amended (2026-09-25)

- [ ] Configurable per environment: sandbox on staging, live on production (live keys installed on the switch day, ticket 07).
