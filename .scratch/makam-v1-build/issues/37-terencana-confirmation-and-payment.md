# Terencana confirmation, payment hold and Aktif

Status: ready-for-agent
Blocked by: 23, 32, 36
Spec: Domain modules > 6. Pemesanan (Terencana statuses); 10. Billing (Terencana pay-first); 11. Payouts (Terencana Hak Pakai); 14. Work Queues (Konfirmasi Terencana, Tier 3 terlambat); 15. Notifications (hold reminder); 16. Scheduler (expire holds, Masa Pembatalan ends); stories 46, 47, 49, 121

## What to build

The Admin Lokasi confirms or declines a Terencana order from a Konfirmasi Terencana row (Lainnya) due by the end of the Lokasi's next working day, with no automatic cancel; a Tier 3 "Konfirmasi Terencana terlambat" row appears for Admin Platform when it's late. Confirming starts the hold (Lokasi policy, default 24 h) and issues a pay-first Tagihan due at hold expiry, with a reminder about 4 h before it ends. Payment makes the order Aktif with one Hak Pakai per Petak / Kavling Keluarga (same Pemegang Hak, Syarat snapshot attached) and issues the Bukti Pemesanan. Lapse makes it Dibatalkan ("batas pembayaran lewat") and releases the plots; the Pemesan may withdraw free any time before paying; a decline returns the Pemesan to the Lokasi step. Register the Terencana Pencairan trigger.

## Acceptance criteria

- [ ] Konfirmasi Terencana row deadline = `nextWorkingDayEnd` from submission; the Tier 3 row appears after it; neither cancels the order.
- [ ] Confirm → Dikonfirmasi; Tagihan pay-first due at hold expiry; reminder ~4 h before expiry.
- [ ] Payment → Aktif; one Hak Pakai per Petak or Kavling Keluarga, all with the same Pemegang Hak and Calon Penghuni labels; Bukti Pemesanan issued; the Hak Pakai end date stays empty until the first Pemakaman (or perpetual).
- [ ] Hold expiry unpaid → Tagihan Dibatalkan, order Dibatalkan "batas pembayaran lewat", plots released (tick, idempotent).
- [ ] Withdrawal before payment → Dibatalkan, plots released, nothing charged.
- [ ] Decline (Tolak) → Ditolak, plots released, the Pemesan is sent back to the Lokasi step.
- [ ] Pencairan: the Terencana Hak Pakai item becomes due at the end of the Masa Pembatalan (tick) or at the first Pemakaman if sooner.
- [ ] Tests: each transition; hold and lapse timing with the fake Clock; release on decline / withdrawal / lapse; Pencairan due at Masa Pembatalan end vs first Pemakaman.
