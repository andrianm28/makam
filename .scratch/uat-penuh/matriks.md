# Matriks UAT penuh Makam (ideal sampai terburuk)

Disusun 2 November 2026 pada main `a6113a63` (staging dan produksi menjalankan commit ini; staging Rilis 3, produksi Rilis 1). Setiap baris menunjuk ke tempat kasus itu diuji, dan status terakhirnya.

**Lapisan uji.** `D` = test domain Vitest dengan Postgres asli (`src/**/*.test.ts`), jalan di CI pada setiap push. `E` = Playwright e2e (`e2e/`) di stack development kosong, jalan di CI setiap build `main`. `U` = runner UAT (`uat/perjalanan`, `npm run uat`) di staging, dengan Kode Masuk asli.

**Status.** ✅ hijau (sumber dan tanggal di kolom) · ⏳ belum dijalankan di staging · ⛔ tertahan (alasan di kolom) · 🕳 celah, belum ada test · 🐞 temuan.

Hasil run thread ini (2 Nov 2026, 06:20 sampai 06:45 UTC):
- Suite penuh lokal di `a6113a63`: 396 file, 4.284 lulus, 1 dilewati, 1 gagal (`chromium-pdf-renderer`: VM tanpa `CHROMIUM_PATH`; lulus 5/5 setelah path diset, bukan cacat produk).
- Test baru thread ini (`balapan.test.ts` ×4, `route-worker.test.ts`, `pengisi-kode.test.ts`): 24 lulus, tiap test balapan dijalankan 2 sampai 3 kali tanpa flake.
- e2e (E) di `a6113a63`: hijau di CI main run 447 (https://github.com/andrianm28/makam/actions/runs/41396460634). Stack lokal tidak bisa dibangun di VM thread ini (`npm ci` di dalam `docker build` gagal lewat proxy VM), jadi e2e tidak diulang di sini.
- Staging, perjalanan `@anonim` (`12-akses-tanpa-masuk`): 4 lulus, 1 gagal (🐞 F1).

## Temuan

| ID | Tingkat | Temuan | Tindak lanjut |
|---|---|---|---|
| F1 | sedang | Header `Content-Security-Policy` dasar (`frame-ancestors 'self'; base-uri 'self'; object-src 'none'`) dari `deploy/nginx/*.conf` (commit 34d24bf) tidak ada di jawaban `dev.makam.co.id` maupun `makam.co.id`. Header lain (nosniff, SAMEORIGIN, no-referrer, HSTS produksi) ada. `install-host.sh` tidak memasang berkas situs nginx, jadi situs di host masih versi lama. | Agent server membandingkan situs nginx host dengan repo (blok perintah, langkah 1), lalu dri memutuskan pemasangannya. |
| F2 | tinggi untuk UAT | Kunci SumoPod Sandbox baru di staging membuka checkout Pymnt tanpa tombol "Simulate Payment", sehingga semua perjalanan `@bayar` berhenti (laporan G4, P9.7). Jalur bayar tetap diuji di D (webhook bertanda tangan) dan E (`pembayaran.spec.ts`, penyedia palsu). | Keputusan kunci ada di thread go-live. `@bayar` di staging dijalankan setelah itu (blok perintah, langkah 4). |
| F3 | rendah | `/staf/admin-platform/lokasi` menjawab 200 kepada pengunjung tanpa sesi. Halaman ini punya `loading.tsx`, jadi Next mengirim kerangka halaman lalu redirect ke /masuk di dalam stream. Isi halaman tidak ikut terkirim (diperiksa: tidak ada teks halaman, ada `NEXT_REDIRECT;replace;/masuk`). | Bukan kebocoran. Perjalanan UP-A1 menerima pola ini dan tetap gagal bila isi halaman terkirim. |

## 1. Masuk dan sesi (semua peran, tanpa TOTP sesuai ADR 0008)

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| L1 | ideal | Pemesan masuk dengan Kode Masuk email | D `identity/kode-masuk.test.ts`; E `masuk.spec.ts`; U `01-masuk` | ✅ D, E · ⏳ U |
| L2 | ideal | Admin Platform masuk hanya dengan Kode Masuk, tanpa langkah TOTP | E `staf.spec.ts` "…Kode Masuk alone … no TOTP step"; D `staff-access.test.ts` | ✅ D, E |
| L3 | ideal | Admin Lokasi, Petugas Lapangan, Mitra Jasa masuk, menu sesuai peran | D `authorize.test.ts` "each role sees only its own menu"; U `pastikanMasuk` tiap persona | ✅ D · ⏳ U |
| L4 | tepi | Email ditulis dengan huruf besar/kecil berbeda masuk ke Akun yang sama | D "…however the email is written" | ✅ D |
| L5 | tepi | Kode kedaluwarsa tepat 10 menit, masih berlaku sesaat sebelumnya | D "a code expires 10 minutes after…" | ✅ D |
| L6 | tepi | Sesi Admin Platform 12 jam (berlaku 20:59, habis 21:00) | D `staff-access.test.ts`, `better-auth.test.ts` | ✅ D |
| L7 | terburuk | Kode salah ditolak; kode ke-5 salah membakar kode; 10 salah/jam mengunci email 60 menit | D `kode-masuk.test.ts` | ✅ D |
| L8 | terburuk | Kode dipakai ulang, atau kode lama setelah kode baru | D "signs in once, and only the newest one works" | ✅ D |
| L9 | terburuk | Batas kirim: per email 60 detik / 5 per jam, per IP 60 detik / 5 per jam | D; U `01-masuk` "§1 Batas kirim ulang per email dan per IP" | ✅ D · ⏳ U |
| L10 | terburuk | Pengirim email gagal: "gagal kirim", bisa coba lagi | D `kode-masuk.test.ts`, `masuk/actions.test.ts`; U `01-masuk` (.invalid) | ✅ D · ⏳ U |
| L11 | terburuk | Halaman TOTP lama tidak ada lagi | U `12-akses` UP-A3 (`/staf/totp` 404) | ✅ U staging |
| L12 | terburuk | Staf dinonaktifkan: peran dicabut, sesi berakhir | D `staff-access.test.ts`; E `staf.spec.ts` | ✅ D, E |
| L13 | 🕳 | Tombol Keluar dari sisi staf | belum ada test (Pemesan sudah) | 🕳 |

## 2. Izin akses

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| A1 | terburuk | Pengunjung tanpa sesi membuka setiap halaman staf (36 rute statis) dan /akun: berakhir di /masuk | U `12-akses` UP-A1 | ✅ U staging (36+1 rute) |
| A2 | terburuk | Server Action tanpa sesi, atau Pemesan atas Akun lain, ditolak | D `server/guard.test.ts` | ✅ D |
| A3 | terburuk | Admin Lokasi dari Lokasi lain: konfirmasi, tolak, batal, berkas, denah, pembayaran langsung, bukti ahli waris | D `pemesanan/konfirmasi`, `tolak`, `pembatalan`, `berkas`, `pembayaran-langsung.actions`, route `bukti-ahli-waris` | ✅ D |
| A4 | terburuk | Admin Platform tidak boleh mengonfirmasi pesanan Lokasi (hanya menelepon lewat Antrean) | D `konfirmasi.test.ts` | ✅ D |
| A5 | terburuk | Mitra Jasa lain: pekerjaan, bukti, Pencairan | D `mitra-jasa/akses.test.ts`, `pencairan/page.test.ts`, `layanan/tpu.test.ts` | ✅ D |
| A6 | terburuk | Petugas Lapangan lain: tidak melihat dan tidak bisa menyelesaikan Tugas orang lain | D `fieldwork.test.ts` | ✅ D |
| A7 | terburuk | Peran selain Admin Platform: Tarif, Pengaturan Operator, Harga Khusus, Pencairan, Pengembalian, Wakaf | D `tariffs`, `operator-settings`, `harga-khusus`, `transfer`, `refunds`, `wakaf/tinjau` | ✅ D |
| A8 | terburuk | Halaman rilis yang belum dibuka: 404 | D `proxy.test.ts`, `rilis-aksi-guard.test.ts` | ✅ D |
| A9 | 🕳 | Redirect peran salah lewat `staffMenuActor`, dan Admin Lokasi membuka URL Lokasi lain (`scope.tsx`) | belum ada test langsung (data tetap ditolak di domain) | 🕳 |

## 3. Pemesanan (Terencana, Saat Duka, Makamkan di sini, Perpanjangan, Pengurusan/IPTM, Layanan, Wakaf)

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| P1 | ideal | Terencana sampai Lunas dan Bukti Pemesanan | D `terencana.test.ts`; E `bukti-pemesanan.spec.ts`; U `02`, `03` | ✅ D, E · ⛔ U (F2) |
| P2 | ideal | Saat Duka: ajukan, konfirmasi, Tagihan bayar-belakang, catat Pemakaman | D `konfirmasi`, `lewat-jatuh-tempo`; E `saat-duka.spec.ts`; U `04` | ✅ D, E · ⏳ U |
| P3 | ideal | Rilis 2: tumpang, pengembalian, ganti Pemegang Hak, pengingat masa berlaku | D; U `rilis2-tanpa-bayar` | ✅ D · ⏳ U (G4) |
| P4 | ideal | Rilis 3: TPU DKI, IPTM, Mitra Jasa, Wakaf Tanah | D; U `rilis3-*-tanpa-bayar`, `rilis3-bayar` | ✅ D · ⏳/⛔ U |
| P5 | tepi | Total tepat Rp 10.000.000 diterima, Rp 10.000.001 ditolak (batas QRIS) | D `tagihan.test.ts`; U `09-negatif` | ✅ D · ⏳ U |
| P6 | tepi | Lewat Jatuh Tempo tepat 3×24 jam setelah Pemakaman tercatat | D `lewat-jatuh-tempo.test.ts` | ✅ D |
| P7 | terburuk | Dua orang memesan Petak yang sama bersamaan | D `inventory/hold.test.ts`; U `09-negatif` | ✅ D · ⏳ U |
| P8 | terburuk | **Konfirmasi ditekan dua kali dengan dua Petak**: satu Hak Pakai, satu Tagihan | D `pemesanan/balapan-saat-duka.test.ts` (baru) | ✅ D |
| P9 | terburuk | **Dua pesanan dikonfirmasi ke Petak yang sama bersamaan** | D `balapan-saat-duka.test.ts` (baru) | ✅ D |
| P10 | terburuk | **Konfirmasi dan Tolak ditekan bersamaan oleh dua Admin Lokasi** | D `balapan-saat-duka.test.ts` (baru) | ✅ D |
| P11 | terburuk | Isian wizard tidak valid: kolom yang salah disebut | D `saat-duka`, `makamkan-di-sini`, `terencana`, `wakaf-tanah`, `perpanjangan` actions | ✅ D |
| P12 | terburuk | Berkas unggahan kosong, lebih dari 10 MB, atau bukan PDF/JPG/PNG | D `tumpang`, `agreement`, `photo`, `permohonan`, `pembayaran-staf`, `layanan/tpu` | ✅ D |
| P13 | 🕳 | Isian tidak valid di aksi Pengurusan IPTM, Perpanjang IPTM, berkas Perpanjangan, Permintaan Hak Pakai | celah tingkat aksi (domain sudah) | 🕳 |
| P14 | 🕳 | FileStore gagal saat unggah berkas keluarga, bukti Mitra Jasa, Petugas | celah | 🕳 |

## 4. Uang: Tagihan, pembayaran, Harga Khusus, Tarif, Tagihan TPU

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| M1 | ideal | Bayar membuat pembayaran di penyedia; webhook "paid" bertanda tangan menjadikan Lunas dan menerbitkan Bukti Pembayaran | D `billing/payment.test.ts`, route webhook; E `pembayaran.spec.ts`; U `03` | ✅ D, E · ⛔ U (F2) |
| M2 | ideal | Harga Khusus: terbit ulang dengan baris Penyesuaian, alasan diaudit | D `harga-khusus.test.ts` | ✅ D |
| M3 | ideal | Tarif global berlaku mulai tanggalnya; Biaya Layanan Platform satu baris per kuotasi | D `tariffs/*` | ✅ D |
| M4 | ideal | Tagihan TPU bayar-dulu tanpa Biaya Layanan Platform; pengingat bayar-belakang H+3/7/14/30 jam 08.00 WIB | D `layanan/tpu`, `pengajuan-iptm`, `notifications/chasing` | ✅ D |
| M5 | tepi | Harga Khusus Rp 0: langsung Lunas, tanpa pengingat Chasing | D `documents.test.ts`, `harga-khusus.test.ts` | ✅ D |
| M6 | tepi | Dibayar tepat saat jatuh tempo: Pembayaran Perlu Ditinjau; dibayar sebelum tenggat tetapi webhook datang setelah tick | D `payment.test.ts` | ✅ D |
| M7 | tepi | Tidak Tertagih tepat H+30, tetap bisa dibayar | D `chasing.test.ts`, `payment.test.ts` | ✅ D |
| M8 | terburuk | Webhook tanpa tanda tangan, tanda tangan salah, badan diubah, rahasia proyek lain, badan terlalu besar | D adapter dan route; U `12-akses` UP-A2 (staging menolak 401/4xx) | ✅ D, U staging |
| M9 | terburuk | Event yang sama dua kali (berurutan dan bersamaan): satu Bukti | D `payment.test.ts` | ✅ D |
| M10 | terburuk | Nominal tidak cocok, referensi tak dikenal, pembayaran ganda di dua tautan | D `payment.test.ts` | ✅ D |
| M11 | terburuk | Penyedia gagal saat Bayar: `penyedia_gagal`, Tagihan tidak berubah | D `payment.test.ts`, `dokumen/[link]/actions.test.ts` | ✅ D |
| M12 | terburuk | **Bayar ditekan dua kali bersamaan**: satu pembayaran di penyedia, kedua tekanan ke tautan yang sama | D `billing/balapan.test.ts` (baru) | ✅ D |
| M13 | terburuk | **Sepuluh Tagihan terbit bersamaan**: Nomor Tagihan unik | D `balapan.test.ts` (baru) | ✅ D |
| M14 | terburuk | **Dua Harga Khusus bersamaan** pada satu Tagihan: satu terbit ulang berlaku, rantai tetap dua | D `balapan.test.ts` (baru) | ✅ D |
| M15 | terburuk | **Dua terbit ulang bersamaan**: satu menang | D `balapan.test.ts` (baru) | ✅ D |
| M16 | terburuk | **Tick lapse dan tick Lewat Jatuh Tempo bersamaan** di tenggat | D `balapan.test.ts` (baru) | ✅ D |
| M17 | terburuk | **Webhook "paid" setelah pesanan dibatalkan Admin**: tidak Lunas, masuk Perlu Ditinjau | D `balapan.test.ts` (baru) | ✅ D |
| M18 | terburuk | **Admin membatalkan saat webhook "paid" datang**: berakhir Lunas, atau Dibatalkan dengan pembayaran untuk ditinjau | D `balapan.test.ts` (baru) | ✅ D |
| M19 | terburuk | Kegagalan efek setelah bayar diulang tiap 10 menit tanpa kehilangan pembayaran | D `payment.test.ts` | ✅ D |
| M20 | 🕳 | Penyedia timeout saat membuat pembayaran; webhook dengan `paid_at` di masa depan; mata uang lain | celah | 🕳 |
| M21 | 🕳 | Tarif berubah antara kuotasi dan pembayaran (Tagihan memegang harga terbitnya) | celah gabungan | 🕳 |

## 5. Pengembalian Dana dan Pencairan

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| R1 | ideal | Pembatalan keluarga: permintaan, persetujuan, tenggat 2 Hari Kerja, Bukti Pengembalian Dana | D `refunds/refunds.test.ts` | ✅ D |
| R2 | ideal | Pencairan Lokasi Mitra jatuh tempo setelah Lunas dan Pemakaman tercatat; satu BKP mencakup item dan Potongan | D `payouts/*` | ✅ D |
| R3 | ideal | Pencairan Mitra Jasa: Belum jatuh tempo, Jatuh tempo, Dicairkan; hanya miliknya | D `layanan/pencairan-mitra-jasa.test.ts` | ✅ D |
| R4 | tepi | Harga Khusus setelah bayar tidak mengembalikan lebih; utang lebih besar dari run dibawa ke run berikutnya | D `refunds`, `payouts/potongan` | ✅ D |
| R5 | terburuk | Pengembalian melebihi yang dibayar, tanpa rekening, bukan Admin Platform: ditolak | D `refunds.test.ts` | ✅ D |
| R6 | terburuk | Transfer Pencairan bersamaan atas item yang sama: dibayar sekali | D `payouts/transfer.test.ts` | ✅ D |
| R7 | terburuk | **Dua persetujuan Pengembalian Dana bersamaan** | D `refunds/balapan.test.ts` (baru) | ✅ D |
| R8 | terburuk | **Terbitkan Bukti Pengembalian Dana ditekan dua kali bersamaan**: satu Bukti RFD, Tagihan Dikembalikan penuh sekali | D `refunds/balapan.test.ts` (baru) | ✅ D |
| R9 | terburuk | **Keluarga membatalkan dua kali bersamaan**: satu permintaan | D `refunds/balapan.test.ts` (baru) | ✅ D |
| R10 | 🕳 | Pencairan Mitra Jasa tanpa rekening; tahan Pencairan oleh non-Admin Platform; pembulatan pengembalian proporsional Harga Khusus | celah | 🕳 |

## 6. Kerja lapangan, Antrean, notifikasi, worker

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| W1 | ideal | Tugas Lapangan dibuat, ditugaskan, push dan email ke Petugas | D `fieldwork.test.ts` | ✅ D |
| W2 | terburuk | **Selesai ditekan dua kali bersamaan** (sinyal lemah): Selesai sekali | D `fieldwork/balapan.test.ts` (baru) | ✅ D |
| W3 | terburuk | Setiap tick dijalankan dua kali (atau bersamaan) tidak mengirim atau membayar dua kali | D `scheduler`, `peringatan-*`, `refunds`, `payouts`, `layanan/berhenti` | ✅ D |
| W4 | terburuk | Email Tagihan gagal 3 kali: gagal, membuka baris Telepon Pemesan | D `telepon-pemesan.test.ts` | ✅ D |
| W5 | terburuk | **Worker mati**: /api/health 503 `ok:false` saat heartbeat tidak ada atau basi, 200 saat segar | D `api/health/route-worker.test.ts` (baru); U UP-A5 | ✅ D, U staging |
| W6 | terburuk | Aksi usang setelah deploy: "Halaman ini sudah diperbarui" | E `stale-action.spec.ts` (hanya /masuk) | ✅ E |
| W7 | 🕳 | PdfRenderer gagal di rute PDF dokumen | celah | 🕳 |

## 7. Lingkungan dan keamanan

| ID | Tingkat | Kasus | Uji | Status |
|---|---|---|---|---|
| S1 | terburuk | Outbox email development 404 di staging dan produksi | U UP-A3; dicek `curl` ke produksi (404) | ✅ |
| S2 | terburuk | Tautan dokumen yang tidak ada: 404, bukan 500 | U UP-A3 | ✅ U staging |
| S3 | terburuk | Header keamanan dasar | U UP-A4 | 🐞 F1 |
| S4 | terburuk | Runner UAT menolak produksi (kata dan jawaban health) | D `tests/uat/lingkungan.test.ts` | ✅ D |
| S5 | terburuk | Sentry tanpa badan permintaan, nomor telepon, berkas | D `observability/scrub` | ✅ D |

## Comments

**Review dua sumbu (2 Nov 2026, opus, pada 5e7055a).** Standards: 0 blocking, 5 should-fix, 4 nit. Spec: 0 blocking, 2 should-fix, 2 nit. Diperbaiki di commit berikutnya: filter JMAP `after` tanpa `.000Z` (RFC 8620); pengisi kode hanya memberi email terbaru dan mengingat id email yang sudah diberi di `$UAT_OUT/kode/pengisi-dipakai.json` lintas restart; outbox memakai id pesan dan menjelaskan kenapa `sejak` tidak dipakai; cabang Lunas di balapan batal-vs-webhook kini memeriksa `batal` gagal; UP-A1 menerima redirect di dalam stream hanya untuk halaman ber-`loading.tsx` dan tanpa `<h1>`; judul dan asersi test dirapikan. Belum (tercatat sebagai 🕳 di atas, tindak lanjut): P13, P14, W7, M20, M21, R10, A9, L13; dan run staging penuh (blok perintah agent server) yang menunggu F2.
