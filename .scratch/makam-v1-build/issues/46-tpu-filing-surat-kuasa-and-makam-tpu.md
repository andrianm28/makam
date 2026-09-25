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
- [ ] Makam TPU: TPU, blok/nomor, Almarhum(s), Pemegang Hak + WhatsApp, current IPTM scan + expiry, IPTM history; a Tumpang order updates the existing record instead of creating one.
- [ ] Cancel before IPTM Diajukan → Dibatalkan; an unpaid Tagihan becomes Dibatalkan; after filing, cancel is refused.
- [ ] A paid order cancelled before IPTM Diajukan gets a refund request (ticket 31, approved by Admin Platform): the full amount paid, except that at or past Dimakamkan (burial arranged with the TPU) the Biaya Pengurusan is kept and only the other lines (e.g. Layanan not yet done) are refunded.
- [ ] No Bukti Pemesanan / Perpanjangan is issued at a TPU.
- [ ] Tests: status sequence; 7-day document window; Makam TPU creation and tumpang update; IPTM handed over while unpaid; cancellation before/after filing; refund amount of a paid cancellation before vs at/after Dimakamkan.

## Notes

Refund of a paid cancellation was settled on 2026-09-25 (see 00-index).
