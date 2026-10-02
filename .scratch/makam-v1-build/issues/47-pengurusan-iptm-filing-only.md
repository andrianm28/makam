# Pengurusan IPTM (filing-only) and PTSP rejections

Status: ready-for-agent
Blocked by: 31, 46
Spec: Domain modules > 8. Pengurusan (Pengurusan IPTM, payment rule, PTSP rejection); 13. Field Work (surat pengantar on Lunas); 14. Work Queues (Tier 3 filing-only document check, filing); stories 78, 82

## What to build

"Sudah dimakamkan? Kami urus IPTM-nya": a family that buried at a DKI TPU on their own orders filing only. The order starts Dimakamkan; the Pemesan uploads documents within 7 days of the order; Admin Platform checks them (Tier 3, 1 working day) → Dokumen Lengkap; then a pay-first Tagihan (Biaya Pengurusan filing-only amount) due 3×24 h after issue, lapsing to Dibatalkan (Menunggu Pembayaran). Once Lunas, an Ambil surat pengantar Tugas Lapangan is created and filing is due within 3 working days (Tier 3) → IPTM Diajukan → IPTM Terbit (Makam TPU created/updated). A fixable PTSP rejection (missing or unclear document, Surat Kuasa problem) goes back to Perlu Perbaikan and is refiled at no charge, also after payment; a final PTSP rejection is refunded in full with the reason shown.

## Acceptance criteria

- [ ] Statuses: Dimakamkan → Dokumen Lengkap → Menunggu Pembayaran → IPTM Diajukan → IPTM Terbit, plus Ditolak and Dibatalkan; Perlu Perbaikan loop for fixable rejections.
- [ ] No Tagihan before the document check passes; the Tagihan lapses (order Dibatalkan) at 3×24 h unpaid.
- [ ] Ambil surat pengantar Tugas is created only once the Tagihan is Lunas.
- [ ] Tier 3 rows: document check (1 working day), filing (3 working days after Lunas), on the Admin Platform calendar (ticket 11).
- [ ] Fixable rejection → Perlu Perbaikan (shown in Perlu tindakan), refile creates no new Tagihan.
- [ ] Final rejection → Ditolak with the reason shown; full refund (including Biaya Pengurusan) through ticket 31, Operator-funded.
- [ ] Tests: pay-first after check; lapse; surat pengantar on Lunas only; Perlu Perbaikan loop without charge; final rejection refund.

## Added (2026-09-25)

- [ ] Optional email field on the order screen (copies of Tagihan / Bukti by email through SumoPod SMTP; SES dropped 2026-09-25), as in spec "Booking wizards".

## Comments

### 2026-10-02 builder (ticket 47, sonnet)

Built (domain first, red then green): `placePengurusanIptm` (order starts Dimakamkan, documents due 7 days after the order, no Tagihan); `periksaDokumen` for the filing-only kind (Dokumen Lengkap and the pay-first Tagihan `pengurusan_berkas`, 3×24 h, in one transaction → Menunggu Pembayaran); `pembayaranBerkasTick` (Lunas → Diproses; Billing-lapsed Tagihan → Dibatalkan; idempotent; scheduled as `pengurusan.pembayaran_berkas`); `buatSuratPengantar` (Ambil surat pengantar Tugas, only once Lunas, once); `tolakPtsp` (fixable → Perlu Perbaikan, refile through `ajukanIptm` with no new Tagihan; final → Ditolak + whole-Tagihan refund through `refunds.ajukanBaris`, pihak bersalah operator); Tier 3 rows `periksa_berkas_iptm` (1 working day from the last upload) and `ajukan_iptm_berkas` (3 working days after Lunas), both on the Admin Platform calendar; Perlu tindakan shows Perlu Perbaikan with the PTSP's reason; staff page forms; Pemesan order page states; order screen `/pesan-makam/pengurusan-iptm` and its action. Migration 0057 is expand-only (five nullable columns).

Routes / actions / ticks for the release gate (all Rilis 3): page `/pesan-makam/pengurusan-iptm` with `pesanPengurusanIptmAction`; staff actions `buatSuratPengantarAction` and `tolakPtspAction` (in `src/app/staf/admin-platform/pengurusan/[nomor]/pengajuan-actions.ts`; `periksaDokumenAction` and `ajukanIptmAction` there now also serve this kind); tick `pengurusan.pembayaran_berkas`; Antrean row types `periksa_berkas_iptm`, `ajukan_iptm_berkas`.

### Spec gaps and decisions for the owner

- **(Superseded by the 2026-10-02 fix pass below.) Ambil surat pengantar is not created automatically on Lunas.** Field Work's `createTugasLapangan` needs an Admin Platform actor and a named Petugas Lapangan, and a tick or payment effect has neither. Decision: once the Tagihan is Lunas the order is Diproses and an Admin Platform makes the Tugas (a Petugas picked on the order page); the module refuses before Lunas and a second time. If the owner wants it automatic, say which Petugas is the default (or allow a system-created, unassigned Tugas in Field Work).
- **Status after Lunas.** The spec chain has none between Menunggu Pembayaran and IPTM Diajukan; the existing status `diproses` is used for "paid, waiting to be filed". The Lunas moment is the tick's `now` (Billing's Tagihan carries no paid-at), up to one minute late.
- **Order screen: login first, no Kode Masuk at Kirim, no optional email field.** The required email is the signed-in Akun's (ADR 0004 amended the "Added (2026-09-25)" optional-email item); the wizard-style Kode Masuk step at Kirim and a client-side draft are not built.
- **Final PTSP rejection** (Ditolak + refund) is built for the filing-only kind only; the spec does not say what happens to a final rejection of a Saat Duka TPU order. A fixable rejection works for both kinds.
- **Surat Kuasa for a filing-only order** names the company alone (no confirming staff member exists), so the wakil is "PT Jaya Korpora Prima".
- Pemesan cancellation of a Menunggu Pembayaran order voids the unpaid Tagihan; cancellation after payment (Diproses on) is not offered, nothing in the spec says what is refunded.
- Not built: e2e spec; ADR 0006 gating (a parallel builder).

HANDOFF: files: `src/domain/pengurusan/{pengurusan-berkas,saat-duka-tpu,pengajuan-iptm,reads,schema,index,deps}.ts`, `src/domain/queues/tier3-berkas-iptm-row.ts`, `src/domain/scheduler/index.ts`, `drizzle/0057_*`, `src/app/pesan-makam/pengurusan-iptm/*`, staff and Pemesan pengurusan pages. Next agent: wire the gate (list above), consider the automatic Tugas decision, add an e2e smoke if wanted. Unverified: pages were type-checked and built but not exercised in a browser.

### 2026-10-02 builder, fix pass (review of eb66d4f)

- **Spec HARD, auto Tugas on Lunas.** `pembayaranBerkasTick` now moves the order to Diproses and, in that same transaction, makes the Ambil surat pengantar Tugas through Field Work's new public `buatTugasSistem` (system-made, unassigned: empty assignee, which the Antrean already reads as unassigned; `created_by` "sistem"; no actor, no seed pattern). One transaction per order, conditional on Menunggu Pembayaran, so ticking twice makes one Tugas. It appears as the Tier 2 "Ambil surat pengantar" row. The manual `buatSuratPengantar` action, form and schema are removed (no purpose left). Admin Platform assigns it through the new audited `fieldwork.tugaskanTugasLapangan` (action `tugaskanTugasLapanganAction`, form on `/staf/admin-platform/tugas-lapangan`; Rilis 3 route with the rest of this ticket's list). The earlier spec-gap note is superseded.
- **Standards.** `hariKemudian` and the named status sets (`STATUS_MENERIMA_UNGGAHAN`, `STATUS_BOLEH_DIBATALKAN`, `STATUS_SUDAH_DIMAKAMKAN`) live in `src/domain/pengurusan/aturan.ts`. The tick's updates are system facts following Billing's (Lunas, lapse), so they record no Entri Audit; each order moves in one transaction. The page quotes with `adapters.clock.now()`. The two best-effort `files.delete` calls are commented. The Tier 3 row projection is shared (`barisPengurusan` in `tier3-iptm-row.ts`).
