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
  **Spec gap for the owner (6)**: the Surat Kuasa "PDF" through the PdfRenderer port is NOT built. The live renderer fetches the page without a session, and the Surat Kuasa is personal (own Pemesan only), so it needs a decision: an unguessable signed link (like a Tagihan's) or a short-lived render token. The page prints to PDF from the browser meanwhile.
  **Left**: Makam tab listing (`makamTpuSaya`) and its "Pesan Layanan" link to `/layanan/tpu?makam=<id>`; Perlu tindakan list on the Pemesan's home (`perluTindakanBerkas`); a refund-through-approval test; page-level tests/e2e; `npm run build`.
