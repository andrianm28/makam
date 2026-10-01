# Pekerjaan Layanan message thread

Status: ready-for-agent
Blocked by: 51
Spec: Domain modules > 9. Layanan (Message thread); stories 96, 131 (thread), 171, 180

## What to build

A message thread per Pekerjaan Layanan (text + photos) between the Pemesan and the fulfiller (Admin Lokasi or Mitra Jasa). Each new message notifies the Pemesan by email with a reply link (no message text or photo goes in the email). Admin Platform can read every thread and post. The thread closes when the Keluhan window ends. Contact details are never exchanged through the platform.

## Acceptance criteria

- [ ] Pemesan, the assigned fulfiller and Admin Platform can post; others can't read.
- [ ] A new message from staff/fulfiller sends the Pemesan an email with a reply link; the text and photos stay in-app.
- [ ] Mitra Jasa never see the Pemesan's phone number; the Pemesan sees the Mitra Jasa's first name and photo only.
- [ ] Photos go to FileStore, viewed by signed URL.
- [ ] The thread becomes read-only when the Keluhan window closes.
- [ ] Tests: access rules per role; notification sent without content; closing at window end.

## Comments

- 2026-09-26 — ADR 0004: thread notifications go by email, not a WhatsApp template (updated above).

- 2026-10-01 — **Dibangun di `origin/main` (365b9007), cabang `ticket-52` (head `0617ec8b`).** Belum ditinjau dua sumbu.
  - **Domain.** Modul `src/domain/layanan/pesan.ts` (+ `pesan-skema.ts` zod-only) menangani satu thread per Pekerjaan Layanan, Lokasi maupun TPU: `pesanPekerjaanUntukPemesan`, `pesanPekerjaanUntukStaf`, `kirimPesanPekerjaan`, `kirimPesanPekerjaanStaf`. Peserta: Pemesan, pelaksana (Admin Lokasi untuk pekerjaan Lokasi; Mitra Jasa pemegang penugasan terbuka untuk pekerjaan TPU) dan Admin Platform; lainnya tidak bisa membaca. Pesan staff/pelaksana memicu `LayananNotifikasi.pesanBaru` di transaksi pesan itu. Nama diturunkan saat dibaca: Pemesan dan Mitra Jasa hanya melihat nama depan; Pemesan melihat Mitra Jasa sebagai nama depan + foto, Mitra Jasa tidak pernah menerima telepon/email keluarga. Foto masuk FileStore privat, dibaca lewat signed URL.
  - **Tabel/migrasi.** `pekerjaan_layanan_pesan`, `pekerjaan_layanan_pesan_lampiran`; kolom nullable `pekerjaan_layanan_tpu.jendela_ditutup_at`; migrasi `0047` murni ekspansi. Notifikasi: template `layanan_pesan_baru` (transaksional) dengan isi hanya tautan, tanpa teks/foto.
  - **Layar.** Thread tampil di halaman pesanan Pemesan (`/layanan/[nomor]`, pekerjaan Lokasi) dan halaman pekerjaan Admin Lokasi; kirim teks + foto.
  - **Verifikasi.** `npx vitest run src/domain/layanan src/domain/notifications` → 25 berkas, 260 tes lulus; `tests/destructive-ddl + seed-representative` → 33 lulus; `npm run typecheck`, `npm run lint`, `npm run build` exit 0. Suite penuh sengaja tidak dijalankan.
  - **Spec gaps dan keputusan untuk pemilik.** (1) **Penutupan thread pekerjaan TPU belum bisa dikirim seperti tertulis**: kolom `jendela_ditutup_at` di `pekerjaan_layanan_tpu` sudah disediakan sekarang sebagai kontrak, tetapi belum ada yang mengisinya karena jendela Keluhan TPU baru dibuka saat tiket 57 menyetujui bukti (`bukti_ditunjukkan_at`); sampai itu ada, thread TPU tidak pernah menutup. (2) Layar thread untuk Mitra Jasa (TPU) dan tampilan Admin Platform atas thread pekerjaan Lokasi belum dibangun; fungsi domainnya sudah ada, jadi ini pekerjaan lapisan tipis berikutnya. (3) Tidak ada bukti merah-dulu sebelum kode; tes ditulis bersama kode lalu dijalankan hingga hijau.
