# Data peluncuran: template untuk diisi owner

Isi empat berkas CSV di folder ini dengan spreadsheet (Excel, Google Sheets, LibreOffice), lalu simpan sebagai **CSV**. Setiap berkas punya baris judul dan **satu baris contoh**: ganti atau hapus baris contoh itu, jangan biarkan terbawa ke data sungguhan. Pemisah koma maupun titik koma (`;`, bawaan Excel berbahasa Indonesia) sama-sama dibaca. Angka rupiah ditulis polos, tanpa "Rp" dan tanpa titik: `750000`.

Insinyur menjalankan, dari folder ini sebagai `--sumber`:

```
npm run import:data-peluncuran -- --sumber docs/ops/data-peluncuran            # uji coba: hanya melaporkan
npm run import:data-peluncuran -- --sumber docs/ops/data-peluncuran --tulis    # menulis
```

Uji coba mencetak apa yang akan dibuat atau diubah dan setiap baris yang ditolak beserta alasannya. Menjalankan ulang tidak mengubah apa pun: baris yang sama tidak dibuat dua kali. Di staging perlu `--izinkan-staging`; di production perlu `--izinkan-production`. Rilis 3 dibuka dengan `RILIS_TERBUKA=3`, jadi data TPU DKI, harga Layanan DKI dengan tarif Mitra Jasa, dan Nazhir harus sudah masuk sebelum saklar itu dinyalakan.

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

Biaya Pengurusan adalah biaya layanan Operator sendiri, bukan pungutan pemerintah. Retribusi Pemda tidak ada di template ini (diatur di layar Tarif).

### `layanan-dki.csv`: harga Layanan DKI dan tarif Mitra Jasa (tiket 06, butir "Layanan"; tiket 49)

| Kolom | Arti |
|---|---|
| `layanan` | Nama Layanan persis seperti di katalog Layanan (layar Layanan). |
| `varian` | Nama varian persis seperti di katalog. Pasangan `layanan` + `varian` adalah kuncinya. |
| `harga_dki_rupiah` | Harga varian itu di TPU DKI (sama di semua TPU), yang dibayar keluarga. |
| `tarif_mitra_jasa_rupiah` | Tarif per varian yang Operator bayarkan kepada Mitra Jasa. Tidak pernah ditampilkan kepada Pemesan. |
| `berlaku_mulai` | Seperti di atas. Kosong = hari impor. |

Impor **tidak membuat Layanan atau varian**: keduanya harus sudah ada di katalog (tiket 49). Baris yang Layanan atau variannya belum ada ditolak dengan alasannya. Daftar orang atau perusahaan Mitra Jasa sendiri tidak diimpor; mereka diundang lewat layar Mitra Jasa.

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
| Persetujuan salinan halaman konten v1 (Tentang Kami, Cara Kami Bekerja, FAQ, Hubungi Kami) dan panduan Pengurusan di TPU DKI DIY | Tinjauan oleh owner atas teks di kode (tiket 26, 43); tidak ada data untuk diisi. |
| Foto milik Operator untuk situs publik | Diserahkan terpisah; sementara dipakai foto stok berlisensi. |
