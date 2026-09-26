# Perpanjangan at a Lokasi Mitra: OTP path and Bukti Perpanjangan

Status: ready-for-agent
Blocked by: 29, 32, 34, 82
Spec: Domain modules > 7. Perpanjangan; 10. Billing (Perpanjangan pay-first, Bukti Perpanjangan); 11. Payouts (Perpanjangan on payment); stories 58, 62, 63, 64, 65, 66

## What to build

The Perpanjangan module's direct path. From the hub lookup (or the Makam tab), a Perpanjangan is open from 3 months before the end date to the end of the Masa Tenggang. A code sent to the email recorded on the Hak Pakai (skipped when logged in with that Email Terverifikasi; with no recorded email, the manual paths of ticket 41 apply) takes the Pemegang Hak straight to choosing 1–K terms with the price shown. A pay-first Tagihan addressed to the Pemegang Hak is due 3×24 h after issue; anyone may pay it without gaining any right. On payment the new end date = old end date + terms × N (never counted from payment), a Bukti Perpanjangan is issued in the Lokasi Mitra's name, and the Pencairan item is due at once.

## Acceptance criteria

- [ ] When not possible, a note replaces the button: "berlaku selamanya" (perpetual), "bisa diperpanjang mulai <tanggal>" (too early), "hubungi Admin Lokasi" (Berakhir, Dibatalkan, or other).
- [ ] An overdue pay-after Tagihan on the Hak Pakai blocks with "Lunasi Tagihan TGH/… terlebih dahulu" and a pay link.
- [ ] The code goes to the Hak Pakai's recorded email; an Akun logged in with that Email Terverifikasi skips it; with no recorded email the button points to the manual paths (ticket 41). _(Amended 2026-09-26, ADR 0004.)_
- [ ] Terms 1..K (Lokasi policy, default 1); price = Perpanjangan price per term × terms from `quote()` + Biaya Layanan Platform.
- [ ] New end = old end + terms × N years, applied automatically on payment, also when paid inside the Masa Tenggang.
- [ ] Bukti Perpanjangan `BPP/YYYY/NNNNNN`: Petak Makam, Pemegang Hak, old and new end dates, terms bought; in the Lokasi Mitra's name with the PT JKP header.
- [ ] A Hak Pakai flagged Perlu Verifikasi must be completed by the Admin Lokasi before the Perpanjangan proceeds.
- [ ] Pencairan: Perpanjangan item due on payment.
- [ ] The checkout's email follows ticket 22 (required unless logged in, proven by a Kode Masuk); the Tagihan and Bukti Perpanjangan go by email. _(Amended 2026-09-26, ADR 0004; was an optional email for copies.)_
- [ ] Tests: the open window; each blocking note; end-date arithmetic (early renewal, renewal in masa tenggang, K terms); code skip when logged in with the recorded email; payer ≠ Pemegang Hak gets no right; lapse to Dibatalkan at 3×24 h.

## Notes

For a Kavling Keluarga the Perpanjangan covers the whole kavling. The optional "Tambah Layanan" step before payment is ticket 53.

## Comments

- 2026-09-26 — ADR 0004: the "OTP path" is now a code to the email recorded on the Hak Pakai, skipped for the Akun with that Email Terverifikasi; no recorded email → manual paths. Now blocked by 82. The title keeps "OTP path" for continuity.
