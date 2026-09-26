# Payment through the PaymentProvider port and Bukti Pembayaran

Status: ready-for-agent
Blocked by: 18
Spec: Adapter ports > PaymentProvider; Domain modules > 10. Billing (Payment, Bukti Pembayaran); Testing Decisions > End-to-end 2; stories 35, 36 (Bukti Pembayaran)

## What to build

The pay page of a Tagihan, usable by anyone with the link (VA or QRIS): clicking Bayar asks the PaymentProvider to create a payment for the Tagihan, re-creating it if the provider's link expired; the platform's due date is independent of the link's. A route handler receives the webhook, verifies the Svix signature, parses it and processes it idempotently. A settled payment marks the Tagihan Lunas, issues exactly one Bukti Pembayaran and fires the downstream-effect hook that later tickets register on (Bukti Pemesanan, Pencairan due, Pekerjaan Layanan scheduled, Hak Pakai extended or created).

## Acceptance criteria

- [ ] Bayar creates a provider payment on first click and reuses it while valid; after the link expires, Bayar creates a new one.
- [ ] A lapsed (Dibatalkan) Tagihan can't be paid; a pay-after Tagihan that is Lewat Jatuh Tempo or Tidak Tertagih stays payable.
- [ ] The webhook rejects a bad signature; the same event delivered twice yields one Lunas transition and one Bukti Pembayaran.
- [ ] Bukti Pembayaran repeats the Tagihan's lines plus amount, method, time, reference and Nomor Tagihan.
- [ ] A downstream-effect registry runs inside the same transaction as the Lunas transition (or enqueues jobs in it); a failing effect doesn't lose the payment.
- [ ] Tests: Vitest with the fake provider (create, expiry re-create, signed webhook, duplicate webhook); Playwright E2E: a signed webhook payload posted to the running app marks a Tagihan Lunas and the Bukti Pembayaran page appears.

## Notes

The real SumoPod adapter is ticket 61. No payout or refund methods on the port in v1.

## Comments

- 2026-09-26 — Decided with the user after the Spec re-review: late payments are judged by the provider's `paidAt` against `dueAt` (spec, Billing), not by the lapse tick's timing; the same for manual payments.
- 2026-09-26 — User decision: online payment in v1 is QRIS only (Bank Indonesia caps QRIS at Rp 10.000.000 per transaction); a Tagihan above that shows no Bayar button but the Operator's bank account for a transfer, recorded by Admin Platform as a manual payment (ticket 30); no Virtual Account in v1.
- 2026-09-26 — User decision (supersedes the same-day manual-transfer note): v1 takes no order whose Tagihan would exceed Rp 10.000.000 (QRIS cap); see spec, Billing. Bayar and issuing refuse a Tagihan above it.
