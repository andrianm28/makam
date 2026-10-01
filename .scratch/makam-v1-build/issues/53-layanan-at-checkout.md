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
- 2026-10-01 — **Review findings (Standards + Spec) on branch `ticket-53`, HEAD `9fd88430`.**
  - **Standards (hard):** `checkout-skema.ts:16` validates `targetDate` as `z.string().trim().min(1).max(10)` instead of a real date (sibling `pesanan-schema.ts:28` uses `z.iso.date`), so `checkout.ts:123-124` compares strings lexically and `"zzzz"` passes any lead time. Validate it as a date.
  - **Standards (cheap):** `checkout.ts:112-165` duplicates `placePesananLayanan`'s item loop/quote→line mapping and reuses `harga_tidak_tersedia` where `pesanan.ts` has `baris_tidak_bisa_ditagih`; the doc comment at `checkout.ts:40` describes the wrong type; `checkout-skema.ts:17` allows 2000 chars vs sibling 500; `checkout.test.ts:151` has a scaffold `toBeTruthy()`.
  - **Spec (partial):** `jadwalkanCheckout` reuses `jadwalkan` which writes the order as `terbayar` (`pembayaran.ts:104,120`). For a Saat Duka pay-after checkout no payment has occurred; the ticket comment's "the payment already happened" is untrue for pay-after. Fix so a pay-after checkout order is not marked paid, or report it as a spec gap for the owner.
- 2026-10-01 — **Builder: review fixes, branch `ticket-53`, base HEAD `9fd88430`.**
  - **Date validation (hard):** `itemCheckoutSchema.targetDate` is now `z.iso.date` (sibling `pesanan-schema.ts:28`), so `"zzzz"` is `input_tidak_valid`; `teks` is `.trim().max(500).nullable().default(null)` like the sibling. Tests: "refuses a target date that is not a calendar date".
  - **Pay-after order not paid (Spec):** `jadwalkan` takes `{ tandaiTerbayar }` (default true, so the payment effect is unchanged); `jadwalkanCheckout` takes `tagihanSudahDibayar` and passes it through. A Saat Duka pay-after checkout schedules its jobs at confirmation but stays `menunggu_pembayaran` until its Tagihan is paid; that later payment runs `jadwalkan` again and marks it `terbayar`. Tests: "schedules a pay-after order's jobs without recording it as paid", "records a pay-first order as paid once its payment has happened". No spec gap: "jobs Dijadwalkan on confirmation" is honoured; only the false "payment already happened" is corrected.
  - **Cheap Standards:** added `baris_tidak_bisa_ditagih` to `BarisCheckoutRefusal` and used it for an unpriceable line kind (was `harga_tidak_tersedia`); removed the orphaned wrong-type doc comment (`checkout.ts:40`) and the scaffold `toBeTruthy()`; `barisCheckout` now maps quote→lines through `pesanan.ts`'s `barisTagihan`, dropping the fee line as before. **Deferred:** the item-validation loop still mirrors `placePesananLayanan`'s; the two differ in checkout-kind allowance and the Perpanjangan due-date reference, so a shared helper is a follow-up, not a cheap fix.
  - **Verified:** `MAKAM_TEST_PG=shared npx vitest run src/domain/layanan` → 16 files, 187 tests, exit 0; `npm run lint` 0; `npm run typecheck` 0; `npm run build` 0 (once, then `.next dist` removed). Docker was unavailable, so tests ran against the already-running shared Postgres through `MAKAM_TEST_PG_URL=…:55432`. No migration.

