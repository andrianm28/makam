# Saat Duka at a DKI TPU: list section and submission

Status: ready-for-agent
Blocked by: 22, 43, 63, 82
Spec: Domain modules > 8. Pengurusan (Saat Duka TPU, burial type, eligibility, documents, Pemegang Hak); 3. Lokasi (working-time calculator, TPU window); stories 19, 68, 69, 70, 71, 72

## What to build

Add the TPU section below the Lokasi Mitra cards in Pilih makam ("dimakamkan lewat Pengurusan"), listing only TPUs taking new plots, and the type chip Semua / Lokasi Mitra / TPU DKI. The Saat Duka TPU submission (a Pengurusan order in the Pengurusan module) asks: Baru (only TPUs taking new plots) or Tumpang (describe the grave + photo of the IPTM, with warnings about the 3-year rule and consent); eligibility "KTP DKI?" and "Meninggal di Jakarta?"; the Pemegang Hak for the IPTM with phone number and, if known, email (default the Pemesan). Email Kode Masuk at Kirim and "Tidak punya email? Minta bantuan CS" as in ticket 22. Submitted at night, it shows the computed confirmation time, the CS WhatsApp and its reply hours ("dibalas mulai pukul 06:00", both from Pengaturan Operator, ticket 63) and a note that the family can go to the TPU directly and still have the IPTM filed later.

## Acceptance criteria

- [x] The TPU section lists only TPUs with "menerima makam baru" on; the chip filters the combined list.
- [x] Eligibility: no/no blocks the order and points to Lokasi Mitra; "Meninggal di luar Jakarta" adds the Pasal 17(2) documents to the checklist.
- [x] Two document sets are attached to the order: for the burial (brought) and for the filing (uploaded later).
- [x] Tumpang requires a grave description and an IPTM photo and shows the 3-year and consent warnings.
- [x] Submission creates a Saat Duka TPU order (Diajukan, Nomor Pemesanan) with a confirmation deadline of 2 service hours on the 06:00–18:00 clock ("paling lambat pukul 08:00" for a 23:00 submission).
- [x] Price lines shown: Biaya Pengurusan (burial amount) as a service fee and Retribusi Pemda Rp 0; no Biaya Layanan Platform.
- [x] The submission screen has an optional email field, saved on the account and used only for Tagihan / Bukti copies and, once the Pemesan verifies it, the email Kode Masuk (as ticket 22; verification and email login are ticket 67).
- [x] Tests: eligibility blocking; outside-Jakarta documents; deadline on the TPU clock; list filtering by the flag.

## Notes

Hari-H Layanan on a TPU Saat Duka checkout (fulfilled by a Mitra Jasa) are added by ticket 56.

## Comments

- 2026-09-27 — Dibangun sebagai modul `pengurusan` yang baru: ia memiliki tabelnya sendiri (`pengurusan_tpu`, migrasi `0022_exotic_vanisher`, create-only), `lokasi` tetap pemilik data TPU dan dibaca lewat `publicTpuDkiList` / `publicTpuDki`, dan deadline 2 jam kerja dihitung `daytimeHoursDeadline` milik Lokasi (tiket 11), bukan dihitung ulang.
- 2026-09-27 — AC 7 dibaca sebagai field email **Pemegang Hak**: field Pemesan tetap read-only seperti tiket 22, karena mengubah email Akun itu kerja login/verifikasi (tiket 67) yang tidak dibangun di sini. Email opsional disimpan di order (dengan nama, telepon, dan email Pemegang Hak), dipakai untuk salinan Tagihan / Bukti, dan membuat makam itu muncul di Akun email tersebut (story 101).
- 2026-09-27 — Tidak ada harga yang disimpan dua kali: kartu dan order membaca `quote()` yang sama, sehingga Biaya Layanan Platform tidak mungkin ikut (tariffs hanya menambahkannya pada baris Lokasi Mitra).
- 2026-09-27 — Two document sets adalah milik modul; surat pengantar sengaja tidak ada di keduanya karena diambil sendiri oleh Petugas Lapangan (tiket 45, "Ambil surat pengantar"). Isi persis Pasal 17(2) perlu dikonfirmasi Admin Platform: belum ada satu pun sumber di repo/spec yang merinci dokumen itu.
- 2026-09-27 — Notifikasi order (Peringatan Staf / Antrean Tier 1) dan Tagihan pada konfirmasi adalah tiket 45, jadi tiket ini tidak mengirim pesan apa pun; tidak ada perubahan staf yang dapat diaudit di tiket ini.
- 2026-09-27 — Tanpa поле "rencana waktu pemakaman" di layar TPU: spec Pengurusan TPU (story 73) menetapkan waktu pemakaman disepakati Admin Platform dengan TPU saat konfirmasi, dan stories 68–72 tidak menyebut field itu di layar pengajuan.
- 2026-09-27 — Migrasi: `drizzle/0022_exotic_vanisher.sql` + `drizzle/meta/0022_snapshot.json`, satu entri journal idx 22, create-only tanpa DDL destruktif. Angka 0022 bentrok dengan tiket 86 (antrean 86→0022), jadi di merge worktree file `.sql` **dan** snapshot-nya dihapus lalu `npm run db:generate` diulang; journal tidak boleh diedit manual.
- 2026-09-26 — ADR 0004: Pemegang Hak for the IPTM takes phone + optional email; Kirim uses the email Kode Masuk (ticket 22); the CS WhatsApp shown at night is a `wa.me` link. Now blocked by 82.
