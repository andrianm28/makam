# Checklist UAT Rilis 2 dan Rilis 3 — uji agen, lalu cek sampel owner

Environment: `https://dev.makam.co.id` (staging). Rilis 2 = tiket 35, 39, 41, 42, 59, 84. Rilis 3 = tiket 43–48, 55–57, 58 dan bagian TPU dari 51–53 (Layanan di Lokasi Mitra sudah di checklist Rilis 1, §11).
Sumber: AC tiap tiket, ADR 0006, rencana percepatan full rilis (2026-10-04), tiket 110. Isi bukti tiap butir: screenshot runner (`/home/ubuntu/uat-runs/<tanggal>-<sha>/bukti/`) dan catatan owner. Tandai `[x]` bila lolos.

## Cara membaca checklist ini

- **[BAYAR]**: butir ini membayar lewat sandbox SumoPod (QRIS → "Simulate Payment" → Lunas). Hanya ada satu project sandbox dan webhook-nya pindah ke makam.co.id saat switch, jadi **semua butir [BAYAR] harus selesai di staging sebelum switch**.
- **[TANPA-BAYAR]**: tidak butuh pembayaran lewat provider. Boleh dijalankan sesudah switch (minggu ke-2, digest C). Butir yang butuh Tagihan Lunas memakai "Catat dibayar langsung / pembayaran manual" (tiket 30) atau melanjutkan dari pesanan yang ditinggalkan butir [BAYAR].
- **Runner**: `S1` = sudah ada perjalanan terskrip (`uat/perjalanan/rilis2-bayar.uat.ts`, `rilis3-bayar.uat.ts`; `npm run uat -- --grep @bayar`). `S2` = perjalanan [TANPA-BAYAR], ditulis di slice 2 (tiket 110); sampai saat itu dijalankan owner/agen dengan tangan dan screenshot.
- **Urutan**: jalankan semua [BAYAR] dulu, **jangan batalkan pesanan yang dihasilkannya** (butir [TANPA-BAYAR] melanjutkan dari situ). Pembatalan uji ada di bagian "Penutup".
- Satu butir hijau di sini tidak menggantikan test domain; ini uji alur nyata di staging.

## P. Prasyarat staging (data, peran staf, Retribusi, tanda TPU)

- [ ] **P1 Data peluncuran**: `import-data-peluncuran --izinkan-staging` (dry run lalu `--tulis`). Minimal 2 Lokasi Mitra Terverifikasi: **Lokasi A** (Terencana, Hak Pakai selamanya) dan **Lokasi B** (Hak Pakai berjangka, total di bawah cap QRIS Rp 10 juta), keduanya dengan Denah dan Petak Tersedia.
- [ ] **P2 Peran staf** (alias Gmail owner): Admin Platform (email + TOTP terdaftar), Admin Lokasi untuk Lokasi A dan B, **Petugas Lapangan** (tanpanya konfirmasi Saat Duka TPU ditolak), **Mitra Jasa** (aktif, mencakup TPU dan Layanan yang diuji), Pemesan (alias keluarga). Persona runner: `UAT_EMAIL_PEMESAN`, `UAT_EMAIL_ADMIN_LOKASI`, `UAT_EMAIL_ADMIN_PLATFORM`, `UAT_EMAIL_PETUGAS_LAPANGAN`, `UAT_EMAIL_MITRA_JASA` (lihat `uat/README.md`).
- [ ] **P3 Retribusi Pemda IPTM = Rp 0** sebagai nilai asli (keputusan owner C3), terlihat sebagai baris tersendiri di kuotasi TPU. Kuotasi TPU tanpa `tarif_belum_ada`.
- [ ] **P4 Tarif TPU**: 22 harga DKI dan tarif Mitra Jasa contoh terisi; **setiap varian Batu Nisan yang boleh di TPU DKI sudah ditandai "boleh di TPU DKI" dengan tangan** (tiket 49); varian tak bertanda tidak ditawarkan di TPU. Biaya Pengurusan (dua nilai) dan Biaya Layanan Platform contoh terisi.
- [ ] **P5 TPU DKI**: minimal 2 TPU, minimal satu berstatus "menerima makam baru" **diperbarui hari ini** (baris Tier 4 "Cek status TPU" belum muncul) dan satu tidak menerima.
- [ ] **P6 Mitra Jasa dan Nazhir**: 3 Mitra Jasa (Contoh) dan 2 Nazhir (Contoh) di daftar; onboarding Mitra Jasa persona lengkap (bank, KTP, area cakupan TPU dan Layanan), tanpa tanggal Tidak tersedia pada hari uji.
- [ ] **P7 Aturan Rilis 2 di Lokasi B**: tumpang diizinkan (juga di petak yang sudah dilepas), minimum tahun sejak pemakaman terakhir dan batas lapis terisi, jual-beli Hak Pakai diizinkan, masa tenggang 3 bulan, Jam Operasional dan Kontak Siaga terisi.
- [ ] **P8 Hak Pakai uji** di Lokasi B: (a) satu Hak Pakai berjangka yang dipegang persona Pemesan (dari uji Rilis 1 §4), (b) satu Hak Pakai **dalam masa tenggang** (tanggal berakhir sudah lewat, belum 3 bulan), (c) satu Hak Pakai tanpa email tercatat, (d) satu Petak terisi yang sudah dilepas (untuk tumpang). Tambahan: nama Lokasi/petak di env `UAT_*` bila berbeda dari bawaan runner.
- [ ] **P9 Lokasi sekali pakai** `UAT_LOKASI_BERHENTI`: Berhenti tidak bisa dibatalkan, jadi pakai Lokasi cadangan yang boleh rusak, dengan satu Hak Pakai dan satu Layanan terbayar yang belum selesai.
- [ ] **P10 Pengaturan Operator** terisi (CS, jam balas) dan project SumoPod seperti checklist Rilis 1 §0 (fee ditanggung Operator, webhook staging, Save & Test 2xx).

## Rilis 2

### Tiket 35 — Makamkan di bawah Hak Pakai yang ada (tumpang), dengan persetujuan
- [ ] **R2-35.1 [BAYAR] S1** Hub Makam Keluarga → "Makamkan di sini" (tumpang) → Data & kirim hanya meminta Almarhum dan Pemesan → pesanan Diajukan → Admin Lokasi mengonfirmasi (persetujuan implisit: Email Terverifikasi Akun = email Pemegang Hak) → Tagihan **bayar-belakang** (Biaya Pemakaman + Biaya Layanan Platform) → Catat Pemakaman menambah ke Hak Pakai → keluarga **bayar** lewat QRIS → Lunas; **tidak ada Bukti Pemesanan baru**; masa berlaku Hak Pakai tidak direset.
- [ ] **R2-35.2 [TANPA-BAYAR] S2** Persetujuan lewat email "Setujui / Tolak" ke Pemegang Hak (kode ke email tercatat dulu); Tolak → pesanan Ditolak dengan alasan "Pemegang Hak tidak menyetujui"; permintaan muncul di strip Perlu tindakan Pemegang Hak.
- [ ] **R2-35.3 [TANPA-BAYAR] S2** Persetujuan lisan dan bukti ahli waris dicatat Admin Lokasi (catatan/berkas); ahli waris memunculkan pengingat Ganti Pemegang Hak.
- [ ] **R2-35.4 [TANPA-BAYAR] S2** Pemeriksaan tumpang memblokir konfirmasi dengan alasan terlihat: Lokasi tak mengizinkan tumpang, minimum tahun belum lewat, lapis maksimum tercapai; banner peringatan Tagihan terdahulu belum lunas.
- [ ] **R2-35.5 [TANPA-BAYAR] S2** Petak dilepas tapi belum dibongkar hanya ditawarkan sebagai tumpang (kebijakan + minimum tahun), tidak pernah sebagai petak kosong.
- [ ] **R2-35.6 [TANPA-BAYAR] S2** Pembatalan hanya membatalkan pesanan dan Tagihannya; Tidak Tertagih tidak pernah mengakhiri Hak Pakai; Pencairan Biaya Pemakaman jatuh tempo saat Lunas dan Pemakaman tercatat.

### Tiket 39 — Pengembalian Hak Pakai, Ganti Pemegang Hak, Calon Penghuni (tanpa uang lewat Operator)
- [ ] **R2-39.1 [TANPA-BAYAR] S2** "Kembalikan Hak Pakai" untuk petak belum terpakai (peringatan kompensasi disepakati langsung dengan Lokasi): baris Antrean Lokasi 2 hari kerja → disetujui → Hak Pakai Berakhir (alasan Pengembalian), Petak Tersedia.
- [ ] **R2-39.2 [TANPA-BAYAR] S2** "Ajukan Ganti Pemegang Hak" (jual/waris, dokumen): diblokir saat Pembatalan terbuka atau Tagihan Saat Duka lewat jatuh tempo; jual ditolak bila Lokasi melarang; waris selalu boleh; riwayat Pemegang Hak tersimpan; Hak Pakai pindah ke tab Makam pemegang baru.
- [ ] **R2-39.3 [TANPA-BAYAR] S2** Alur Perlu Perbaikan ↺ Diajukan, Dibatalkan hanya sebelum keputusan; ahli waris Pemegang Hak yang wafat diarahkan ke hub; Admin Lokasi mengganti nomor Pemegang Hak setelah KTP dicek (audit).
- [ ] **R2-39.4 [TANPA-BAYAR] S2** Label Calon Penghuni diganti langsung tanpa tinjauan; Admin Lokasi mendapat pemberitahuan tanpa baris Antrean.

### Tiket 41 — Perpanjangan jalur dokumen: KTP, ahli waris, klaim
- [ ] **R2-41.1 [BAYAR] S1** Jalur **KTP** (Hak Pakai tanpa email tercatat): unggah KTP → baris "Periksa dokumen Perpanjangan" (2 hari kerja) → Admin Lokasi **Setujui** (email/telepon tercatat diperbarui, diaudit) → pemohon pilih masa → Tagihan **bayar-dulu** → bayar QRIS → Lunas → **Bukti Perpanjangan**, tanggal akhir bertambah.
- [ ] **R2-41.2 [TANPA-BAYAR] S2** Jalur **ahli waris** (akta kematian, bukti ahli waris, KTP): persetujuan mencatat Ganti Pemegang Hak (riwayat tersimpan); jalur **klaim** (KTP, bukti hubungan, kwitansi lama) mencatat Pemegang Hak.
- [ ] **R2-41.3 [TANPA-BAYAR] S2** Perlu Perbaikan ↺ Diajukan muncul di Perlu tindakan; Tolak dengan alasan; Tagihan lapse → Tagihan baru tanpa unggah ulang dalam 30 hari sejak persetujuan, lewat itu perlu tinjauan baru; blokir sama dengan Perpanjangan OTP; melengkapi Hak Pakai Perlu Verifikasi bagian dari pemeriksaan.

### Tiket 42 — Pengingat habis masa berlaku, masa tenggang, mengakhiri Hak Pakai
- [ ] **R2-42.1 [BAYAR] S1** Hak Pakai **Kedaluwarsa dalam masa tenggang** (P8b): baris "Hak Pakai dalam masa tenggang" ada di Antrean Lokasi → pemegang memperpanjang lewat Perpanjangan → bayar QRIS → Lunas → baris tertutup, pengingat berhenti.
- [ ] **R2-42.2 [TANPA-BAYAR] S2** Pengingat 60/30/7 hari sebelum dan mingguan di masa tenggang (08:00–20:00, email ke Pemegang Hak dan Admin Lokasi, tautan Perpanjangan, berhenti saat Perpanjangan dipesan); tanpa email tercatat → baris "Telepon Pemesan".
- [ ] **R2-42.3 [TANPA-BAYAR] S2** Status Kedaluwarsa (Petak "Masa Berlaku Habis"), tetap bisa diperpanjang sampai masa tenggang habis; Admin Lokasi mengakhiri Hak Pakai dengan alasan (final; Paket berhenti), Petak tetap Terisi sampai Pembongkaran dicatat lalu Tersedia; Tidak Tersedia hanya tanpa Hak Pakai aktif; semua diaudit.

### Tiket 59 — Lokasi Ditangguhkan dan Berhenti
- [ ] **R2-59.1 [BAYAR] S1** **Ditangguhkan** (Lokasi uji): halaman tetap tayang "sementara tidak menerima pesanan" dan hilang dari daftar Pilih makam dan Terencana; Hak Pakai baru diblokir; **Perpanjangan tetap bisa dipesan dan dibayar** (harga tetap muncul), begitu pula Layanan, Pembatalan, Ganti Pemegang Hak.
- [ ] **R2-59.2 [BAYAR] S1** **Berhenti** (Lokasi sekali pakai P9, tanggal efektif dekat): keluarga yang punya pesanan berjalan atau Paket diberi tahu; siklus Paket berhenti; sesudah tanggal efektif (tick 15 menit) Layanan **terbayar yang belum selesai dibatalkan dengan refund penuh termasuk Biaya Layanan Platform**; Makam tab hanya-baca dengan kontak pengelola dan dokumen.
- [ ] **R2-59.3 [TANPA-BAYAR] S2** Hanya Admin Platform yang mengubah status (audit, alasan); semua entry point pesanan memeriksa status; Pencairan selesai bersih; Terencana yang ditahan dilepas kecuali Pemesan di Masa Pembatalan yang membatalkan (refund).

### Tiket 84 — Pintu Masuk di Denah
- [ ] **R2-84.1 [TANPA-BAYAR] S2** Admin Lokasi menandai sel sebagai Pintu Masuk (satu atau massal); tidak pernah Petak dan tidak bisa dipilih; Petak yang sudah dipakai atau ditahan tidak bisa menjadi Pintu Masuk; ikon dan legenda tampil di picker Terencana dan editor; diaudit.

## Rilis 3

### Tiket 43 — Katalog TPU DKI, harga, halaman
- [ ] **R3-43.1 [TANPA-BAYAR] S2** Admin Platform menambah/mengubah TPU DKI (nama, alamat, pin, sumber data, flag) dan flag "menerima makam baru" mencatat tanggal (diaudit); baris Tier 4 "Cek status TPU" muncul 14 hari setelah pembaruan terakhir dan menutup saat diperbarui.
- [ ] **R3-43.2 [TANPA-BAYAR] S2** Halaman TPU: "TPU resmi Pemprov DKI Jakarta" (tanpa kata "Terverifikasi"), flag dengan "diperbarui <tanggal>", kotak harga dengan Retribusi IPTM **Rp 0 sebagai baris tersendiri** dan dua Biaya Pengurusan; kartu TPU di Daftar Lokasi dengan filter jenis; "mulai Rp X" = Biaya Pengurusan pemakaman + Retribusi.
- [ ] **R3-43.3 [TANPA-BAYAR] S2** Halaman "Pengurusan di TPU DKI": panduan DIY gratis, dua Biaya Pengurusan, daftar harga Layanan DKI, tautan ke Saat Duka TPU, Perpanjang IPTM dan "Sudah dimakamkan? Kami urus IPTM-nya".

### Tiket 44 — Saat Duka di TPU DKI: daftar dan pengajuan
- [ ] **R3-44.1 [TANPA-BAYAR] S2** Bagian TPU di Pilih makam hanya memuat TPU yang menerima makam baru; chip Semua / Lokasi Mitra / TPU DKI menyaring.
- [ ] **R3-44.2 [TANPA-BAYAR] S2** Pengajuan: kelayakan "KTP DKI" dan "Meninggal di Jakarta" (tidak/tidak memblokir dan mengarahkan ke Lokasi Mitra; meninggal di luar Jakarta menambah dokumen Pasal 17(2)); Tumpang wajib deskripsi makam + foto IPTM dengan peringatan 3 tahun dan persetujuan; dua daftar dokumen (dibawa dan diunggah).
- [ ] **R3-44.3 [TANPA-BAYAR] S2** Pengajuan malam hari: batas konfirmasi 2 jam layanan pada jam 06:00–18:00 ("paling lambat pukul 08:00" untuk 23:00), nomor CS dan jam balasnya; baris harga: Biaya Pengurusan dan Retribusi Rp 0, **tanpa Biaya Layanan Platform**.

### Tiket 45 — Konfirmasi TPU Saat Duka dan Ambil surat pengantar
- [ ] **R3-45.1 [BAYAR] S1** Admin Platform mengambil baris Tier 1 "Konfirmasi TPU Saat Duka" (nama dan kontaknya terlihat di halaman keluarga) → **Konfirmasi pemakaman** (waktu, Petugas, kontak TPU) → Tagihan **bayar-belakang** (Biaya Pengurusan + Retribusi Rp 0, jatuh tempo 3×24 jam sesudah pemakaman) → keluarga membayar lewat QRIS → Lunas; **tidak ada baris "Setor Retribusi"** untuk Rp 0.
- [ ] **R3-45.2 [TANPA-BAYAR] S2** Tugas Lapangan "Ambil surat pengantar" dibuat otomatis sekali; baris Tier 2 saat belum ditugaskan atau terlambat; tawarkan TPU lain (keluarga menerima/menolak); eskalasi 30 dan 90 menit, baris malam 06:00.
- [ ] **R3-45.3 [TANPA-BAYAR] S2** Halaman konfirmasi memuat waktu pemakaman, alamat TPU, kontak Admin Platform dan petugas TPU, dua daftar dokumen, baris harga; Operator menanggung kerugian bila tak dibayar (dikejar tanpa Pencairan).

### Tiket 46 — Pengajuan di TPU: dokumen, Surat Kuasa, IPTM, Makam TPU
- [ ] **R3-46.1 [BAYAR] S1** Pesanan TPU **terbayar** dibatalkan sebelum IPTM Diajukan → permintaan refund: sebelum Dimakamkan sebesar seluruh pembayaran, pada/sesudah Dimakamkan Biaya Pengurusan ditahan dan hanya baris lain yang dikembalikan; Tagihan belum dibayar menjadi Dibatalkan; sesudah IPTM Diajukan pembatalan ditolak.
- [ ] **R3-46.2 [TANPA-BAYAR] S2** Status Diajukan → Dikonfirmasi → Dimakamkan → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit terlihat di linimasa; dokumen jatuh tempo 7 hari setelah pemakaman (muncul di Perlu tindakan); Surat Kuasa dihasilkan dengan nama PT JKP dan nama staf pengajuan (**nama PT JKP dicek**).
- [ ] **R3-46.3 [TANPA-BAYAR] S2** Baris Tier 3 "IPTM filing" (7 hari) dan Tugas Berkas IPTM; unggah scan IPTM + masa berlaku → IPTM Terbit, tautan ke Pemesan dan Pemegang Hak walau Tagihan belum lunas; Makam TPU (TPU, blok/nomor, Almarhum, Pemegang Hak, IPTM, riwayat) dan tumpang memperbarui rekaman yang ada; **tidak ada Bukti Pemesanan** di TPU.

### Tiket 47 — Pengurusan IPTM (hanya pengajuan) dan penolakan PTSP
- [ ] **R3-47.1 [BAYAR] S1** "Sudah dimakamkan? Kami urus IPTM-nya": pengajuan Dimakamkan → unggah dokumen → Admin Platform **Dokumen lengkap** → Tagihan **bayar-dulu** (Biaya Pengurusan pengajuan saja) → bayar QRIS → Lunas → **baru sekarang** Tugas "Ambil surat pengantar" dibuat → IPTM Diajukan → IPTM Terbit (Makam TPU terisi).
- [ ] **R3-47.2 [BAYAR] S1** Penolakan PTSP: yang dapat diperbaiki → Perlu Perbaikan (Perlu tindakan), ajukan ulang **tanpa Tagihan baru**; penolakan final → Ditolak dengan alasan dan **refund penuh** termasuk Biaya Pengurusan (Operator menanggung).
- [ ] **R3-47.3 [TANPA-BAYAR] S2** Tidak ada Tagihan sebelum dokumen lolos; baris Tier 3 pemeriksaan dokumen (1 hari kerja) dan pengajuan (3 hari kerja setelah Lunas); Tagihan lapse 3×24 jam menjadi Dibatalkan (Menunggu Pembayaran).

### Tiket 48 — Perpanjangan TPU (IPTM)
- [ ] **R3-48.1 [BAYAR] S1** Makam TPU dengan IPTM berakhir dalam 3 bulan (Admin Platform mengoreksi tanggal berakhir dengan audit): keluarga memesan Perpanjangan IPTM 3 tahun → dokumen diperiksa → Tagihan bayar-dulu (Biaya Pengurusan pengajuan) → bayar QRIS → Diproses → IPTM Diajukan → IPTM Terbit memperbarui IPTM terkini dan riwayat; "IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran" tampil.
- [ ] **R3-48.2 [TANPA-BAYAR] S2** Pengingat 3 bulan dan 1 bulan sebelum IPTM berakhir (08:00–20:00, berhenti saat dipesan; tanpa email → baris "Telepon Pemesan" tidak dobel); permintaan hanya dari 3 bulan sebelumnya; Perlu Perbaikan sebelum bayar; lewat masa tenggang: baris "Cek TPU (lewat masa tenggang)", "tidak memperpanjang" → Ditolak tanpa biaya; Perpanjangan TPU tidak menyimpan data pemakaman.

### Tiket 55 — Mitra Jasa: onboarding, ketersediaan, status, scorecard
- [ ] **R3-55.1 [TANPA-BAYAR] S2** Admin Platform onboarding Mitra Jasa (KTP, NIK, foto, area, bank dengan aturan nama cocok atau catatan override, tanpa NPWP, cakupan TPU dan Layanan) → Undangan Staf → login Kode Masuk; baris Tier 4 onboarding sampai lengkap; lencana "Baru" sampai 5 Selesai.
- [ ] **R3-55.2 [TANPA-BAYAR] S2** Mitra Jasa mengatur Tidak tersedia (dihormati picker penugasan); Ditangguhkan/Berhenti membatalkan penugasan Dijadwalkan dan mendaftar pekerjaan berjalan untuk Admin Platform, tetap bisa login melihat riwayat; scorecard 90 hari dan baris tinjauan bulanan; Mitra Jasa tidak pernah melihat dokumen keluarga atau audit log. **Cek tampilan Pencairan (AC3 tiket 55)**.

### Tiket 56 — Pesanan Layanan di TPU dan penugasan Mitra Jasa
- [ ] **R3-56.1 [BAYAR] S1** Layanan di TPU (halaman Layanan TPU): TPU, blok/nomor, Almarhum, keterangan → harga DKI **tanpa Biaya Layanan Platform** → Pesan layanan (sudah masuk) → Tagihan **bayar-dulu** → bayar QRIS → Lunas → Pekerjaan Layanan Dijadwalkan.
- [ ] **R3-56.2 [BAYAR] S1** Saat Duka TPU dengan **Layanan hari-H**: baris masuk Tagihan bayar-belakang yang sama, dibayar bersama (lihat R3-45.1); Pekerjaan Dijadwalkan saat konfirmasi (target = hari pemakaman); batal sebelum Sedang Dikerjakan → refund Layanan (R3-53.1).
- [ ] **R3-56.3 [TANPA-BAYAR] S2** Admin Platform menugaskan lewat picker (hanya Mitra Jasa Aktif yang mencakup TPU dan Layanan dan tidak Tidak tersedia); Peringatan Staf (push + email); terima/tolak sebelum batas (12 jam atau H-1 18:00); tak menjawab = Tidak direspons dan kembali ke antrean; baris Tier 1 "Pekerjaan hari ini tanpa Mitra Jasa" dan Tier 2; Pemesan melihat nama depan dan foto Mitra Jasa; Mitra Jasa tak melihat kontak keluarga.

### Tiket 57 — Bukti foto Mitra Jasa, persetujuan, aturan bayar
- [ ] **R3-57.1 [TANPA-BAYAR] S2** Mitra Jasa mengambil foto sebelum/sesudah dengan kamera aplikasi (bertimestamp, sesuai katalog) → Menunggu Verifikasi → baris Tier 2 "Foto bukti perlu disetujui" (24 jam) → Admin Platform menyetujui (Selesai, bukti tampil ke Pemesan, jendela Keluhan 3×24 jam terbuka) atau menolak dengan alasan (kembali Sedang Dikerjakan).
- [ ] **R3-57.2 [TANPA-BAYAR] S2** Aturan bayar: kerja ulang oleh orang sama tidak dibayar, oleh orang lain dibayar dan Pencairan awal dibatalkan, Terlambat tapi selesai tarif penuh, dibatalkan karena terlambat tanpa Pencairan; tidak pernah ada Potongan; Pencairan Layanan hari-H TPU jatuh tempo tanpa menunggu pembayaran keluarga; tampilan Pencairan Mitra Jasa hanya pekerjaan, Layanan, tanggal dan tarif.

### Tiket 58 — Wakaf Tanah
- [ ] **R3-58.1 [TANPA-BAYAR] S2** Halaman Wakaf Tanah (proses, tanah langsung ke Nazhir, platform tak menerima tanah atau uang) dan formulir Pengajuan Wakaf (Kode Masuk saat kirim); luar Jabodetabek otomatis Dirujuk dengan penunjuk KUA/BWI.
- [ ] **R3-58.2 [TANPA-BAYAR] S2** Admin Platform: baris Tier 3 (tanpa alert), cocokkan Nazhir, jadwalkan Survei Wakaf, ubah status (Ditinjau → Survei Dijadwalkan → Menunggu Ikrar → Proses Sertipikat → Selesai, Ditolak, Dibatalkan), catatan untuk Wakif terpisah dari catatan internal dan laporan survei; Wakif membatalkan sampai Menunggu Ikrar, menerima email tiap perubahan, melihat tab Wakaf; tidak ada Tagihan; Admin Lokasi tidak melihat Pengajuan Wakaf; CRUD Nazhir tanpa login.

### Bagian TPU dari tiket 51, 52, 53
- [ ] **R3-53.1 [BAYAR] S1** Pembatalan pesanan Saat Duka TPU yang sudah dibayar dengan Layanan hari-H: Layanan Dibatalkan dan dikembalikan kecuali yang sudah Sedang Dikerjakan; Tidak Tertagih: Mitra Jasa tetap dibayar, Operator menanggung kerugian.
- [ ] **R3-51.1 [TANPA-BAYAR] S2** Keluhan atas pekerjaan TPU: jendela 3×24 jam mulai saat **Admin Platform menyetujui** bukti (bukan saat unggah); baris Tier 1 "Keluhan pekerjaan TPU" (respons pertama 4 jam hari); hasil ditolak/kerja ulang/refund; override Pencairan dengan catatan; Penilaian 1–5 hanya terbaca Admin Platform; tick penutupan jendela membuat Pencairan jatuh tempo.
- [ ] **R3-52.1 [TANPA-BAYAR] S2** Thread pekerjaan TPU antara Pemesan dan Mitra Jasa: kirim pesan teks + foto; email pemberitahuan **tanpa isi** dengan tautan balas; Mitra Jasa tak melihat nomor telepon Pemesan; Admin Platform membaca dan menulis; thread read-only saat jendela Keluhan tutup.

## Penutup

- [ ] **Batalkan atau selesaikan pesanan uji** yang tidak dibutuhkan lagi; pesanan [BAYAR] yang dibutuhkan butir [TANPA-BAYAR] dibiarkan sampai minggu ke-2, lalu dibatalkan (refund hanya dicatat; tidak ada transfer di produksi).
- [ ] Webhook SumoPod semua 2xx di dashboard (Resend yang gagal), tidak ada baris "Pembayaran perlu ditinjau" tersisa.
- [ ] Simpan `ringkasan.md`, `laporan/` dan folder `bukti/` run di `/home/ubuntu/uat-runs/<tanggal>-<sha>/` dan catat tanggal uji di komentar gerbang tiket 65.

## Exit criteria

- **Sebelum switch (G2):** semua butir **[BAYAR]** Rilis 2 dan 3 hijau di staging, runner melaporkan 0 gagal, webhook semua 2xx.
- **Sebelum produksi naik ke level 3 (G4):** semua butir **[TANPA-BAYAR]** hijau di digest C (data `tanam rilis3`), owner menandatangani cek sampel.
