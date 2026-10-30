# Rilis dan go-live: status, langkah pemilik, dan gerbang G6 "sebelum pesanan nyata"

Dibuat 2026-10-29 (sesi cloud, tanpa akses host). Sumber: `go-live-rilis-1.md`, `docs/ops/runbook.md`, `laporan-audit-makam.md` (A-3, D-3). Tidak ada yang di sini menggantikan checklist go-live; ini ringkasan dan draf untuk ditandatangani pemilik.

## 1. Keadaan terbaca 2026-10-29 17:43 UTC

- Staging `dev.makam.co.id`: release `8747066b` (HEAD `main`), `rilisTerbuka` 3, database ok, worker segar.
- Produksi `makam.co.id`: release `f56e1ccc`, `rilisTerbuka` 1, database ok, worker segar.
- G0 sampai G3 selesai (kecuali dua butir G1/G3 yang bukti akhirnya belum diisi: rollback paksa dan pemeriksaan G3 yang sebagian milik pemilik). G4 dan G5 belum satu pun dicentang.

## 2. Tiket 72, 87, 98 (bukti sudah ada, centang belum)

| Tiket | Butir terbuka | Bukti yang sudah ada | Yang masih perlu |
|---|---|---|---|
| 98 | AC4 (form basi tidak jatuh ke halaman Inggris), AC5 (alamat `.invalid` menjawab "gagal kirim") | G2 regression 2026-10-05: halaman "Halaman ini sudah diperbarui" + "Muat ulang"; `.invalid` menjawab "Kode belum bisa dikirim lewat email" | Orkestrator mencentang AC4 dan AC5 dari bukti itu. AC1 sampai AC3 butuh tes yang menyebut `EmailSender` melempar; periksa di `tests/` sebelum mencentang. AC6 (kunci Server Action stabil) opsional dan menunggu persetujuan pemilik (butir C12). |
| 72 | Releases (sourcemap GlitchTip), tiga butir preflight | Preflight `--rilis 1` exit 0 (22/23 PASS) di G1/G3; release GlitchTip dibuat manual; unggah sourcemap menjawab 408 (nginx `errors.makam.co.id`) | Sourcemap dijadwalkan "setelah G5". Tiga butir preflight bisa dicentang orkestrator dari bukti G1/G3. |
| 87 | Sesi cloud percobaan, plugin, konfigurasi lingkungan, skill baru | Sesi cloud ini berjalan dan membaca repo | Butir 1 dan 4 bisa dibuktikan hanya dengan menjalankan `npm test` di sesi builder (bukan lane ini). Konfigurasi lingkungan (butir 3) milik pemilik di claude.ai/code. |

## 3. G4 dan G5: pembagian tugas

Agen sudah tidak bisa mengerjakan langkah ini dari cloud: semuanya di host (`data-contoh`, runner Playwright, `prod.env`, `makam-deploy`). Urutan dan perintah ada di `/mnt/project-files/makam-level-3/langkah-host.md`. Yang perlu tangan pemilik:

**G4 (staging)**
1. Akun Petugas Lapangan aktif dan perangkat Bertugas siap.
2. Nama PT JKP di Surat Kuasa diperiksa.
3. Tampilan Pencairan Mitra Jasa (AC3 tiket 55) dilihat.
4. Periksa sampel, tanda tangan di tiket 65, set freeze F2.

**G5 (produksi, jam sepi, staf diberi tahu dulu)**: promosi digest C (`promote.yml` dijalankan pemilik), `data-contoh tanam --set rilis3 --izinkan-production --tulis`, snapshot log, `RILIS_TERBUKA=3` di `prod.env`, recreate web dan worker, lima pemeriksaan, cabut freeze.

Butir milik pemilik yang masih kosong sebelum G5: dua passphrase backup disalin offline dan password superuser GlitchTip diganti; kontak UptimeRobot dan penerima alert GlitchTip; naskah CS untuk menolak pesanan nyata; penerimaan butir C12; staf beta (jam Bertugas, orang CS, akun Petugas Lapangan).

## 4. G6: gerbang sebelum pesanan nyata (usulan, belum disetujui)

Audit A-3 menemukan tidak ada gerbang ini. Beta berjalan di sandbox SumoPod dan tidak menerima pesanan nyata, jadi G6 tidak menahan G5, tetapi menahan "Going live" di runbook. Usulan butir, dengan bukti diisi seperti di checklist lain:

- [ ] **Backup di luar host, terenkripsi.** Hari ini hanya `pg_dump` terenkripsi 7 hari dan tar berkas di host yang sama. Usulan: salin kedua keluaran ke penyimpanan objek di luar penyedia VPS (restic atau rclone dengan enkripsi sisi klien), retensi 30 hari harian + 12 bulanan, timer baru di `deploy/systemd/` dengan skrip di `deploy/bin/`, dan `makam-restore-test` diperluas untuk memulihkan dari salinan luar. Keputusan pemilik: penyedia dan anggaran (S3 Jakarta tiket 03 ditunda ke v2). Pekerjaan kode/skrip untuk lane Kode setelah penyedia dipilih.
  Evidence:
- [ ] **Uji pulih dari salinan luar**, diukur: waktu dari nol sampai aplikasi sehat. Angka ini mengisi RTO.
  Evidence:
- [ ] **Kebijakan privasi dan posisi UU PDP.** Halaman privasi di `src/app` (belum ada), daftar data pribadi (nama, telepon, email, KTP/KK/akta kematian di FileStore), dasar pemrosesan, penerima (SumoPod, penyedia email, GlitchTip), hak subjek data, kontak pengendali (PT JKP). Posisi PSE (pendaftaran) dan kewajiban notifikasi kebocoran 3×24 jam. Perlu penasihat hukum; agen hanya bisa menyiapkan draf (lane Dokumen).
  Evidence:
- [ ] **Retensi berkas keluarga**: berapa lama KTP/KK/akta disimpan setelah pesanan selesai, dan siapa menghapus. Saat ini spec mengeluarkannya dari cakupan (spec.md:616, :698).
  Evidence:
- [ ] **Prosedur insiden** disetujui dan dilatih sekali (lihat draf di bawah).
  Evidence: disetujui pemilik 2026-10-30 (kartu opsi "Setujui, latihan 31 Okt"); prosedur di `docs/ops/runbook.md` "Incidents (production)". Latihan: "Rehearsal (once before real orders, G6)" di bagian yang sama, dijadwalkan 2026-10-31, belum dijalankan.
- [ ] **Preflight memeriksa G6**: `makam-preflight` mendapat baris untuk salinan luar (umur salinan terbaru), halaman privasi (HTTP 200), dan berkas prosedur insiden.
  Evidence:
- [ ] **Pembayaran nyata (tiket 04)**: KYC SumoPod selesai, lalu runbook "Going live" langkah 1 sampai 5 (nilai nyata, `cabut`, bersihkan pesanan beta, kunci live, preflight). Pengingat keluarga untuk Tagihan TPU bayar-setelah (tiket 46 gap 5) dibangun lebih dulu. Webhook SumoPod tetap satu proyek: jalankan semua kasus bayar di staging sebelum kunci live dipasang.
  Evidence:

## 5. Draf prosedur insiden (sudah masuk `docs/ops/runbook.md`, disetujui 2026-10-30)

Draf awal, disimpan sebagai riwayat; yang berlaku adalah runbook.

- **Target**: RPO 24 jam (backup harian; lebih ketat butuh WAL di v2), RTO 4 jam pada jam kerja.
- **Tingkat**: S1 produksi mati atau uang salah; S2 sebagian fitur mati, data tidak terancam; S3 kecacatan kecil.
- **Langkah S1**: (1) Tentukan pemimpin insiden (pemilik bila tidak ada orang lain). (2) `makam-switch --ke pemeliharaan` bila pengguna bisa dirugikan. (3) Simpan log web, worker, nginx, dan audit sebelum apa pun diubah. (4) Rollback digest bila penyebabnya rilis (`rollback.yml`); pulihkan dari backup bila data rusak, dengan `makam-restore-test` sebagai latihan. (5) Catat linimasa di tiket.
- **Dugaan kebocoran data pribadi**: hentikan akses penyebab, simpan bukti, nilai cakupan data dan subjek. Bila terbukti kebocoran data pribadi, UU PDP mewajibkan pemberitahuan tertulis ke subjek dan lembaga paling lambat 3×24 jam: pemilik memutuskan dengan penasihat hukum. Ganti kredensial yang terkait (kunci SumoPod, secret webhook, SMTP, passphrase).
- **Komunikasi**: satu orang berbicara ke keluarga dan mitra; templat pesan disiapkan lebih dulu.
- **Setelah**: tinjauan tanpa mencari kesalahan orang dalam 5 hari kerja, tindakan perbaikan sebagai tiket.

## 6. Keputusan yang diperlukan dari pemilik

**Diputuskan 2026-10-29 (pemilik, kartu opsi):** backup di luar host ditunda ke v2 (S3 Jakarta, tiket 03). Akibatnya butir backup dan uji pulih G6 tetap terbuka, dan pesanan nyata tidak boleh dibuka sebelum selesai. Beta di sandbox tidak terpengaruh.

1. Penyedia dan anggaran backup di luar host.
2. Repo publik atau privat (audit A-2) sebelum data nyata masuk; nomor telepon Admin Platform di `go-live-rilis-1.md:26` sebaiknya dihapus.
3. Angka RPO/RTO dan retensi berkas.
4. Kapan G4 dilakukan (butuh tangan Anda di staging) dan jendela jam sepi untuk G5.

**Diputuskan 2026-10-29 (kartu opsi):** repo tetap publik, data pribadi dihapus dari berkas (nomor telepon Admin Platform dihapus dari `go-live-rilis-1.md`; klaim "privat" dikoreksi di spec dan runbook; riwayat git tetap memuatnya). RPO 24 jam, RTO 4 jam, berkas keluarga disimpan 2 tahun setelah pesanan selesai (angka bisa direvisi penasihat hukum).
