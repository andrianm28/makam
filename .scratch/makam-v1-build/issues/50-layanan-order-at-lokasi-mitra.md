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
- [ ] The checkout's email follows ticket 22 (required unless logged in, proven by a Kode Masuk). _(Amended 2026-09-26, ADR 0004; was an optional email for copies.)_
- [ ] Tests: lead time; due-date rule; scheduling on payment; Terlambat timing; cancellation windows and refund amounts; proof gating.

## Comments

- 2026-09-28 — **Owner decision, settled: only Berakhir blocks a Layanan order; `dibatalkan` does not.** Ticket 50 made `dibatalkan` block the order so no further Layanan could be added, while the AC named only **Berakhir**. The owner chose the AC: an order whose one job was cancelled may still take another Layanan. The reasoning that decided it is the asymmetry — with a one-way block, **one** failed service prevents **every other** service the family has already paid for, which is the wrong way round for a family that has committed money.

  The rest of the cancellation shape in ticket 50 is recorded here because it is a **consequence, not a decision**, and nobody should read the order status as if it were finished: cancellation there is **per job only**. There is no order cancellation at all, the order status never leaves `terbayar` (`pembayaran.ts` is its only writer), the Tagihan is only read, and no money moves. And `payouts` on `main` has **zero** references to `pekerjaan_layanan` across its ten files, so a paid-then-cancelled Layanan and the Pencairan module **cannot see each other**. That is a real gap with real tickets, and it is recorded as a gap rather than as something ticket 50 should have solved.

  A second finding from the same review is a defect rather than a question, and it is why ticket 50 is not yet merged: the **`perluVerifikasi` gate on a Layanan order had no exit**. Nothing in the domain could clear it, so a plot that entered "Perlu Verifikasi" could never leave — the AC was satisfied literally, by a gate that can never be opened. The fix adds the public function and, more importantly, **a test of the round trip** rather than another test of the block.

- 2026-09-26 — ADR 0004: the checkout email is required and proven by the Kode Masuk (ticket 22); family messages go by email.
