# Refunds and Bukti Pengembalian Dana

Status: ready-for-agent
Blocked by: 24
Spec: Domain modules > 10. Billing (Refunds, Biaya Layanan Platform table, Documents); 14. Work Queues (Tier 3 refund transfers); story 161

## What to build

One refund flow for the whole platform. A refund request (from a cancellation, a Keluhan, a Pembatalan, a PTSP rejection, Berhenti leftovers or a goodwill decision) names the Tagihan, the lines refunded and whether the Biaya Layanan Platform is refunded under the fault rule. Admin Platform approves every refund, then transfers by hand, uploads the proof and enters the date, which issues a Bukti Pengembalian Dana and sets the Tagihan to Dikembalikan sebagian / penuh. A Tier 3 row tracks the transfer (due 2 working days after approval). Each refund records whether it is netted from the partner (a Potongan when the amount was already paid out) or Operator-funded (goodwill, never netted).

## Acceptance criteria

- [ ] Biaya Layanan Platform: kept when the Pemesan cancels; refunded when the fault lies with the Lokasi, the Mitra Jasa or the Operator (Terlambat cancellation, Berhenti leftovers).
- [ ] No money leaves without an Admin Platform approval; approval and transfer are audited.
- [ ] Tier 3 "refund transfer" row appears on approval with a 2-working-day deadline (Admin Platform calendar, ticket 11) and closes when the proof is uploaded.
- [ ] Bukti Pengembalian Dana `RFD/YYYY/NNNNNN` references the Tagihan, lists the refunded lines, says whether the Biaya Layanan Platform was kept, attaches the transfer proof, and its link is sent to the Pemesan.
- [ ] The refund's destination bank account is entered by the Pemesan (or recorded by Admin Platform) before transfer.
- [ ] If the partner's share was already paid out, a Potongan is recorded for that Lokasi Mitra (consumed by ticket 32); goodwill refunds never create a Potongan.
- [ ] Tests: Biaya Layanan Platform rule per case; Tagihan status after partial and full refund; netted vs Operator-funded; the Saat Duka cancellation refund from ticket 24 flows through.

## Notes

"Working days" are Admin Platform working days: Monday–Friday minus national holidays (ticket 11).

## Comments

- 2026-09-26 — From ticket 19's review (user decision): a "Pembayaran Perlu Ditinjau" (money Billing couldn't settle; public Billing query) is resolved here, usually by a refund approved by Admin Platform; resolving it closes its Antrean row (ticket 17).
