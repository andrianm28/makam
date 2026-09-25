# Pemesanan Terencana wizard with Denah picker and plot hold

Status: ready-for-agent
Blocked by: 16
Spec: Domain modules > 6. Pemesanan (Terencana); 5. Inventory (hold); Public site > Booking wizards (Terencana: Lokasi → Petak → Data & kirim); stories 39, 40, 41, 42, 43, 44, 45

## What to build

The Terencana wizard: Lokasi (filter by city, all-in price range and facilities; only Lokasi with Terencana switched on) → Petak (the Denah, picking one or more Tersedia Petak or a Kavling Keluarga; occupied, reserved and blocked plots not pickable; a tumpang-only plot tells the Pemesan to contact the Admin Lokasi) → Data & kirim (Calon Penghuni default "untuk saya sendiri", Pemegang Hak, OTP). The headline price covers Harga Hak Pakai + Biaya Layanan Platform, with a separate "Nanti" line for Biaya Pemakaman + Biaya Layanan Platform "sesuai tarif saat pemakaman (saat ini Rp X)". The Syarat Pemesanan Terencana (Masa Pembatalan, later refund %, the right being against the Lokasi Mitra) is shown before Kirim and snapshotted on the order. Submission places a hold on the chosen plots.

## Acceptance criteria

- [ ] Only Terverifikasi Lokasi with "Pemesanan Terencana aktif" appear.
- [ ] The Denah picker allows only cleared Tersedia Petak / Tersedia Kavling Keluarga; Dipesan, Terisi, Tidak Tersedia and Perlu Verifikasi cells are disabled with a legend.
- [ ] A tumpang-only (released, still Terisi) plot shows "hubungi Admin Lokasi" instead of being pickable.
- [ ] Prices come from `quote()`; the Nanti line shows the current Biaya Pemakaman + Biaya Layanan Platform.
- [ ] The Syarat snapshot is stored on the order and later reads use the snapshot, not the Lokasi's current policy.
- [ ] Submission: status Diajukan, Nomor Pemesanan, hold on every chosen Petak / kavling so no one else can take it; a concurrent second submission for the same plot fails.
- [ ] Tests: hold placement and race; picker eligibility; Syarat snapshot immutability after a policy change.

## Notes

Empty-plot Layanan at this checkout is ticket 53.
