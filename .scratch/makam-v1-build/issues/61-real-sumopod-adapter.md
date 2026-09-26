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

## Comments

- 2026-09-26 — Research (read-only; no code changed). SumoPod has **no public docs site** (`docs.sumopod.com` does not resolve). The authoritative text is the dashboard's "Managed Payment > Quick Start" guide, which ships in SumoPod's public frontend bundle (`https://sumopod.com/assets/Wallet-*.js`, read 2026-09-26). Its content matches the old app's ADR-0033. No secrets were read.
  - **Hosts and auth**: live `https://api-pay.sumopod.com`, sandbox `https://api-pay-sandbox.sumopod.com`. Both base URLs come from the bundle, and an unauthenticated call to either returns 401. Auth is the `X-Api-Key: <project key>` header. API keys, the webhook URL and the signing secret all belong to a SumoPod **project**, and each project has exactly one webhook URL.
  - **Create**: `POST /api/v1/payments` with a JSON body `{order_id, amount (integer, whole rupiah), currency:"IDR", expires_in_hours? (default 24, max 24), success_return_url?, cancel_return_url?, payment_method_type_code? (e.g. "QRIS", codes from the dashboard's "Supported Payment Methods")}`. The response is `{payment_id (uuid), order_id, amount, fee, net_amount, payment_link_url (https://pay.sumopod.com/pay/<uuid>), status:"pending", expires_at (ISO, Z)}`, plus `payment_code`, `payment_code_type` (e.g. `ACCOUNT_NUMBER`) and `payment_channel_used` (e.g. `BRI.VA`) only for "direct pay-in", i.e. when a method code is sent. Port mapping: `providerPaymentId=payment_id`, `paymentUrl=payment_link_url`, `expiresAt=expires_at`, `reference→order_id`.
  - **There is no status-lookup, cancel, refund or payout endpoint in the public API.** Cancel and "Simulate" exist only in the dashboard. The webhook is the only source of truth.
  - **Webhook**: POST `{event_type, data:{payment_id, order_id, amount, fee, net_amount, status, payment_method, paid_at, settled_at, completed_at}}`. The events are `payment.completed`, `payment.failed`, `payment.expired` and `payment.test` (the Settings "Save & Test" button). Map them to our port as `completed→paid`, `failed→failed` and `expired→expired`. Answer `payment.test` with 2xx and ignore it. Statuses: pending, completed, failed, expired, cancelled.
  - **Paid time: use `data.paid_at`, never `completed_at`.** The guide says `paid_at` is the moment the customer paid, `settled_at` is the estimated settlement (T+2), and `completed_at` "equals settled_at for backward compatibility". Late-payment judgement (ticket 19, `paidAt` vs `dueAt`) must use `paid_at`. **The port needs a change**: `PaymentEvent.occurredAt` should become (or gain) `paidAt`, and the event should also carry the method/channel for the Bukti.
  - **Channel for the Bukti**: `data.payment_method` is a *category*, not a bank. The values seen are `qris`, `bank_transfer`, `e_wallet`, `card`, and anything else is shown raw. Proposed labels: `qris`→"QRIS", `bank_transfer`→"Virtual Account" (or "Transfer Bank"), `e_wallet`→"E-Wallet", unknown→the raw value. The VA **bank** is known only from `payment_channel_used` (e.g. `BRI.VA`) when *we* choose the method via `payment_method_type_code`. Options: (a) keep the hosted checkout picking the method and accept a Bukti without the bank name, unless the sandbox shows extra webhook fields; (b) let the payer pick the method on our page, pass the code, and store `payment_channel_used`.
  - **Signature (Svix scheme)**: read the headers `svix-id`, `svix-timestamp` and `svix-signature`. Take the key as base64-decode(secret without the `whsec_` prefix), compute HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` and base64 it. Then compare it in constant time against each space-separated `v1,<sig>` entry. For about 24 h after a secret rotation ("roll"), two signatures are sent. Reject a timestamp more than 5 minutes off (Svix guidance, and what our `src/adapters/shared/svix.ts` already does). Use the **raw** body. Do not use the alternative `X-Webhook-Token: whtok_…` shared token, because it gives no freshness or replay protection. `svix-id` is the `eventId`.
  - **Delivery and retries**: SumoPod requires a 2xx within **10 s**. Otherwise it "marks the webhook failed; it can be resent from the Webhooks tab" (the dashboard keeps webhook logs with a Resend button). The guide promises **no automatic retry**. Svix-hosted delivery would retry (immediately, then 5 s, 5 m, 30 m, 2 h, 5 h, 10 h, 10 h), but whether SumoPod uses Svix's service or only its signing format is unknown. Keep the handler fast (verify, record, enqueue), and plan an alert plus a manual-resend runbook.
  - **Sandbox**: in the Wallet sandbox/live mode toggle, create a payment and use dashboard "Simulate Payment". For hosted checkout, open the link and choose a channel first, then wait, because it can fail if run too soon. Use "Save & Test" to send `payment.test`. Staging needs its own sandbox project key and secret (`SUMOPOD_API_KEY`, `SUMOPOD_WEBHOOK_SECRET` per ticket 04).
  - **Gaps to confirm with SumoPod or in the sandbox**: (1) is `order_id` required to be unique? This decides whether a re-created payment after expiry can reuse the Nomor Tagihan or needs a suffix such as `<Nomor>-2`. (2) Is `svix-id` stable across a dashboard Resend? If not, idempotency must also key on `payment_id` plus the event kind. (3) Are there automatic retries? (4) Can one merchant have several projects (a separate v1 project would separate v1's webhooks and keys from the old app's, which bears on ticket 04)? (5) Can `completed` arrive after `expired` or cancel? The dashboard warns that a direct-pay-in VA/QR "will still complete and be honored" after a cancel, so an expired link is not proof of non-payment, and a late `paid` must go to Pembayaran Perlu Ditinjau. (6) Is `amount` in the webhook the gross amount (it appears to be; `fee`/`net_amount` are separate)? (7) Does the webhook carry the VA bank anywhere? (8) Rate limits: none documented. (9) Does the live contract equal the sandbox's? The old app assumed so (its ADR-0036) but never verified it.
  - **Lessons from makam-app** (`app/Platform/Payment/…`, read only):
    - It parses `completed_at` as the event time, which is actually the T+2 settlement time. Do not copy this.
    - A feature built on a guessed status endpoint returned real 404s in production and was reverted. Build nothing against guessed endpoints.
    - Its Svix verifier was never exercised against a real sandbox delivery, so the "sandbox run records one paid webhook" criterion is new ground.
    - It sent the same order reference for every session. With more than one live link per order, a double payment is possible, and it was caught only at settlement. Reuse the link while it is valid (ticket 19), and handle a second `paid` for an already-Lunas Tagihan as Perlu Ditinjau or a refund.
    - It has the env var typo `SUMODOP_SANDBOX_*`.
    - Amounts are whole rupiah. Refuse fractional values rather than round them.
    - It keeps the old secret while rotating one.
  - **Sources**:
    - SumoPod dashboard Quick Start and Webhooks settings, as served in `https://sumopod.com/assets/` (`Wallet-*`, `WalletPayments-*`, `WebhookSection-*`, `WalletWebhooks-*`, `index-*`).
    - Svix manual verification: https://docs.svix.com/receiving/verifying-payloads/how-manual
    - Svix retries: https://docs.svix.com/retries
    - makam-app `docs/adr/0033-*.md`, `docs/adr/0036-*.md`, `app/Platform/Payment/Checkout/SumoPodPaymentClient.php`, `app/Platform/Payment/Providers/SumoPodWebhookSignature.php`, `app/Platform/Payment/WebhookEnvelope.php`.
- 2026-09-26 — Decided with the user: the live adapter maps SumoPod's `paid_at` (not `completed_at`, which is the settlement time) to the port's `paidAt`, used by the late-payment rule. Payment method: see the pending QRIS decision (index, 2026-09-26).
