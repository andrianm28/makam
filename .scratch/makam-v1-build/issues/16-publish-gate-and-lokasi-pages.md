# Publish gate, Terencana switch, Lokasi Mitra page and Daftar Lokasi

Status: ready-for-agent
Blocked by: 11, 12, 14, 15
Spec: Domain modules > 3. Lokasi (publish gate, Terencana flag); Tariffs (all-in quote); stories 7, 8, 9, 10, 11, 12, 151

## What to build

Compute the publish gate (signed agreement + completed Kunjungan Verifikasi + tariffs checked); only then can Admin Platform publish a Lokasi Mitra (status Terverifikasi). Admin Platform switches "Pemesanan Terencana aktif" on separately, only after every Petak is cleared and a Cek Denah is done. Build the public Lokasi Mitra page and the Daftar Lokasi Makam directory (Lokasi Mitra for now; DKI TPU cards are added in ticket 43), with every price from the all-in quote.

## Acceptance criteria

- [ ] Publishing is rejected unless agreement scan + completed Kunjungan Verifikasi + "tariffs checked" are all present; Terverifikasi Lokasi are the only ones listed.
- [ ] Terencana can be switched on only with no Perlu Verifikasi Petak left and a completed Cek Denah; until on, the Lokasi page hides the Terencana entry and shows "Pemesanan terencana segera tersedia".
- [ ] The Lokasi page shows "Terverifikasi Makam.co.id · dikunjungi <bulan tahun>" with a "what we checked" popover; "Dikelola oleh <pengelola>"; visit photos with dates; facilities checklist.
- [ ] It shows every Harga Hak Pakai per Jenis Makam with its tenure, the Biaya Pemakaman (and tumpang amount), Perpanjangan prices, the Pembatalan policy, the document checklist and "Harga berlaku sejak <tanggal>", each as an all-in total with the parts in small print; "Harga baru mulai <tanggal>" when a version is scheduled.
- [ ] The Lokasi page deep-links into the Saat Duka wizard (and Terencana when on) with the Lokasi preselected.
- [ ] Daftar Lokasi Makam: filter by city, type and facilities; each card shows "mulai Rp X" all-in.
- [ ] Late confirmations and declines counted on the Lokasi are not shown publicly.
- [ ] Tests: publish gate combinations; Terencana switch preconditions; the page price equals `quote()` for the same lines at the same instant.

## Notes

Layanan prices on the Lokasi page are added by ticket 49; the Ditangguhkan / Berhenti banner by ticket 59.
