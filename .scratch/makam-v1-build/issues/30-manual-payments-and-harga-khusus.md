# Manual payments, direct payment to the Lokasi and Harga Khusus

Status: ready-for-agent
Blocked by: 25
Spec: Domain modules > 10. Billing (Payment: manual, direct, Rp 0); 11. Payouts (Harga Khusus, Dibayar langsung); stories 134, 163, 164

## What to build

The payment paths outside the provider. Admin Platform marks a Tagihan paid by hand (Transfer manual / Tunai) with an uploaded proof. The Admin Lokasi records "Dibayar langsung ke Lokasi Mitra" with proof when a family paid the Lokasi directly; Admin Platform can reverse it. Admin Platform sets a Harga Khusus on an order, which cancels and reissues the Tagihan with a negative "Penyesuaian Harga Khusus" line; a resulting Rp 0 Tagihan is Lunas at once. Each path issues exactly one Bukti Pembayaran and runs the same downstream effects as a provider payment.

## Acceptance criteria

- [ ] Manual payment requires a proof file; the Bukti Pembayaran shows method Transfer manual or Tunai; audited.
- [ ] Direct payment: the Bukti Pembayaran reads "diterima oleh Lokasi Mitra X"; it records that no tariff Pencairan is due and a platform-fee Potongan is owed (consumed by ticket 32); reversible by Admin Platform only, audited.
- [ ] Harga Khusus: Admin Platform only, with a reason; the Tagihan is reissued (never edited) with a negative line. Admin Platform may enter on the order the partner share (the amount the Lokasi Mitra agreed to bear) with a required note; default 0, in which case the Operator bears the whole reduction (from the Biaya Layanan Platform first, then its own funds). A non-zero partner share lowers that order's Pencairan (ticket 32); audited.
- [ ] A Rp 0 Tagihan becomes Lunas immediately with method "Tanpa pembayaran (Harga Khusus)".
- [ ] Each path fires the downstream-effect registry once (e.g. Bukti Pemesanan issued).
- [ ] Tests: each method's Bukti Pembayaran wording; direct-payment reversal; Harga Khusus reissue and Rp 0 waiver; partner share requires a note and defaults to 0; immutability preserved.

## Comments

- 2026-09-26 — From ticket 18 review (user decision): a reissued Tagihan keeps the original due date. So Admin Platform cannot reissue (e.g. add a Harga Khusus to) a pay-first Tagihan that is already past its due date: the action is refused with a clear message, and the order is placed again instead. A Rp 0 Tagihan is already Lunas at issue (ticket 18).
- 2026-09-26 — User decision: online payment in v1 is QRIS only (Bank Indonesia caps QRIS at Rp 10.000.000 per transaction); a Tagihan above that shows no Bayar button but the Operator's bank account for a transfer, recorded by Admin Platform as a manual payment (ticket 30); no Virtual Account in v1.
