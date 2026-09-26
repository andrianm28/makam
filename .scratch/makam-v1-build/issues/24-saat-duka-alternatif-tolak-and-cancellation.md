# Saat Duka alternatif, Tolak and cancellation

Status: ready-for-agent
Blocked by: 23
Spec: Domain modules > 6. Pemesanan (Saat Duka: Tawarkan alternatif, Tolak, cancellation); 14. Work Queues (Tier 1 Saat Duka ditolak); Public site > After a Tolak; stories 31, 32, 33, 34, 118

## What to build

The exits from a Saat Duka order. The Admin Lokasi can Tawarkan alternatif (another Jenis Makam or day) or Tolak with a reason from a fixed list. The Pemesan accepts or declines an alternative with one tap, seeing the new all-in total; declining becomes a Tolak. A Tolak sends the Pemesan an email with a link to the Pilih makam list with a banner, the rejecting Lokasi removed, their data prefilled and TPUs included, and creates a Tier 1 "Saat Duka ditolak" row for Admin Platform to phone the family within 2 h. The Pemesan can cancel before the burial (a reason is required once confirmed); the Admin Lokasi can record a cancellation on the family's behalf.

## Acceptance criteria

- [ ] Tolak reasons come from a fixed list; the order becomes Ditolak; declines are counted on the Lokasi.
- [ ] An alternative shows the new all-in total from `quote()`; accept moves the order on with the new Jenis Makam / day (and the confirmation deadline logic still applies); decline makes it Ditolak.
- [ ] The rebook link opens Pilih makam with a banner, without the rejecting Lokasi, with the Pemesan and Almarhum data prefilled and the TPU section included (when ticket 44 exists).
- [ ] Tier 1 "Saat Duka ditolak" row with a 2 h deadline; closes when the call is logged.
- [ ] Cancel before confirmation: nothing billed, order Dibatalkan.
- [ ] Cancel after confirmation (before the burial, reason required): order Dibatalkan, Hak Pakai Dibatalkan, Petak back to Tersedia, the Tagihan Dibatalkan; any payment already made is refunded except the Biaya Layanan Platform (a refund request to ticket 31's flow); no cancellation fee.
- [ ] Tests: each transition; decline-of-alternative = Tolak; cancellation effects before/after confirmation; the rebook link's prefilled data and excluded Lokasi.

## Notes

Hari-H Layanan refunds on cancellation (unless Sedang Dikerjakan) are ticket 53. Refund approval and transfer are ticket 31; until then this ticket records the refund request.

## Comments

- 2026-09-26 — ADR 0004: the Tolak link goes by email (and is on the order page), not WhatsApp; for an order with no email the Tier 1 "Saat Duka ditolak" call is the only channel.
