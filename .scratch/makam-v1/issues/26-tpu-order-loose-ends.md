# TPU order loose ends

Type: grilling
Status: resolved
Map: ../map.md

## Question

1. **Perpanjangan at a DKI TPU, end to end**: "How Perpanjangan verifies the Pemegang Hak" settled identity and documents only. What does the family pay (Biaya Pengurusan, same as for a burial?), before or after the filing? Statuses and service-level time; what if the PTSP rejects the filing (refund?); what if the IPTM has already lapsed past the Pemda's grace period?
2. **What a TPU Pemesan receives as proof**: "Pemesanan Saat Duka at a DKI TPU via Pengurusan" issues a Bukti Pemesanan, but the glossary defines it as proof of a Hak Pakai in a Lokasi Mitra's name. Is the TPU proof the IPTM scan plus the Bukti Pembayaran, or a separate document (e.g. "Bukti Pengurusan") with its own content?
3. **Night submissions**: ticket 15 promises confirmation by 07:00, while the back-office rules (first alert 06:00, 2 h deadline, escalation at 90 min) imply 08:00. Which promise is shown to the family, and what contact is shown after hours now that there is no night on-call for TPU?

## Answer

Decided with the user on 2026-09-25 (grilling, all recommendations accepted). Facts from [cemetery-plot-regulation.md §2](../research/cemetery-plot-regulation.md) and [dki-tpu-burial-sequence.md](../research/dki-tpu-burial-sequence.md). `CONTEXT.md`: Pengurusan, Biaya Pengurusan and Bukti Pemesanan sharpened.

**One payment rule for Pengurusan**: Pengurusan that includes **arranging a burial** is paid after (unchanged, "Pemesanan Saat Duka at a DKI TPU via Pengurusan"). **Filing-only** Pengurusan (a Perpanjangan, or Pengurusan IPTM after a burial the family arranged themselves) is **paid before**: Admin Platform checks the documents first, then the Tagihan is issued, and the Petugas / filing only starts once it is Lunas. Due date and unpaid outcome are as for a Lokasi Mitra Perpanjangan in "Tagihan deadlines and refunds after Pencairan": 3×24 h after issue, reminders H-1 and on the due day, unpaid → Dibatalkan with no chasing (no work was done yet). Filing-only orders never enter "Tagihan lewat jatuh tempo".

**1. Perpanjangan at a DKI TPU, end to end** (identity and documents as in "How Perpanjangan verifies the Pemegang Hak")

- **Price**: one DKI-wide **Biaya Pengurusan** amount for filing-only work, set by Admin Platform, separate from (and lower than) the burial amount. Tagihan lines: Biaya Pengurusan (as a service fee) + Retribusi Pemda IPTM Rp 0. Always **one term (3 years)** per filing, no term picker.
- **When it can be asked**: from **3 months before** the IPTM's expiry. The form asks for the expiry date (read off the IPTM photo, corrected by Admin Platform). From the stored TPU plot record the Pemegang Hak gets a WhatsApp reminder 3 months and 1 month before expiry.
- **Past the 3-month masa tenggang** (Perda 3/2007; enforcement unverified): not blocked. The form warns "Masa perpanjangan mungkin sudah lewat; kami akan menanyakan ke TPU dulu, tanpa biaya". Admin Platform asks the TPU **before** issuing the Tagihan; if the TPU will not renew, the request closes **Ditolak** with nothing paid and a note pointing the family to the TPU office.
- **Statuses**: Diajukan → (Perlu Perbaikan ↺) → Menunggu Pembayaran → Diproses (Petugas Lapangan fetches the surat pengantar / the original old IPTM) → IPTM Diajukan → IPTM Terbit; also Ditolak, Dibatalkan.
- **Service levels**: document check within 1 working day of Diajukan; filing within 3 working days of Lunas; JakEVO's own 1 working day. The family sees "IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran". Both steps are Tier 3 Antrean rows beside burial IPTM filing.
- **PTSP rejects**: fixable (missing or unclear document, surat kuasa problem) → Perlu Perbaikan and refiled at no charge. Final (applicant not accepted as ahli waris, plot reassigned, grace period refused) → **Ditolak with a full refund** of the Biaya Pengurusan (Bukti Pengembalian Dana); the Operator checked before billing, so a miss is its risk. The PTSP's reason is shown to the family.
- **Proof**: the new IPTM scan (as before) plus the Bukti Pembayaran; no Operator-issued Bukti Perpanjangan at a TPU.

**2. What a TPU Pemesan receives as proof**

- **No Bukti Pemesanan at a TPU.** The family gets the **Bukti Pembayaran** (money), the **order page** (Konfirmasi details and status) and the **IPTM scan**, which is the only proof of the right. An Operator-issued "bukti" for a TPU grave would compete with the Pemda permit and read like middleman paperwork. Amends item 11 of "Pemesanan Saat Duka at a DKI TPU via Pengurusan".

**3. Night submissions and after-hours contact**

- **The 2-hour clock pauses** at 18:00 and resumes at 06:00: one rule, "2 jam layanan, 06:00–18:00", exactly the Antrean deadline in "Admin Platform back-office queue and on-call". The submission screen shows the computed time ("dikonfirmasi paling lambat pukul 07:00" for a 17:00 submission, 08:00 for one at 22:00). Replaces "confirmed by 07:00" in "Pemesanan Saat Duka at a DKI TPU via Pengurusan".
- **After hours**, no personal on-call number: the screen shows the **CS WhatsApp number** with "dibalas mulai pukul 06:00", and the line "Jika pemakaman harus dilakukan sebelum pukul <jam konfirmasi>, keluarga dapat langsung datang ke TPU; kami tetap bisa mengurus IPTM setelahnya", linking the free DIY guide and Pengurusan IPTM.

**4. Pengurusan IPTM (new order kind, v1)**

- For a family that buried at a DKI TPU on their own and wants only the IPTM filed. Entry point on the "Pengurusan di TPU DKI" page ("Sudah dimakamkan? Kami urus IPTM-nya") and from the after-hours line above.
- The burial order's flow without its first two steps: starts at **Dimakamkan** → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit (plus Dibatalkan / Ditolak). Baru or tumpang, eligibility and uploads as for the burial order; the Petugas Lapangan fetches the TPU's surat pengantar.
- Priced and paid as filing-only (above): the filing-only Biaya Pengurusan, Tagihan after the document check, filing on Lunas; final PTSP rejection refunded as for Perpanjangan.
- Uploads due within **7 days of the order** (not of the burial); after that Admin Platform follows up by hand, as for burial orders.
- The IPTM scan and expiry go on a TPU plot record, as for any TPU order.

**Consistency review 2** (2026-09-25): the Pengurusan IPTM status list gains `Menunggu Pembayaran` between Dokumen Lengkap and IPTM Diajukan, since it is filing-only and paid before the filing.
