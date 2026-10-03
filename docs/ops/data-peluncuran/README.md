# Data peluncuran: template untuk diisi owner

Isi lima berkas CSV di folder ini dengan spreadsheet (Excel, Google Sheets, LibreOffice), lalu simpan sebagai **CSV**. Setiap berkas punya baris judul dan **satu baris contoh**: ganti atau hapus baris contoh itu, jangan biarkan terbawa ke data sungguhan. Pemisah koma maupun titik koma (`;`, bawaan Excel berbahasa Indonesia) sama-sama dibaca. Angka rupiah ditulis polos, tanpa "Rp" dan tanpa titik: `750000`.

## Sebelum mengisi: tiga jebakan spreadsheet

1. **Simpan sebagai "CSV UTF-8"** (di Excel: *Simpan Sebagai* > *CSV UTF-8 (Dibatasi koma)*; di Google Sheets: *Unduh* > *Nilai yang dipisahkan koma (.csv)*). Pilihan "CSV" biasa di Excel memakai penyandian lama (ANSI) dan merusak huruf beraksen atau tanda baca khusus pada nama.
2. **Atur kolom teks ke format "Teks" sebelum mengetik**: kolom `kontak` dan `nomor_bwi` (Excel menghapus angka 0 di depan nomor telepon), kolom `berlaku_mulai` (Excel mengubah `2026-11-01` menjadi tanggal berformat lain), dan kolom `lintang` dan `bujur` (di Excel berlokal Indonesia `-6.1200` menjadi `-6,12` dan kadang dibulatkan; koma desimal ikut terbaca, tetapi jangan biarkan Excel membulatkan).
3. **Ejaan kota atau kabupaten**: tulis lengkap dengan "Kota" atau "Kabupaten", misalnya `Kota Jakarta Utara`, `Kabupaten Kepulauan Seribu`, `Kota Bogor`, `Kabupaten Bogor`, `Kota Depok`, `Kota Tangerang`, `Kabupaten Tangerang`, `Kota Tangerang Selatan`, `Kota Bekasi`, `Kabupaten Bekasi`, `Kota Jakarta Pusat`, `Kota Jakarta Barat`, `Kota Jakarta Selatan`, `Kota Jakarta Timur`. Untuk Wakaf, kota di luar daftar ini diperlakukan sebagai di luar Jabodetabek (Dirujuk).

**Syarat awal:** akun Admin Platform pertama harus sudah ada (`npm run seed:admin`, tiket 09); impor berhenti dengan pesan jelas bila belum.

Insinyur menjalankan, dari folder ini sebagai `--sumber`:

```
npm run import:data-peluncuran -- --sumber docs/ops/data-peluncuran            # uji coba: hanya melaporkan
npm run import:data-peluncuran -- --sumber docs/ops/data-peluncuran --tulis    # menulis
```

Uji coba mencetak apa yang akan dibuat atau diubah dan setiap baris yang ditolak beserta alasannya. Menjalankan ulang tidak mengubah apa pun: baris yang sama tidak dibuat dua kali. Di staging perlu `--izinkan-staging`; di production perlu `--izinkan-production`. Rilis 3 dibuka dengan `RILIS_TERBUKA=3`, jadi data TPU DKI, katalog Layanan beserta harga DKI dan tarif Mitra Jasa, dan Nazhir harus sudah masuk sebelum saklar itu dinyalakan.

Urutan impor: TPU DKI, Biaya Pengurusan, katalog Layanan, harga Layanan DKI, Nazhir. Uji coba menjalankan semuanya sungguhan di dalam satu transaksi lalu membatalkannya, jadi setiap penolakan yang akan terjadi saat `--tulis` (tanggal lampau, nama sudah dipakai, jumlah di luar batas) sudah muncul di uji coba. Baris yang ditolak tidak menghentikan baris lain; keluaran akhirnya selalu menyebut nomor baris dan alasannya, dan program berakhir dengan kode 1 bila ada yang ditolak.

## Yang diimpor (banyak baris)

### `tpu-dki.csv`: TPU DKI (tiket 06, butir "DKI TPU"; tiket 43)

| Kolom | Arti |
|---|---|
| `nama` | Nama TPU. Kunci: dua TPU tidak boleh bernama sama. Maks. 120 huruf. |
| `alamat` | Alamat jalan. Maks. 300 huruf. |
| `kota` | Kota atau kabupaten, misalnya `Kota Jakarta Utara`. Dipakai filter kota di direktori. |
| `lintang`, `bujur` | Titik peta (pin) dalam derajat desimal, titik sebagai pemisah desimal (`-6.1200`). Kosongkan keduanya bila tidak ada pin: alamat sudah cukup untuk menemukan TPU. Isi keduanya atau kosongkan keduanya. |
| `sumber_data` | Dari mana data ini didapat (instansi, tanggal telepon, dokumen). Wajib. Maks. 200 huruf. |
| `menerima_makam_baru` | `ya` atau `tidak`: apakah TPU saat ini menerima makam baru. Hanya TPU yang menerima ditawari pemakaman. Tanggal pemeriksaan tercatat dari hari impor. |

Bila nama sudah ada, impor membandingkan isinya: alamat, kota, pin atau sumber yang berbeda diubah, dan bendera yang berbeda diperbarui (dengan tanggal pemeriksaan baru).

### `biaya-pengurusan.csv`: Biaya Pengurusan (tiket 06, butir "DKI TPU"; tiket 12)

| Kolom | Arti |
|---|---|
| `jenis` | `pemakaman` (Operator mengurus pemakaman) atau `berkas` (hanya mengurus berkas). Tepat dua baris, satu per jenis; boleh salah satu bila hanya satu yang diisi sekarang. |
| `jumlah_rupiah` | Biaya layanan Operator, bilangan bulat rupiah. |
| `berlaku_mulai` | Tanggal berlaku `TTTT-BB-HH`. Kosong = hari impor. Tidak boleh tanggal lampau. |

Biaya Pengurusan adalah biaya layanan Operator sendiri, bukan pungutan pemerintah. Retribusi Pemda (IPTM) tidak ada di template ini: diisi di layar Tarif (lihat tabel di bawah).

### `katalog-layanan.csv`: katalog Layanan (tiket 06, butir "Layanan"; tiket 49)

| Kolom | Arti |
|---|---|
| `layanan` | Nama Layanan. Kunci: huruf besar dan kecil serta spasi ganda tidak dibedakan. |
| `jenis` | Satu dari: `bunga`, `nisan`, `pembersihan`, `perawatan`, `laporan`. Jenis menentukan bukti yang diminta dari pekerja (foto sebelum dan sesudah, video untuk laporan), jadi tidak diketik sendiri. |
| `deskripsi` | Penjelasan singkat untuk keluarga. Maks. 500 huruf. |
| `lead_time_hari` | Jarak minimal (hari) antara pesanan dan tanggal pengerjaan. 0 sampai 365. |
| `bisa_hari_h` | `ya` atau `tidak`: boleh ditambahkan saat pemakaman (hari-H) di Saat Duka. |
| `ada_di_petak_kosong` | `ya` atau `tidak`: boleh ditawarkan untuk petak yang belum ada pemakamannya (Terencana). |
| `teks_label` | Bila Layanan meminta teks bebas dari pemesan (misalnya tulisan di karangan bunga), tulis labelnya di sini. Kosong bila tidak ada. |
| `varian` | Semua varian dalam satu sel, dipisahkan tanda `\|`: `Standar \| Menyeluruh`. Tidak boleh ada dua varian bernama sama. |

Bila Layanan sudah ada, impor menyamakan kolom lain dan menambah varian yang baru disebut; varian tidak pernah dihapus oleh impor.

### `layanan-dki.csv`: harga Layanan DKI dan tarif Mitra Jasa (tiket 06, butir "Layanan"; tiket 49)

| Kolom | Arti |
|---|---|
| `layanan` | Nama Layanan persis seperti di `katalog-layanan.csv` atau di katalog yang sudah ada. |
| `varian` | Nama varian. Pasangan `layanan` + `varian` adalah kuncinya. |
| `harga_dki_rupiah` | Harga varian itu di TPU DKI (sama di semua TPU), yang dibayar keluarga. |
| `tarif_mitra_jasa_rupiah` | Tarif per varian yang Operator bayarkan kepada Mitra Jasa. Tidak pernah ditampilkan kepada Pemesan. |
| `berlaku_mulai` | Seperti di atas. Kosong = hari impor. |

Kedua harga satu baris masuk bersama atau tidak sama sekali. Baris yang Layanan atau variannya tidak ada di katalog ditolak dengan alasannya. Daftar orang atau perusahaan Mitra Jasa tidak diimpor; mereka diundang lewat layar Mitra Jasa (hanya tarifnya per varian yang diisi di sini).

### `nazhir.csv`: daftar Nazhir (tiket 06, butir "Wakaf"; tiket 58)

| Kolom | Arti |
|---|---|
| `nama` | Nama Nazhir. |
| `jenis` | `perorangan`, `organisasi`, atau `badan_hukum`. |
| `kab_kota` | Kota atau kabupaten tempat Nazhir bertugas. Kunci: `nama` + `kab_kota`. |
| `kontak` | Telepon atau email. Hanya terlihat oleh Admin Platform. |
| `nomor_bwi` | Nomor pendaftaran Badan Wakaf Indonesia. |

Tidak ada Nazhir pun tidak apa-apa: kosongkan berkas (hanya baris judul) atau hapus berkasnya.

## Yang tidak diimpor (satu data): sudah ada layar atau perintahnya

| Butir tiket 06 | Cara mengisinya |
|---|---|
| Admin Platform pertama (nomor telepon dan email) | Berikan kepada insinyur; dibuat dengan `npm run seed:admin` (tiket 09). |
| Pengaturan Operator: nama badan hukum PT Jaya Korpora Prima, alamat terdaftar, telepon dan email, nomor WhatsApp CS dan jam balasnya ("dibalas mulai pukul 06:00") | Layar Admin Platform > Pengaturan Operator (tiket 63). Nomor WhatsApp hanya untuk tautan `wa.me` dan tampilan (ADR 0004). |
| Biaya Layanan Platform (satu tarif datar) dan tanggal berlakunya | Layar Admin Platform > Tarif (tiket 12). |
| Retribusi Pemda (IPTM) | Layar Admin Platform > Tarif (tiket 12), di samping Biaya Layanan Platform. Satu tarif, bukan banyak baris, jadi tidak diimpor. |
| Persetujuan salinan halaman konten v1 (Tentang Kami, Cara Kami Bekerja, FAQ, Hubungi Kami) dan panduan Pengurusan di TPU DKI DIY | Tinjauan oleh owner atas teks di kode (tiket 26, 43); tidak ada data untuk diisi. |
| Foto milik Operator untuk situs publik | Diserahkan terpisah; sementara dipakai foto stok berlisensi. |
