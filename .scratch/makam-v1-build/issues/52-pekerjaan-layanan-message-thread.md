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

- 2026-10-01 — **Temuan tinjauan dua sumbu.**

  **Standards (1 hard + pertimbangan).**
  - **HARD — pesan staf tidak diaudit.** `kirimPesanPekerjaanStaf` (`src/domain/layanan/pesan.ts:344`) lewat `simpanPesan` (`:295`) menyisipkan pesan thread **tanpa** `deps.audit.staffWrite`, padahal `LayananDeps` membawa `audit` dan setiap penulisan staf Layanan tetangganya mengaudit (`bukti.ts:87`, `pekerjaan.ts:141`); spec Audit Log "Records every staff write", story 184. Perlu `AuditAction` baru dan mencatat lewat `audit.staffWrite`.
  - **Pertimbangan.** `kirimPesanPemesan`/`kirimPesanStaf` menduplikasi parse→jobPesan→kepemilikan; `jobPesan` diekspor di barrel tetapi tidak dipakai siapa pun; union peran penulis diulang (`deps.ts:128`, `pesan.ts:322-324`, template, `pesan-pemesanan.ts`); `thread-pekerjaan.tsx:88` menulis `maxLength={2000}` alih-alih `PESAN_MAKS_PANJANG`. Konsolidasikan yang murah; tinggalkan catatan bila refactor terlalu luas.

  **Spec (terburuk).** Foto >8 MB atau lebih dari 4 dibuang diam-diam oleh `src/server/form-lampiran.ts:13-14`, sehingga `berkas_tidak_didukung` milik domain tidak pernah menyala dan aksi melaporkan "Pesan Anda terkirim." Perbaiki: unggahan **DITOLAK** dengan galat domain (jangan laporkan sukses setelah membuang foto). Selain itu form staf menampilkan `pekerjaanId` dua kali (`thread-pekerjaan.tsx:70` + tersembunyi di `page.tsx:108`).

- 2026-10-01 — **Perbaikan temuan tinjauan; head `defc84f0` + commit ini.**
  - **Audit (HARD).** `AuditAction` baru `layanan.kirim_pesan` (`src/domain/audit/index.ts`) dan labelnya (`src/lib/lokasi-labels.ts`). `simpanPesan` (`src/domain/layanan/pesan.ts`) kini menerima `staf?: { actor, role }`; jalur staf/Pelaksana menulis lewat `deps.audit.staffWrite`, entitas `pekerjaan_layanan` (atau `pekerjaan_layanan_tpu`), `lokasiId` dari job, snapshot `after` hanya `{ pesanId, jumlahLampiran }` — kata-kata tetap di thread. Jalur Pemesan tetap `db.transaction` tanpa audit. Tes: "records an Entri Audit for a message staff or the fulfiller wrote, and none for the Pemesan's own".
  - **Spec.** `lampiranDari` (`src/server/form-lampiran.ts`) kini mengembalikan `{ ok:false, reason }`: foto > `PESAN_FOTO_MAX_BYTES` → `berkas_tidak_didukung` (dibaca tanpa memuat berkas), lebih dari `PESAN_LAMPIRAN_MAX` → `input_tidak_valid`. Kedua aksi pesan menampilkan galat itu dan tidak menulis pesan. Tes baru `src/server/form-lampiran.test.ts` (4). Duplikasi `pekerjaanId` dihapus dari `hidden` page staf.
  - **Konsolidasi murah.** `maxLength` memakai `PESAN_MAKS_PANJANG`; ekspor barrel `jobPesan` yang tak terpakai dihapus.
  - **Catatan refactor (belum dikerjakan).** Duplikasi parse→jobPesan→kepemilikan antara `kirimPesanPemesan`/`kirimPesanStaf`, dan union peran penulis yang diulang (`deps.ts`, `pesan.ts`, template, `pesan-pemesanan.ts`) sengaja ditinggalkan: menyatukannya menyentuh Notifications dan lebih luas dari perbaikan ini.
  - **Verifikasi.** `vitest run src/domain/layanan src/domain/notifications src/app/layanan src/server` (Postgres bersama via `MAKAM_TEST_PG_URL`; Docker tak bisa diakses di sesi ini) → 29 berkas, 285 tes lulus; `npm run lint`, `npm run typecheck`, `npm run build` exit 0. Suite penuh tidak dijalankan.
