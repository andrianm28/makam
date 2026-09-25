# Saat Duka at a DKI TPU: list section and submission

Status: ready-for-agent
Blocked by: 22, 43, 63
Spec: Domain modules > 8. Pengurusan (Saat Duka TPU, burial type, eligibility, documents, Pemegang Hak); 3. Lokasi (working-time calculator, TPU window); stories 19, 68, 69, 70, 71, 72

## What to build

Add the TPU section below the Lokasi Mitra cards in Pilih makam ("dimakamkan lewat Pengurusan"), listing only TPUs taking new plots, and the type chip Semua / Lokasi Mitra / TPU DKI. The Saat Duka TPU submission (a Pengurusan order in the Pengurusan module) asks: Baru (only TPUs taking new plots) or Tumpang (describe the grave + photo of the IPTM, with warnings about the 3-year rule and consent); eligibility "KTP DKI?" and "Meninggal di Jakarta?"; the Pemegang Hak for the IPTM with WhatsApp (default the Pemesan). OTP at Kirim as in ticket 22. Submitted at night, it shows the computed confirmation time, the CS WhatsApp and its reply hours ("dibalas mulai pukul 06:00", both from Pengaturan Operator, ticket 63) and a note that the family can go to the TPU directly and still have the IPTM filed later.

## Acceptance criteria

- [ ] The TPU section lists only TPUs with "menerima makam baru" on; the chip filters the combined list.
- [ ] Eligibility: no/no blocks the order and points to Lokasi Mitra; "Meninggal di luar Jakarta" adds the Pasal 17(2) documents to the checklist.
- [ ] Two document sets are attached to the order: for the burial (brought) and for the filing (uploaded later).
- [ ] Tumpang requires a grave description and an IPTM photo and shows the 3-year and consent warnings.
- [ ] Submission creates a Saat Duka TPU order (Diajukan, Nomor Pemesanan) with a confirmation deadline of 2 service hours on the 06:00–18:00 clock ("paling lambat pukul 08:00" for a 23:00 submission).
- [ ] Price lines shown: Biaya Pengurusan (burial amount) as a service fee and Retribusi Pemda Rp 0; no Biaya Layanan Platform.
- [ ] The submission screen has an optional email field, saved on the account and used only for Tagihan / Bukti copies and the login OTP fallback (as ticket 22).
- [ ] Tests: eligibility blocking; outside-Jakarta documents; deadline on the TPU clock; list filtering by the flag.

## Notes

Hari-H Layanan on a TPU Saat Duka checkout (fulfilled by a Mitra Jasa) are added by ticket 56.
