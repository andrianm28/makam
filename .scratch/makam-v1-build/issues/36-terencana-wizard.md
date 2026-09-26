# Pemesanan Terencana wizard with Denah picker and plot hold

Status: ready-for-agent
Blocked by: 16, 82
Spec: Domain modules > 6. Pemesanan (Terencana); 5. Inventory (hold); Public site > Booking wizards (Terencana: Lokasi → Petak → Data & kirim); stories 39, 40, 41, 42, 43, 44, 45

## What to build

The Terencana wizard: Lokasi (filter by city, all-in price range and facilities; only Lokasi with Terencana switched on) → Petak (the Denah, picking one or more Tersedia Petak or a Kavling Keluarga; occupied, reserved and blocked plots not pickable; a tumpang-only plot tells the Pemesan to contact the Admin Lokasi) → Data & kirim (Calon Penghuni default "untuk saya sendiri", Pemegang Hak, required email and phone, email Kode Masuk at Kirim as in ticket 22). The headline price covers Harga Hak Pakai + Biaya Layanan Platform, with a separate "Nanti" line for Biaya Pemakaman + Biaya Layanan Platform "sesuai tarif saat pemakaman (saat ini Rp X)". The Syarat Pemesanan Terencana (Masa Pembatalan, later refund %, the right being against the Lokasi Mitra) is shown before Kirim and snapshotted on the order. Submission places a hold on the chosen plots.

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

## Comments

- 2026-09-26 — ADR 0004: Data & kirim follows ticket 22: required email proven by the Kode Masuk, phone as contact, "Tidak punya email? Minta bantuan CS". Now blocked by 82.
- 2026-09-26 — Decided with the user from the public prototype v2 (https://claude.ai/artifact/SYuh5fzc8TjkWQ5aoecYiF, branch worktree-agent-ab5e1eadecba063e3, commit 23d2d17): the Terencana Lokasi step has no total bar and a card opens the Denah; the Denah picker shows Tersedia / Pilihan Anda / Dipesan / Terisi / Tidak Tersedia / Kavling Keluarga / Jalan / Bukan Petak, with a small corner dot on a Terisi Petak that can still take a tumpang (legend "Terisi, bisa untuk tumpang (hubungi Admin Lokasi)"); several Petak across Bloks or Jenis Makam may be picked in one order (one Hak Pakai each, same Pemegang Hak) or one whole Kavling Keluarga; a Petak taken meanwhile is caught both at Lanjut and at Kirim with the same friendly message, returning to the Denah with the other picks kept; the Syarat Pemesanan Terencana are shown and snapshotted with the order, with no "Saya setuju" checkbox; one Biaya Layanan Platform per Tagihan.
