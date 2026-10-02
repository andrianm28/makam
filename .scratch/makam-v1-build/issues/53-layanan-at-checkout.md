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

### 2026-10-02 builder (ticket 53, first slice: domain + tests; UI and Terencana left)

**Built (green, domain level):**
- Layanan `checkout.ts`: `penawaranCheckout` (offer per checkout mode), `siapkanCheckout` (offered, mode flag, text, date rules: hari-H = burial day; Terencana = lead time from today; Perpanjangan = lead time after the Tagihan due date), `gabungkanBaris`, `tulisCheckout` (jobs under the owner's Nomor Pemesanan, Dijadwalkan at once for hari-H), `batalkanLayananCheckout`.
- Saat Duka (Lokasi Mitra): `placeSaatDuka({ layananHariH })` checks early; `konfirmasiSaatDuka` prices them in the same quote (one Biaya Layanan Platform), keeps pay-after and the due date, Dijadwalkan at confirmation, target = burial day. Cancellation closes unstarted jobs; Billing `batalkanTagihan` takes `ditahan` so a job already Sedang Dikerjakan is not refunded. Tidak Tertagih: no Pencairan item unless the family pays later (test).
- Perpanjangan: `ajukan`/`pesanDariPermohonan` take `layanan: [{ layananVariantId, targetDate, teks }]`; Tagihan keeps the 3x24 h due date, a too-early date is `lead_time_melewati`, nothing issued; payment schedules the jobs. Result carries `layananNomor`. Inventory `hakPakaiUntukPerpanjangan` now also returns `petakId`.
- Migration `0050_slippery_stature.sql` (pemesanan_makam.layanan_hari_h, nullable).
- Verified: lint 0, typecheck 0 errors (before the last runtime.ts lazy-box edit; rerun), vitest subset (pemesanan, perpanjangan, billing, pengurusan, layanan checkout/pesanan/tpu/batal) 51 files / 534 tests passed.

**HANDOFF (next agent):**
1. Terencana empty-plot, not started: single plot only; store items on `pemesanan_terencana`; at `konfirmasiTerencana` price in the same quote (`mode: "petak_kosong"`), `issueTagihan` takes the earliest due (Billing `tagihanDue` already does); `pesanan_layanan.hak_pakai_id` is NOT NULL and the Hak Pakai only exists at payment, so either write the order in `aktifkanTerencana` or make the column nullable (DROP NOT NULL is expand-safe). Also close the jobs when the hold lapses or a Pembatalan is approved.
2. A lapsed (Dibatalkan) Perpanjangan Tagihan leaves its Layanan jobs in Menunggu Pembayaran; cancel them there.
3. UI: Saat Duka wizard step for hari-H items (`data-kirim.tsx`/`draft.ts`, keep edits minimal, hotfix pending), Terencana picker step, Perpanjangan "Tambah Layanan" step, sticky total bar. Server Actions must pass the new inputs.
4. Unverified: `src/worker/main.ts` and `tests/support/server-runtime.ts` compose Pemesanan without `layanan` (optional, so hari-H is refused there); no e2e.

### Spec gaps and decisions for the owner
- A hari-H item's price is taken when the Lokasi confirms (like the Petak), not at submission; the family's all-in total on "Data & kirim" therefore does not include it. Confirm shows nothing if the Layanan was switched off meanwhile: confirmation is refused with `layanan_tidak_tersedia`. Owner to decide whether the Lokasi should instead be allowed to confirm without it.
- Terencana: the Layanan target date is checked at submission; if the Lokasi confirms later than the lead time allows, confirmation would have to refuse or move the date. Owner to decide.
