# Layanan order at a Lokasi Mitra and Admin Lokasi fulfilment

Status: ready-for-agent
Blocked by: 19, 23, 34, 49
Spec: Domain modules > 9. Layanan (Order, Pekerjaan Layanan); 10. Billing (standalone Layanan due); 14. Work Queues (Layanan rows, Tier 2 Terlambat); 16. Scheduler (Terlambat flags); stories 84, 86, 91, 92, 93, 131 (proof → Selesai)

## What to build

Anyone may order Layanan for a non-Berakhir Petak Makam at a Lokasi Mitra found by the hub lookup, without being the Pemegang Hak. One order = one grave with one or more Layanan: choose a fixed-price variant, fill text fields, pick a target date that respects the lead time. A pay-first Tagihan (items + one Biaya Layanan Platform) is due at the earlier of 24 h after issue or the last lead-time day (target date minus the lead time, 23:59 WIB); payment schedules one Pekerjaan Layanan per Layanan (Dijadwalkan). The Admin Lokasi fulfils from Antrean Lokasi rows (Layanan due today in Mendesak; upcoming / Terlambat in Lainnya), taking before/after photos in-app with a timestamp (video for the Laporan), which marks it Selesai and sends the proof link to the Pemesan. The Pemesan can cancel until H-1 or until it starts, with the item refunded and the platform fee kept.

## Acceptance criteria

- [ ] Ordering is blocked for a Berakhir Hak Pakai; a Hak Pakai flagged Perlu Verifikasi must be completed by the Admin Lokasi before its first Layanan is scheduled.
- [ ] The target date picker disallows dates inside the lead time; the target is a window of ±2 days.
- [ ] Statuses Menunggu Pembayaran → Dijadwalkan → Sedang Dikerjakan → Selesai, plus Terlambat, Dibatalkan and Keluhan.
- [ ] Proof is captured through the browser camera in-app (no gallery upload), timestamped; required photos/video per the catalog must be present before Selesai.
- [ ] Terlambat tick: target + 2 days with no proof; flagged to the Admin Lokasi (row) and Admin Platform (Tier 2 row).
- [ ] Cancel until H-1 or until Sedang Dikerjakan: item refunded, Biaya Layanan Platform kept (refund via ticket 31).
- [ ] A Terlambat job cancelled for lateness: full refund including the Biaya Layanan Platform.
- [ ] The checkout has an optional email field, saved on the account and used only for Tagihan / Bukti copies (as ticket 22).
- [ ] Tests: lead time; due-date rule; scheduling on payment; Terlambat timing; cancellation windows and refund amounts; proof gating.
