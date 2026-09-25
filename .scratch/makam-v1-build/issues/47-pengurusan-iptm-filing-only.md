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

- [ ] Optional email field on the order screen (copies of Tagihan / Bukti via SES), as in spec "Booking wizards".
