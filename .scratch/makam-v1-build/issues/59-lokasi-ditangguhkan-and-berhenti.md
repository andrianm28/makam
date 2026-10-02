# Lokasi Mitra Ditangguhkan and Berhenti

Status: ready-for-agent
Blocked by: 32, 38, 54
Spec: Domain modules > 3. Lokasi (Ditangguhkan, Berhenti); 9. Layanan (Berhenti cycles); 11. Payouts (On Berhenti); 16. Scheduler (Berhenti effective dates); stories 15, 106, 152

## What to build

Admin Platform sets a Lokasi Mitra Ditangguhkan or Berhenti (with an effective date, default 30 days after the decision), audited. Ditangguhkan blocks only a new Hak Pakai (Saat Duka new plot and Terencana); burials under an existing Hak Pakai, Perpanjangan, Layanan and Paket cycles, Pembatalan, Ganti Pemegang Hak, Pengembalian Hak Pakai and orders in progress carry on. Berhenti: from the decision no further Paket cycles are issued and families are told; until the effective date the Lokasi behaves as Ditangguhkan; open Pekerjaan Layanan not finished by that date are cancelled with a full refund including the Biaya Layanan Platform; from that date no order of any kind, and Hak Pakai stay read-only in Akun Saya with the pengelola's contact and downloadable documents. Pencairan and Potongan settle as the spec says.

## Acceptance criteria

- [ ] The Lokasi page stays up with "sementara tidak menerima pesanan"; the Lokasi disappears from Pilih makam and Terencana lists.
- [ ] Every order entry point checks the status: new Hak Pakai blocked while Ditangguhkan; everything blocked from the Berhenti effective date.
- [ ] Berhenti decision: Paket cycles stop at once and Pemegang Hak / Paket subscribers are notified.
- [ ] Effective-date tick (idempotent): unfinished Pekerjaan Layanan cancelled with full refunds incl. the Biaya Layanan Platform; Hak Pakai read-only in the Makam tab with the pengelola contact and documents.
- [ ] Payouts on Berhenti: pending Pencairan for finished work paid net; Potongan become an offline request; held Terencana Pencairan released except for Pemesan inside their Masa Pembatalan who cancel, who are refunded.
- [ ] Tests: each carry-on vs blocked action under Ditangguhkan; the Berhenti timeline; refunds of leftovers; payout settlement.

## Comments

- 2026-09-29 — From ticket 40's fix pass, a defect to settle before or with this ticket: `tariffs.quote()` prices only a Lokasi Mitra that is Terverifikasi (its public visibility), but the spec says Perpanjangan (and burials under an existing Hak Pakai, Layanan, Pembatalan) carry on at a Ditangguhkan Lokasi. Today a Perpanjangan at a Lokasi that stops being listed cannot be priced, so `tawaran` and `ajukan` refuse it (`harga_tidak_tersedia`). The fix belongs with the status work here (a quote that a Lokasi's own carry-on actions may ask for regardless of the listing), and this ticket's "carry-on vs blocked" tests should include Perpanjangan.

- 2026-10-02 — Builder (slice 1: domain + tests, no UI). Built: Lokasi `tangguhkan` / `pulihkan` / `hentikan` (Berhenti, effective date default 30 days after the decision, audited as `lokasi.tangguhkan|pulihkan|hentikan`, authorised as `lokasi.ubah_status`, Admin Platform only); the one rule `lokasi.izinPesanan(lokasiId, "hak_pakai_baru" | "lanjutan" | "siklus_paket")`; `lokasi.dapatDiharga` (the quote visibility: fixes the 2026-09-29 Perpanjangan defect, `tariffs.quote` now prices Ditangguhkan, and Berhenti until its date); `publicLokasiMitraTampil` (profile for a page that stays up); Layanan `cekHakPakai` / `penawaranUntukPesanan` carry on (no longer need Terverifikasi); `tickSiklusPaket` skips a Berhenti Lokasi; `layanan.batalkanSisaBerhenti` (cancels unfinished jobs, full refund incl. Biaya Layanan Platform via Refunds, `alasan: "berhenti"`); `payouts.potonganBerhenti`; `payouts.lepaskanTerencanaBerhenti(nomor[])`; `lokasi.berhentiBerlakuBelumDiproses` / `tandaiBerhentiDiproses` (sweep bookkeeping). Migration 0050 (three nullable columns). Public lists and Saat Duka / Terencana entry already refuse non-Terverifikasi (new Hak Pakai blocked).
  Decisions: `keluhan` jobs are not cancelled by the sweep (finished work under complaint keeps its own refund flow); Berhenti is final (no pulihkan); the layanan, payouts and siklus code was written before its red test in three cycles (tracer order slipped), tests were added in the same commit.

  HANDOFF (left for next agent): (1) the effective-date tick in `src/domain/scheduler` + `composeSchedulerContext` + `src/worker/main.ts` + smoke test: for each id of `lokasi.berhentiBerlakuBelumDiproses()` run `layanan.batalkanSisaBerhenti`, `payouts.potonganBerhenti`, `payouts.lepaskanTerencanaBerhenti(nomor of the Lokasi's Terencana orders still in Masa Pembatalan; needs a Pemesanan read)`, and call `tandaiBerhentiDiproses` only when `tertunda === 0`. (2) Notify Pemegang Hak and Paket subscribers at the decision (Notifications template). (3) UI: Admin Platform buttons, Lokasi page banner "sementara tidak menerima pesanan" (use `publicLokasiMitraTampil`), Akun Saya read-only Makam tab with pengelola contact and documents. (4) Perpanjangan / Ganti Pemegang Hak / rebook entry points still call `publicLokasiMitra` in places (rebook.ts, picker): audit them against `izinPesanan`. (5) Unverified: lint and wider suites were not run in full.

  Spec gaps: the spec does not say whether Admin Platform can reinstate a Ditangguhkan Lokasi (built, since "reinstates" appears for Mitra Jasa); nor how "refunded" Pemesan at Berhenti inside Masa Pembatalan is netted (left to the existing Pembatalan flow).

- 2026-10-02 — Builder (slice 2). Built: the tick `lokasi.berhenti_berlaku` (`src/domain/scheduler/berhenti.ts`, every 15 min, idempotent; marks the Lokasi settled only when no refund is `tertunda`), wired in `composeSchedulerContext` and the worker; Pemesanan read `pesananBerjalanDiLokasi`; Layanan read `pelangganPaketDiLokasi`; Notifications `lokasiBerhenti` (template `lokasi_berhenti`, any hour) composed with the decision in `src/composition/berhenti.ts`; a reason on tangguhkan/pulihkan/hentikan (audit); Admin Platform "Status kemitraan" section with the three forms; public Lokasi page banner and no order buttons while Ditangguhkan or Berhenti; the public Layanan list now shows at a Ditangguhkan Lokasi. Decisions: the composition test stubs the Pemesanan read (the real one is tested in Pemesanan).

  Spec gaps and decisions for the owner: Pemegang Hak with no running order and no Paket are not told at the decision (their email is not held by Hak Pakai); the spec does not say who else to tell.

  HANDOFF: left: (1) Akun Saya read-only Makam tab for a Berhenti Lokasi (pengelola contact, documents). (2) Playwright/UI smoke not written. (3) `efek-bukti-pemesanan.ts`, `terencana-aktif.ts`, `rebook.ts`, `tolak.ts` still call `publicLokasiMitra`: a Ditangguhkan Lokasi loses only the map link / city there, nothing fails; switch to `publicLokasiMitraTampil` if wanted. (4) `npm run build` and the full suite not run; touched paths green (scheduler, notifications, lokasi, payouts, layanan, composition, worker).
