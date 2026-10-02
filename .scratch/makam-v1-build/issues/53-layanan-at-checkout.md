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

**HANDOFF (next agent, after slice 3):**
1. Done in slice 3: Terencana empty plot, lapse cleanup, action tests (see the 2026-10-02 slice 3 entry). Left: `pesanDariPermohonanAction` test (approved-request path); e2e; sticky-bar total on the Terencana screen is a line inside the Layanan fieldset, not in `TotalBarTerencana`.
2. Owner decisions pending: whether a Pembatalan Terencana of a Hak Pakai should also cancel/refund that plot's Layanan (now it does not; the family cancels a job itself until H-1); Terencana target date vs a late confirmation.
3. Migration `0051_*` is expand-only; a number collision is fixed at merge.
4. Unverified: full-suite and `npm run build` are the orchestrator's (see the entry).

### Spec gaps and decisions for the owner
- A hari-H item's price is taken when the Lokasi confirms (like the Petak), not at submission; the family's all-in total on "Data & kirim" therefore does not include it. Confirm shows nothing if the Layanan was switched off meanwhile: confirmation is refused with `layanan_tidak_tersedia`. Owner to decide whether the Lokasi should instead be allowed to confirm without it.
- Terencana: the Layanan target date is checked at submission; if the Lokasi confirms later than the lead time allows, confirmation would have to refuse or move the date. Owner to decide.

### 2026-10-02 builder (ticket 53, second slice: wiring and UI; Terencana and lapse left)

**Built:**
- Wiring (a) was real: a test through the test server runtime (`src/app/pesan-makam/saat-duka/actions.test.ts`) failed with `gagal` before `tests/support/server-runtime.ts` got the lazy Layanan box, and passes after. The worker now hands Layanan to Pemesanan directly (it is composed first there).
- Saat Duka "Data & kirim": `draftSchema.layananHariH`, `kirim` passes it, the page offers `layanan.penawaranCheckout(lokasi, "hari_h")`, a "Layanan hari-H" fieldset and the sticky total adds the subtotal (edits to `data-kirim.tsx` kept to additions).
- Perpanjangan "Tambah Layanan": domain `perpanjangan.penawaranLayanan(hakPakaiId)` (offer for the grave's Lokasi with each Layanan's first allowed date after the 3x24 h due date; test in `layanan.test.ts`); optional step on the direct page (the OTP path lands on the same form after the code) and on the approved-request page; `pesanPerpanjangan` and `pesanDariPermohonanAction` carry `layananJson` through Zod (`itemCheckoutListSchema`). Shared client pieces: `src/components/layanan/*`, `src/lib/layanan-pilihan.ts` (tested).

**Not built (next agent):**
1. Terencana empty-plot. Proposed expand-only design: migration with `ALTER TABLE pesanan_layanan ALTER COLUMN hak_pakai_id DROP NOT NULL` (not destructive: no data lost, old release still writes it) plus a nullable `pemesanan_terencana_id` on `pesanan_layanan`; store the items on `pemesanan_terencana`; price them at `konfirmasiTerencana` in the same quote (`mode: "petak_kosong"`, single plot only); at payment (`aktifkanTerencana`) set `hak_pakai_id` and schedule; close the jobs when the hold lapses or a Pembatalan is approved. Readers of `pesanan_layanan.hak_pakai_id` (hub, siklus.ts:111/240, pesanan.ts:223) must tolerate null. Wizard step: reuse `PilihLayanan` with `tanggalPalingDini`.
2. (c) A lapsed Perpanjangan Tagihan still leaves its jobs Menunggu Pembayaran.
3. Server Action tests for the Perpanjangan `layananJson` path; no e2e.

### 2026-10-02 builder (ticket 53, third slice: Terencana empty plot, lapse, action tests)

**Built:**
- Terencana empty plot, one Petak Makam only: `placeTerencana({ layanan: [{ layananVariantId, targetDate, teks }] })` checks them at submission (`layanan_satu_petak`, `layanan_tidak_tersedia`, `lead_time_melewati`, `teks_kosong`) and stores them on `pemesanan_terencana.layanan`; `konfirmasiTerencana` checks again, prices them in the same quote (one Biaya Layanan Platform) and writes the order and its jobs (Menunggu Pembayaran) on the Tagihan; payment schedules them through the existing Layanan payment effect. Migration `0051` (expand-only): `pemesanan_terencana.layanan` jsonb, `pesanan_layanan.hak_pakai_id` DROP NOT NULL (nothing reads it; Terencana writes null).
- Lapse: `layanan.batalkanPekerjaanTagihanLapse` (scheduled `layanan.batalkan_tagihan_lapse`, hourly, idempotent, reads Billing's `tagihanBerlaku`) cancels the jobs of any Dibatalkan Tagihan (the Perpanjangan case). Terencana withdrawal (`tarikTerencana`) and hold lapse (`lewatBatasBayarTerencana`) cancel the jobs in their own transaction.
- Wizard: Layanan picker on the Terencana "Data & kirim" (one plot only), draft/action carry `layanan`, messages in `terencana-pesan.ts`.
- Tests: `layanan-terencana.test.ts`, `perpanjangan/layanan.test.ts` (lapse), Server Action tests for Terencana Kirim and `pesanPerpanjangan` (`layananJson`). Test harness gaps closed: Layanan payment effect in the Pemesanan setup, `layanan` in the test server runtime's Perpanjangan.

### Spec gaps and decisions for the owner (slice 3)
- A Pembatalan Terencana (paid, refund per Hak Pakai) refunds only the Hak Pakai line and leaves that plot's Layanan jobs running; the family can cancel a job itself until H-1. Owner to decide whether approving the Pembatalan should cancel them.
- The Layanan's date is checked at submission and again at the confirmation; a late confirmation refuses (`layanan_tidak_tersedia`) rather than moving the date.
