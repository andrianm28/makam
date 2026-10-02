# TPU filing: documents, Surat Kuasa, IPTM and Makam TPU

Status: ready-for-agent
Blocked by: 45
Spec: Domain modules > 8. Pengurusan (statuses, documents, Surat Kuasa generator, Makam TPU, cancellation, IPTM handover); 13. Field Work (Berkas IPTM); 14. Work Queues (Tier 3 IPTM filing); stories 74, 75, 76, 77, 147

## What to build

After the burial, Admin Platform sets the Saat Duka TPU order Dimakamkan (after checking with the TPU or the family), which starts the pay-after clock and the 7-day window for filing documents. The Pemesan uploads the filing documents and a signed Surat Kuasa that the platform generates (authority to PT Jaya Korpora Prima, represented by the filing staff member, filled from their account). Admin Platform checks the documents (Dokumen Lengkap), files on JakEVO (IPTM Diajukan) from a Tier 3 "IPTM filing" row (7 days), and uploads the IPTM scan and expiry (IPTM Terbit). This creates or updates the Makam TPU record, which shows in the Pemegang Hak's Makam tab. The IPTM is sent to the family even if unpaid. The Pemesan may cancel before filing, voiding the Tagihan.

## Acceptance criteria

- [ ] Statuses: Diajukan → Dikonfirmasi → Dimakamkan → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit, plus Dibatalkan; the timeline is visible to the Pemesan.
- [ ] Filing documents are due 7 days after the burial; missing documents appear in Perlu tindakan.
- [ ] The Surat Kuasa is generated as a document page/PDF with PT JKP and the filing staff member's name, for the Pemegang Hak to sign and upload.
- [ ] Tier 3 IPTM filing row with a 7-day deadline; a Berkas IPTM Tugas Lapangan can be created for originals.
- [ ] Uploading the IPTM scan + expiry sets IPTM Terbit, sends the scan link to the Pemesan and the Pemegang Hak, and stores it on the Makam TPU regardless of the Tagihan status.
- [ ] Makam TPU: TPU, blok/nomor, Almarhum(s), Pemegang Hak + phone number (email when known), current IPTM scan + expiry, IPTM history; a Tumpang order updates the existing record instead of creating one.
- [ ] Cancel before IPTM Diajukan → Dibatalkan; an unpaid Tagihan becomes Dibatalkan; after filing, cancel is refused.
- [ ] A paid order cancelled before IPTM Diajukan gets a refund request (ticket 31, approved by Admin Platform): the full amount paid, except that at or past Dimakamkan (burial arranged with the TPU) the Biaya Pengurusan is kept and only the other lines (e.g. Layanan not yet done) are refunded.
- [ ] No Bukti Pemesanan / Perpanjangan is issued at a TPU.
- [ ] Tests: status sequence; 7-day document window; Makam TPU creation and tumpang update; IPTM handed over while unpaid; cancellation before/after filing; refund amount of a paid cancellation before vs at/after Dimakamkan.
- [ ] Ordering a Layanan from a Makam TPU prefills the grave description on the TPU Layanan order (moved from ticket 56, owner decision 2026-09-29).

## Notes

Refund of a paid cancellation was settled on 2026-09-25 (see 00-index).

## Comments

- 2026-09-26 — ADR 0004: the Makam TPU records the Pemegang Hak's phone and, when known, email (it shows in the Akun with that Email Terverifikasi); IPTM expiry reminders go by email (ticket 48).

- 2026-10-02 — Builder (ticket 46, first slice: domain + tests; UI, PDF and Antrean row left).
  **Built** in `src/domain/pengurusan/pengajuan-iptm.ts` (public on `Pengurusan`): `catatDimakamkan` (starts the Tagihan's overdue clock via `setOverdueAnchor`, 7-day window), `unggahDokumenPengajuan`, `suratKuasa` / `suratKuasaUntukStaf` (data: PT JKP, filing staff = the Admin Platform who confirmed, Pemegang Hak), `periksaDokumen` (Dokumen Lengkap), `ajukanIptm` (optional Berkas IPTM Tugas), `terbitkanIptm` (Makam TPU create/update, IPTM history, family email via new `Notifications.iptmTerbit`, never reads Tagihan status), `batalkanPengurusan` (unpaid Tagihan voided; paid -> `Refunds.ajukanBaris`: all lines before Dimakamkan, all but Biaya Pengurusan from then on), reads `makamTpuSaya`, `deskripsiMakamTpu` (prefill for the TPU Layanan order), `iptmScanUrl`, `perluTindakanBerkas`, `pengajuanIptmTerbuka`; `PengurusanOrder` gained `riwayat` (timeline), `pengajuan`, `iptm`, `makamTpuId`. Migration 0050 (new `makam_tpu`, new nullable columns on `pengurusan_tpu`; expand-only). `PengurusanDeps` gained `refunds` and `notifikasi.iptmTerbit`; all composition sites updated.
  **Tests**: `pengajuan-iptm.test.ts` (20), `notifications/iptm-terbit.test.ts`; 38 files / 408 tests green across pengurusan, notifications (acara, tagihan-terbit-alur), fieldwork, lib.
  **Process note**: the implementation was drafted before the tests (the tdd instruction arrived mid-run); tests were then written per behaviour and run, not red-first.
  **Spec gaps and decisions for the owner**: (1) The Surat Kuasa's company name is a constant, not read from Pengaturan Operator. (2) "Filing staff member" is taken as the Admin Platform who confirmed the order; say if it should be chosen per filing. (3) A paid cancellation refunds every non-Biaya-Pengurusan line from Dimakamkan, including a hari-H Layanan already done; the spec says "Layanan not yet done" and the module does not look at job state. (4) The Pemegang Hak at another address is sent the order page link, which only the Pemesan's Akun can open; the scan reaches them through their Makam tab (ADR 0004) only if their email has an Akun. (5) Chasing H+3/7/14/30 reminders are not scheduled for a TPU Tagihan at Dimakamkan (only the overdue anchor is set).
  HANDOFF: left for the next agent: (a) Tier 3 "IPTM filing" row in `src/domain/queues` from `pengurusan.pengajuanIptmTerbuka()` (due `dueAt`, 7 days), plus its test; (b) Server Actions, pages and the Surat Kuasa PDF/page (Pemesan order page: upload, cancel, scan link; Makam tab; staff screens); (c) the TPU Layanan order page reading `deskripsiMakamTpu`; (d) a refund test through approval; (e) `npm run build` not run.

- 2026-10-02 — Builder (ticket 46, second slice: Antrean row, actions, pages; tdd red first for the row).
  **Built**: Tier 3 "IPTM filing" row (`src/domain/queues/tier3-iptm-row.ts`, key `iptm_diajukan`, 7 days from Dokumen Lengkap, closes at IPTM Diajukan; `tier3-iptm-row.test.ts`, red then green); the Queues deps' `pengurusan` Pick gained `pengajuanIptmTerbuka`, the worker's Tier 1 Pick is unchanged. Domain exports the filing Zod schemas. Guarded Server Actions: Admin Platform `staf/admin-platform/pengurusan/[nomor]/pengajuan-actions.ts` (Dimakamkan, Dokumen Lengkap, IPTM Diajukan with optional Berkas Petugas, IPTM Terbit with scan), Pemesan `pengurusan/[nomor]/pengajuan-actions.ts` (upload, cancel). Pages: staff order screen shows the step the status waits on; Pemesan order page shows timeline, upload forms, scan link, cancel; Surat Kuasa document pages (Pemesan `/pengurusan/[nomor]/surat-kuasa`, print CSS; staff copy). TPU Layanan order page prefills the grave from `?makam=<Makam TPU id>` via `deskripsiMakamTpu`. Status vocabulary gained Dokumen Lengkap, IPTM Diajukan, IPTM Terbit.
  **Verified**: vitest on queues, pengurusan, notifications, components/makam (all green, 96 + 242 across two runs); lint 0; typecheck 0. `npm run build` not run (host load ~28).
  **Spec gap 6 — built per the owner's decision of 2026-10-02**: the Surat Kuasa PDF is rendered through the PdfRenderer port, stored in the private FileStore and served by a 5-minute signed URL (`Pengurusan.suratKuasaPdfUrl`; route `/pengurusan/[nomor]/surat-kuasa/pdf` redirects to it). The renderer opens a page signed for that one order (HMAC, 2 minutes), not a permanent link.
  **Left**: Makam tab listing (`makamTpuSaya`) and its "Pesan Layanan" link to `/layanan/tpu?makam=<id>`; Perlu tindakan list on the Pemesan's home (`perluTindakanBerkas`); a refund-through-approval test; page-level tests/e2e; `npm run build`.

- 2026-10-02 — Builder (ticket 46, third slice: Makam tab, Perlu tindakan, refund through approval).
  **Built**: Akun Saya → Makam lists the family's Makam TPU (`makamTpuSaya`) with "Pesan Layanan" to `/layanan/tpu?makam=<id>`; `perluTindakanDariBerkasTpu` (`src/lib/perlu-tindakan.ts`, red then green) fed by `Pengurusan.perluTindakanBerkas` in `akun/data.ts`; a refund-after-Dimakamkan test through approval to a Bukti Pengembalian Dana. **Found by that test**: Refunds' `pemilikPesanan` knew only Pemesanan's orders, so a TPU order's Pemesan could not enter the refund account (`rekening_belum_diisi`); `pemilikPesananDari` now also asks Pengurusan through a lazy reference (runtime and test setup wired). Verified: vitest on perlu-tindakan, pengurusan, refunds, queues 21 files / 162 tests green; lint 0; typecheck 0; `npm run build` 0.
  **Still open**: (superseded by the 2026-10-02 fix pass below) the Pemesan-facing screen to enter the refund account for a TPU order is not checked on the Pemesan order page; no page-level tests/e2e for the Makam tab.
  HANDOFF: nothing else queued except the owner's decision on gap 6 and gaps 1-5 above.

- 2026-10-02 — Builder fix pass on the two-axis review (branch ticket-46-tpu-filing).
  - **Spec 1 (Surat Kuasa PDF), fixed**: `suratKuasaPdfUrl` renders, stores (`pengurusan/<id>/surat-kuasa/<uuid>.pdf`), signs for 300 s; null for another Akun or an unknown order. `suratKuasaUntukCetak(nomor)` (no actor) feeds the render page `/pengurusan/[nomor]/surat-kuasa/render`, guarded by `src/lib/surat-kuasa-link.ts`; the print page and the render page share `SuratKuasaDokumen`. Order page offers "unduh PDF". Tests red then green in `pengajuan-iptm.test.ts`, `surat-kuasa-link.test.ts`. Not exercised: the live Chromium rendering the page in a container (no e2e).
  - **Spec 2 (refund rekening on `/pengurusan/[nomor]`), fixed**: a Dibatalkan order shows `RekeningPengembalianForm` (reused, takes the action as a prop) while the refund is Diajukan, a locked note once approved; guarded `isiRekeningPengembalianPengurusanAction` calls `Refunds.isiRekeningPemesan`. The domain path already worked (found in the earlier slice), so the new test (a stranger refused, owner accepted, locked after approval) was green on arrival; no red existed.
  - **Gap 3, left for the owner**: spec says "the other lines (e.g. Layanan not yet done) are refunded". "e.g." makes it an example, so refunding every non-Biaya-Pengurusan line is a reading of the sentence, not a clear violation; whether a Layanan already done should be kept is the owner's call (the module does not read job state).
  - **Standards 1-3, fixed**: `nomorPengurusanSchema` (also used by `periksaDokumen`); `berkasDari` in `src/server/form-fields.ts` replaces both File conversions; both `GAGAL` maps are `Partial<Record<reason union, string>>`. Left: the duplicated `Feedback`/`inputClass` in the two forms files (judgement, not requested).
  - Verified: vitest on pengurusan, surat-kuasa-link, tagihan-terbit-alur; lint 0; typecheck 0.
- 2026-10-02 — Builder second fix pass (security re-review, branch ticket-46-tpu-filing).
  - **Render link key (hard), fixed**: `src/lib/surat-kuasa-link.ts` derives its own key from AUTH_SECRET with HKDF-SHA256 (info `makam/surat-kuasa-render/v1`, salt `makam-v1`), computed once per secret in `kunciLink`; no new variable. Test: a link MACed with the raw AUTH_SECRET is refused (red, then green); valid and expired links behave as before.
  - **Sentry**: `scrubText` masks the `tanda` and `sampai` query values (`[tanda]`); test in `scrub.test.ts`.
  - **Headers**: `next.config.ts` sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer` for `/pengurusan/:nomor/surat-kuasa/render` (checked in the build's routes manifest, no unit test).
  - **Gap 3, owner decision 2026-10-02 applied**: a paid TPU cancellation refunds only hari-H Layanan not yet done. Layanan gained `pekerjaanTpuSelesaiUntukTagihan` (Selesai or Keluhan jobs of a Tagihan, label and amount); Pengurusan drops one matching Layanan line per done job. When a done job is dropped the request is not marked `penuh` (Refunds refuses `penuh` with lines left out). Test in `layanan/tpu.test.ts` (two hari-H Bunga Tabur, one done, only the other refunded).
  - **Spec gap for the owner**: no public function finishes a TPU job yet (ticket 57), so the test sets one job to Selesai directly in the database; match to a Tagihan line is by label plus amount.
