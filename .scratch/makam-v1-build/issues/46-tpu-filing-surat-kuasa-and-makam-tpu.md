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
- 2026-10-02 — Owner decision 2026-10-02 ("ya setuju semua" to the orchestrator's list of open questions; small concrete choices put to the owner directly, recorded here as settled): spec gap 6 settled — the Surat Kuasa PDF is served through a **short-lived signed URL**, as AGENTS.md's Privacy rule already requires for family documents (never an unguessable-but-permanent link). Other open gaps of this ticket unchanged.
- 2026-10-02 — **Two-axis review of the whole branch (head 75e698e), recorded before the fix pass.** Fixed point origin/main.
  - **Standards: 0 hard, 4 judgement.** `periksaDokumenAction` validates with `catatDimakamkanSchema` (give it its own or a shared `nomorPengurusanSchema`); the `File` → `{body, contentType}` conversion, the `GAGAL` maps and the `Feedback`/`inputClass` helpers repeat across the two `pengajuan-actions.ts` / `pengajuan-forms.tsx`; `GAGAL: Record<string,string>` keyed by free strings (key it by the result's `reason` union); `iptmScanKey`/`iptmBerlakuSampai` overlap between `pengurusan_tpu` and `makam_tpu` (deliberate, leave). Clean: guarded actions, Clock, private FileStore with a 300 s signed URL for the IPTM scan, table ownership, refunds raised in the cancellation transaction, the lazy `pengurusanRef`, client imports, expand-only 0050.
  - **Spec: 2 hard.** (1) The Surat Kuasa PDF via a short-lived signed URL (owner decision 2026-10-02, above) is not built: the branch has only a print page (`src/app/pengurusan/[nomor]/surat-kuasa/page.tsx`); the branch was cut before the decision, so its "gap 6 waits for the owner" is stale. (2) A paid TPU cancellation raises a refund request, but the Pemesan has no route to enter the refund rekening: `/pengurusan/[nomor]` has no link or form, and `isiRekeningPengembalianAction` serves Pemesanan orders only. Judgement: gap 3 — a Layanan already done is also refunded, where the spec says only "not yet done" (fix it if the spec sentence is unambiguous; otherwise leave it under spec gaps); gaps 1, 2, 4, 5 and the missing page tests are recorded and not blocking.
  - **Fix pass**: Spec 1 and 2 with tests; Standards items 1–3.
- 2026-10-02 — **Owner decision** (AskUserQuestion, after "ya setuju semua"): gap 3 — on a paid TPU cancellation, only Layanan **not yet done** are refunded; a Layanan already done is not.
- 2026-10-02 — **Re-review of the second fix pass (head 09208d0): 0 hard.** Render-link key derived by HKDF-SHA256 (info `makam/surat-kuasa-render/v1`), raw-secret links refused (test); `tanda`/`sampai` scrubbed (test); no-store and no-referrer headers on the render route (verified in the build manifest only — judgement); refund of only not-yet-done Layanan per the owner (test); the test's direct DB seeding of a Selesai TPU job is acceptable as setup, with the switch to `setujuiBuktiTpu` recorded as an item in ticket 57. Ready to merge.
