# Paket Layanan subscriptions and cycles

Status: ready-for-agent
Blocked by: 50
Spec: Domain modules > 9. Layanan (Recurring cycles); 10. Billing (Paket cycle due H-1); 15. Notifications (Paket H-7, H-1); 16. Scheduler (issue cycles, skip, pause); stories 87, 88, 89, 90

## What to build

A Pemesan orders a Paket Layanan for a grave (sekali, bulanan, 3-bulanan, tahunan), priced as the sum of its items. Each cycle's Tagihan is issued at H-7 (pay-first, due H-1) with a reminder at H-1; an unpaid cycle is skipped (no work done on credit). Two skips in a row pause the Paket, and the Pemesan can resume. The ordering account can Hentikan Paket from the next unissued cycle. The Paket stops when the Hak Pakai is Berakhir. A new tariff applies from the next cycle, and the H-7 message says so. Active Paket appear on the grave in the Makam tab.

## Acceptance criteria

- [ ] Cycle tick issues one Tagihan per cycle at H-7 (items + Biaya Layanan Platform at a Lokasi), idempotent.
- [ ] Payment schedules one Pekerjaan Layanan per item for that cycle.
- [ ] Unpaid at H-1 → the Tagihan lapses and the cycle is Skipped; two consecutive skips → Paket paused; resume restarts from the next cycle.
- [ ] Hentikan: no further cycles from the next unissued one; already-issued cycles stay.
- [ ] Hak Pakai Berakhir → Paket stopped.
- [ ] A tariff version effective before a cycle's issue applies to that cycle; the H-7 message mentions the change.
- [ ] Tests: cycle issue dates per frequency; skip → pause; resume; Hentikan; stop on Berakhir; tariff change on the next cycle.

## Added (2026-09-25)

- [ ] Optional email field on the order screen (copies of Tagihan / Bukti by email through SumoPod SMTP; SES dropped 2026-09-25), as in spec "Booking wizards".

## Comments

- 2026-10-01 — **Slice 1 dibangun di worktree `makam-t54`.** Yang jadi: tick siklus Paket Layanan dan penjadwalan Pekerjaan pada pembayarannya, dua AC pertama. Tabel baru di modul `layanan`: `pesanan_paket` (langganan: paket, frekuensi, status, `next_cycle_date`) dan `pesanan_paket_item` (snapshot item saat order). `pesanan_layanan` mendapat dua kolom nullable — `pesanan_paket_id` dan `siklus` — plus unique index `(pesanan_paket_id, siklus)`: satu siklus adalah satu baris `pesanan_layanan` yang membawa item, Tagihan, dan Pekerjaannya, sehingga alur order satu kali (ticket 50), pembayaran yang menjadwalkan (`efekJadwalkanPekerjaan`), bukti, Keluhan, dan refund bekerja pada siklus tanpa aturan kedua. Migrasi `0047_worried_dark_beast.sql` expand murni (dua CREATE TABLE, dua ADD COLUMN nullable, index). Tick `layanan.paket_siklus` (per jam) menerbitkan Tagihan siklus di H-7 lewat `tagihanDue` `paket_cycle` (pay-first, jatuh tempo H-1 23:59 WIB), dengan item siklus plus satu Biaya Layanan Platform; `next_cycle_date` maju sesuai frekuensi (`sekali` → null), jadi tick kedua tidak menerbitkan apa pun. `bacaPesananPaket` adalah bacaan publik untuk tes dan layar nanti.

  **Keputusan yang saya ambil (bukan dari spec):** (1) **tanggal siklus pertama** datang dari input order (`mulai`); spec tidak menyebut kapan siklus pertama relatif ke pemesanan, jadi order screen yang akan memilihnya. (2) **Item di-snapshot** saat order (`pesanan_paket_item`), bukan dibaca ulang dari `layanan_paket_item` tiap siklus: `hapusPaket`/`ubahPaket` tidak mengubah langganan yang sudah berjalan, dan harga tetap di-quote segar tiap siklus sehingga perubahan tarif (slice berikutnya) tetap berlaku. (3) **Order flow-nya minimal**: `berlanggananPaket` (validasi email/Akun, Hak Pakai, Paket ditawarkan) adalah seam yang tick butuhkan; layar order, Server Action, dan pesan H-7 **belum** dibangun.

  **Slice berikutnya (belum dibangun, jangan diklaim):** pesan H-7 lewat Notifications (aturan pengingat `paket_cycle` sudah ada di `ATURAN_PENGINGAT`), skip saat H-1 → pause setelah dua skip, resume, Hentikan dari siklus berikutnya yang belum terbit, stop saat Hak Pakai Berakhir, kata-kata "tarif berubah" di pesan H-7, dan kolom email opsional di layar order (Added 2026-09-25). Layar/screen order Paket Layanan juga belum ada.

  **Angka dari log:** `npx vitest run src/domain/layanan src/domain/billing src/domain/scheduler` → 26 berkas / 303 tes, exit 0. `siklus.test.ts` 6 tes. `npm run typecheck` exit 0, `npm run lint` exit 0, `npm run build` exit 0 (`Compiled successfully in 65s`), lalu `.next` dan `dist` dihapus. Catatan: `MAKAM_TEST_PG=shared` butuh `MAKAM_TEST_PG_URL=postgres://makam:makam@127.0.0.1:55432/postgres` di sesi ini karena soket Docker ditolak; tes tetap berjalan di Postgres.
