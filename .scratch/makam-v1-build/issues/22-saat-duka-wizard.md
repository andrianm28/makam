# Pemesanan Saat Duka wizard at a Lokasi Mitra

Status: ready-for-agent
Blocked by: 16
Spec: Domain modules > 6. Pemesanan (Saat Duka); Public site > Booking wizards; stories 17, 18, 20, 21, 22, 24, 25, 26, 28

## What to build

The Pemesan's Saat Duka path, prototype 18 variant D: one decision per screen, a progress bar with back, a sticky total bar and no review screen. Screen 1 "Pilih makam": one list of Lokasi Mitra × Jenis Makam cards sorted by all-in total, filtered by city (prefilled from the last choice), only cards with Tersedia units, each with its count; outside Jam Operasional the card says when confirmation will come and shows the Kontak Siaga. Screen 2 "Data & kirim": Pemesan name + WhatsApp, Almarhum name + date of death, optional planned burial time and placement wish, Pemegang Hak defaulting to "Saya sendiri" (else name + WhatsApp), an optional email, the note that nothing is paid now and documents can follow, and the WhatsApp OTP at Kirim that verifies the number and creates the account. Submission creates the order in the Pemesanan module (status Diajukan, Nomor Pemesanan) and shows a status timeline with the computed confirmation deadline.

## Acceptance criteria

- [ ] Cards use `quote()` for the all-in total (Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform) and hide Jenis Makam with 0 cleared Tersedia units; the count is shown.
- [ ] Only Terverifikasi Lokasi appear; the Lokasi page deep link preselects the Lokasi.
- [ ] The sticky bar shows "Total semua biaya" and expands to the itemised lines.
- [ ] Outside Jam Operasional the card shows the confirmation time from the working-time calculator (2 service hours) and the Kontak Siaga's name and number.
- [ ] Kirim triggers the OTP component (with the ~60 s fallback, "Kirim lewat email" or the CS pointer, once ticket 60 lands); on success the account exists and is logged in.
- [ ] The order gets a Nomor Pemesanan `MKM-YYYY-NNNNNN` and status Diajukan; the order page shows the timeline and "dikonfirmasi paling lambat <waktu>".
- [ ] The Pemegang Hak defaults to the Pemesan and can never be the Almarhum.
- [ ] Nothing is billed at submission (no Tagihan exists).
- [ ] "Data & kirim" has an optional email field; it is saved on the Pemesan's account and used only to send copies of Tagihan / Bukti documents and the login OTP fallback via SES (tickets 20, 60). An email typed here for a number with no account yet does not enable the OTP fallback at this Kirim.
- [ ] Tests: domain test for submission (order, Nomor Pemesanan, deadline from Jam Operasional, no Tagihan); list filtering by Tersedia and city; a Playwright pass through both screens with the fake OTP.

## Notes

The TPU section below the cards is ticket 44; hari-H Layanan at checkout is ticket 53; the same optional email field is on the Terencana (36), TPU (44), Perpanjangan (40) and standalone Layanan (50) checkouts and in the Akun Saya profile (27).
