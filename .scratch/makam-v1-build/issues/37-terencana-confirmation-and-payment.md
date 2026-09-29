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

## Comments

- 2026-09-29 — **Built** on `origin/main` a3e7fdd plus ticket 89's three commits (merged from local `fix-tagihan-terbit`, since 89 is not on `main` yet), branch `ticket-37-terencana-konfirmasi`, test-first at the modules' public seams on real Postgres with the fake Clock.
  - **Pemesanan**: `konfirmasiTerencana` (audited; hold from Lokasi policy `terencanaHoldHours`, pay-first Tagihan due at hold expiry, `tagihanTerbit` with `bersamaKonfirmasi` in the same transaction and ONE confirmation email carrying order and Tagihan), `tolakTerencana` (closed reason list = a 4-reason subset of the existing list, no new reason text; releases plots; family sent back to the Lokasi step by email and on the order page), `tarikTerencana` (free until paid; refuses `sudah_dibayar` via Billing's row lock), `lewatBatasBayarTick` (registered as `pemesanan.lewat_batas_bayar_terencana`), and the payment effect `aktifkanTerencana` inside `pemesanan.bukti_pemesanan` (one Hak Pakai per unit, same Pemegang Hak, Syarat snapshot and Calon Penghuni on each, one Bukti, `masaPembatalanDimulai` to Payouts, email).
  - **Migration `0035_quiet_marvel_zombies`** (expand only; `DROP NOT NULL` on `bukti_pemesanan.masa_mulai` passes the destructive-DDL check): Terencana order columns, unit `tenure_years`/`hak_pakai_id`, Hak Pakai `syarat`/`calon_penghuni`, `bukti_pemesanan.masa_tahun`, table `pencairan_terencana`.
  - **Readings for the owner** (decisions I made where the spec is silent, please confirm): (1) Masa Pembatalan end = payment + N x 24 h exactly, from the order's own Syarat. (2) The Bukti of a Terencana right nobody is buried in yet states the term as "N tahun sejak pemakaman pertama" (or perpetual), no dates; with several plots of different terms the shortest is stated and each plot's own term is named beside its number. (3) The Tier 3 row appears at `konfirmasiDueAt` itself (inclusive). (4) The hold reminder goes 4 h before expiry, or at 19:59 WIB the evening before when that would fall at night; none when the hold is shorter than 4 h. (5) One Bukti and one Tagihan per order, one Biaya Layanan Platform, Harga Hak Pakai lines suffixed with the plot number.
  - **Found, not fixed (out of scope)**: `payouts.pemakamanTercatat` still has no production caller (ticket 25 never wired it), so the Saat Duka Pencairan trigger's burial half is only written by tests; my Terencana "first Pemakaman if sooner" reads the same fact and is exactly as reachable. A burial at a Terencana Hak Pakai has no order path yet either.
