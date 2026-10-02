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

- 2026-10-02 — **Builder (ticket 52), cabang `ticket-52-layanan-thread`.** Belum ditinjau dua sumbu.
  - **Dibangun.** `src/domain/layanan/thread.ts` (barrel: `bacaThreadPemesan`, `bacaThreadStaf`, `kirimPesanPemesan`, `kirimPesanStaf`). Satu thread per pekerjaan, di Lokasi Mitra (`pekerjaan_layanan`) maupun TPU (`pekerjaan_layanan_tpu`). Peserta: Pemesan pemilik, Admin Lokasi Lokasi itu, Mitra Jasa yang sudah **menerima** pekerjaan TPU (penugasan `diterima`), dan Admin Platform; lainnya ditolak (Pemesan lain dijawab `tidak_ditemukan`). Teks + sampai 3 foto (JPG/PNG/WebP, 12 MB) ke FileStore privat, dibaca lewat URL bertanda tangan. Pesan dari Admin Lokasi/Mitra Jasa/Admin Platform mengantre email ke Pemesan di transaksi yang sama lewat Notifications (template baru `layanan_pesan_baru`, transaksional): tautan balas ke `/layanan/<nomor>`, tanpa teks, foto, atau nama. Pesan Pemesan tidak mengirim email. Pesan staf tercatat di Audit Log (`layanan.kirim_pesan`, tanpa isi). Pembacaan hanya memuat peran (Keluarga / Admin Lokasi / Admin Platform), Mitra Jasa hanya nama depan + foto bagi Pemesan; tak ada nomor telepon di bacaan mana pun. Tertutup bila `jendela_ditutup_at` (tick tiket 51) terisi, lalu hanya-baca.
  - **Migrasi** `drizzle/0050_thankful_ego.sql`: dua tabel baru, ekspansi murni. Orkestrator menomori ulang bila 0050 terpakai.
  - **UI.** Pemesan (`/layanan/[nomor]`, pekerjaan Lokasi dan TPU), Admin Lokasi (halaman pekerjaan), Admin Platform (`/staf/admin-platform/thread/[pekerjaanId]`, ditautkan dari halaman Keluhan).
  - **Keputusan bacaan saya (bukan keputusan pemilik).** "Kontak tidak pernah dipertukarkan" saya wujudkan sebagai penolakan teks berisi alamat email atau deretan >=9 digit (`kontak_tidak_boleh`) untuk Pemesan, Admin Lokasi dan Mitra Jasa; Admin Platform dikecualikan. Email diberi `transaksional` (tanpa jendela 08:00-20:00).
  - **Spec gaps / untuk tiket 57 dan pemilik.** (1) Penutupan thread TPU: belum ada sinyal jendela Keluhan TPU (persetujuan Admin Platform ada di 57), jadi thread TPU kini hanya tertutup saat pekerjaan Dibatalkan; 57 harus menutupnya pada akhir jendela (tambahkan sinyal di `bacaKonteks` pada `thread.ts`). (2) Halaman Mitra Jasa untuk menulis di thread (cerita 180) belum dibuat agar tidak bertabrakan dengan rute 57; domain-nya siap (`kirimPesanStaf`/`bacaThreadStaf` dengan Actor Mitra Jasa, sudah diuji). (3) Admin Lokasi di Lokasi Mitra melihat nama dan telepon Pemesan di halaman pekerjaan (perilaku tiket 50); AC hanya melarang Mitra Jasa.
  - **Proses.** Kode ditulis sebelum tes (bukan red-first); pesan urutan yang salah (waktu sama, urutan acak) ditemukan tes pertama dan diperbaiki dengan kolom `urutan` identity.
  - **Bacaan.** `vitest thread.test.ts` 10 tes lulus; vitest layanan/notifications/audit/lib/tests/tooling: lihat laporan; `npm run typecheck` dan `npm run lint` exit 0. Build tidak dijalankan.
- 2026-10-02 — **Builder (ticket 52, fix pass).** Keputusan pemilik 2026-10-02: filter kontak dibuang. `mengandungKontak`, penolakan `kontak_tidak_boleh`, teksnya di `thread-labels.ts`, dan tes penolakannya dihapus; pesan berisi nomor telepon atau email kini diterima biasa (tes baru "a message with a phone number or an email address is sent like any other message", red lalu green). Catatan "Keputusan bacaan saya" di atas sudah tidak berlaku.
