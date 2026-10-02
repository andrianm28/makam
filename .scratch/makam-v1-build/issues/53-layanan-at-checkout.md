# Layanan at checkout: hari-H on Saat Duka, empty-plot on Terencana, Tambah Layanan on Perpanjangan

Status: ready-for-agent
Blocked by: 37, 40, 50
Spec: Domain modules > 9. Layanan (Order: Saat Duka hari-H, Terencana empty-plot, Perpanjangan Tambah Layanan); 7. Perpanjangan; 6. Pemesanan (cancellation effects); 10. Billing (earliest-due rule, Tidak Tertagih loss); stories 23, 48

## What to build

Add Layanan to the booking checkouts. Saat Duka checkout offers only "bisa hari-H" items for the burial day, billed pay-after on the same Tagihan (taking its due date so it stays pay-after); their Pekerjaan Layanan are Dijadwalkan at the order's confirmation. Cancelling the Saat Duka order refunds the hari-H Layanan unless already Sedang Dikerjakan. A Terencana checkout for a single plot offers only empty-plot items (cleaning, grass care, photo report), pay-first on the Terencana Tagihan (one due date, the earliest line). A Perpanjangan checkout at a Lokasi Mitra (ticket 40, both the OTP and manual paths) gets an optional "Tambah Layanan" step before payment, with the Layanan on the same Tagihan. All show in the sticky total bar.

## Acceptance criteria

- [ ] Saat Duka: only hari-H items; lines on the Saat Duka Tagihan; Tagihan remains pay-after; jobs Dijadwalkan on confirmation, target = burial day.
- [ ] Saat Duka cancellation: hari-H jobs Dibatalkan and refunded unless Sedang Dikerjakan.
- [ ] Tidak Tertagih: hari-H Layanan at a Lokasi are lost by their fulfiller like the Petak tariff (no Pencairan).
- [ ] Terencana: empty-plot items only, offered only when a single plot is picked; the Tagihan's due date is the earliest of hold expiry and the Layanan due rule.
- [ ] Perpanjangan: an optional "Tambah Layanan" step before payment offers the Lokasi's Layanan for that grave; the lines go on the Perpanjangan Tagihan, which **keeps the Perpanjangan due date (3×24 h)**; each Layanan's target date picker allows only dates at least its lead time after that due date (exception to the earliest-due rule, decided 2026-09-25). Test: adding Layanan leaves the due date unchanged; a too-early target date is rejected.
- [ ] One Biaya Layanan Platform per Tagihan (shared with the order).
- [ ] Tests: offered items per checkout (Saat Duka, Terencana, Perpanjangan); Tagihan kind and due date; scheduling at confirmation; cancellation refunds; Tidak Tertagih loss.

## Notes

Hari-H Layanan on a TPU Saat Duka checkout are ticket 56 (Mitra Jasa fulfilment).
- 2026-10-02 — **Two-axis review of the whole branch (head 3ed0a7e).** Fixed point origin/main = 93944ff, confirmed by the orchestrator before spawning; diff 69 files.
  - **Standards: 0 hard, 4 judgement.** (1) `src/components/layanan/opsi-view.ts` imports a type from the `@/domain/layanan` barrel (AGENTS.md: never anything from a barrel) — import from the module's own file or move it to `src/lib`; it is also a one-for-one renaming Middle Man. (2) In `src/domain/scheduler/index.ts` the new `layanan.batalkan_tagihan_lapse` entry splits the ticket 54 comment from its `layanan.paket_siklus` entry. (3) `z.array(itemHariHTpuSchema).max(10).default([])` written twice in the Saat Duka `draft.ts`. (4) `OpsiTambahLayanan` / `OpsiLayananView` shape shared from a component file — move to `@/lib/layanan-pilihan`. Clean: guarded actions, `layananJson` through Zod, client graphs, Clock, idempotent lapse tick, cancellation in the caller's transaction, migration 0051 (DROP NOT NULL is expand per `scripts/migrations/destructive-ddl.ts:91`).
  - **Spec: 0 hard, 4 judgement.** All 7 ACs delivered at domain level. (a) AC "All show in the sticky total bar": the Terencana total sits in the Layanan fieldset, not `TotalBarTerencana` (recorded). (b) "earliest of hold expiry and Layanan rule" is not proven: no test where the Layanan lead time is earlier than the hold expiry. (c) A Kavling Keluarga unit is refused although the spec says only "single plot" (unrecorded). (d) Whether a Pembatalan Terencana cancels that plot's Layanan is a real spec gap (spec lines ~389/~400 silent) — to the owner through grilling.
  - **Fix pass**: Standards 1–4, Spec (a), (b) with a test; (c) recorded under spec gaps unless the owner decides; (d) waits for the owner.
- 2026-10-02 — **Settled through the `grilling` skill (round 1 Q5, owner "ya setuju semua"):** a Pembatalan Terencana also cancels that plot's Layanan **not yet done**, and refunds them; a Layanan already done is not refunded (same rule as the owner's decision on ticket 46 gap 3).
- 2026-10-02 — **Settled through the `grilling` skill (round 2 Q7, owner "iya setuju semua"):** on a Pembatalan Terencana, a plot's Layanan that are **Dijadwalkan or Terlambat** are cancelled and refunded; a job **Sedang Dikerjakan** carries on and is paid; a Selesai job is not refunded. Supersedes the builder's "Dijadwalkan only" reading.
