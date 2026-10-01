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

## Comments

- 2026-10-01 — **Builder slice: the Layanan module's checkout seam (domain only).** Branch `ticket-53`, base `origin/main` `efc72425`. Delivered the rules all three checkouts call, in the Layanan module, tested through its public interface:
  - `penawaranCheckout(lokasiId, jenis)` — the catalog slice each checkout offers: `saat_duka` only `bisaHariH`, `terencana` only `adaDiPetakKosong`, `perpanjangan` the whole offering (`src/domain/layanan/checkout.ts`).
  - `barisCheckout(lokasi, jenis, items, { dueAt? })` — prices and checks the picked items; refuses a variant the checkout's kind may not offer, an empty required text, and a target date inside the lead time. For a Perpanjangan (`dueAt`) the lead time is measured **from the Tagihan's due date**, the ticket's settled exception. The returned lines are the Tagihan's `layanan` lines **without** the `biaya_layanan_platform` the quote appends, because the checkout's own Tagihan already carries the one fee the rule allows (one per Tagihan).
  - `jadwalkanCheckout(input, within)` — writes the checkout's Layanan as a ticket 50 order (order + items + one Pekerjaan Layanan each) on the checkout's own Tagihan, Dijadwalkan at once through `jadwalkan`; a Perlu Verifikasi Hak Pakai holds them at Menunggu Pembayaran and the existing `jadwalkanTertunda` tick releases them.
  - A Zod list schema lives in `checkout-skema.ts` for a client component's import graph.
  - Tests: `src/domain/layanan/checkout.test.ts` (8). The due-date rule itself is already Billing's and already tested: `src/domain/billing/due-rules.test.ts` locks a `layanan` line on a `saat_duka` moment taking the burial window, on a `terencana` moment taking the earliest line, and on a `perpanjangan` moment leaving the 3×24 h due unchanged.
  - **Not built (handoff).** No checkout calls these yet: `placeSaatDuka`/`konfirmasiSaatDuka`, the Terencana confirmation and the Perpanjangan order still offer and bill no Layanan; the Saat Duka cancellation's refund of hari-H jobs (AC 2) and the Tidak Tertagih loss (AC 3) are not implemented; the sticky total bar is untouched. The next agent wires the three callers: Pemesanan needs a `layanan` dep (and a stored item list at submission), Perpanjangan needs one too plus a pay-first variant of `jadwalkanCheckout` that leaves jobs at Menunggu Pembayaran until its payment effect schedules them.
  - Verified: `MAKAM_TEST_PG=shared npx vitest run src/domain/layanan/checkout.test.ts src/domain/layanan/pesanan.test.ts` → 2 files, 28 tests, exit 0; `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0 (run once, then `.next dist` removed). No migration: no `schema.ts` changed.

