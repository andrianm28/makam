# Draf data peluncuran (tiket 06): untuk dikonfirmasi owner

Disusun 2026-10-03 di cabang `data-peluncuran-draf`. Ini **draf**: owner memutuskan setiap nilai, terutama setiap jumlah uang. Tidak ada jumlah rupiah yang saya isi; nilai contoh template (750000, 350000, 250000, 180000) tidak dibawa. Uji coba impor: `npm run import:data-peluncuran -- --sumber docs/ops/data-peluncuran` pada Postgres lokal yang sudah dimigrasi dan punya Admin Platform pertama (`npm run seed:admin`). Hasil: **12 baris ditolak**, tidak ada yang ditulis (keluar kode 1, seperti dirancang bila ada penolakan).

## Ringkasan per berkas

| Berkas | Baris | Dibaca uji coba | Ditolak |
|---|---|---|---|
| `tpu-dki.csv` | 39 | 38 akan dibuat | 1 |
| `katalog-layanan.csv` | 5 | 2 akan dibuat | 3 |
| `layanan-dki.csv` | 6 | 0 | 6 (semua harga kosong) |
| `biaya-pengurusan.csv` | 2 | 0 | 2 (jumlah kosong) |
| `nazhir.csv` | 0 | 0 | 0 |

## 1. `tpu-dki.csv`: 39 baris (38 lolos)

**Sumber:** `.scratch/makam-v1-build/research/dki-tpu-list.csv` (riset 2026-09-25, 78 TPU dari daftar Distamhut): daftar nama dan status dari halaman Distamhut "Ketersediaan Petak Makam", pin dari lapisan Jakarta Satu `Titik_Lokasi_Pemakaman` (Distamhut, 2024-06-23), alamat kelurahan/kecamatan dari batas administrasi Jakarta Satu; status "tidak" dari Kompas 2026-06-24, Pemkot Jakarta Barat 2025-10-23 dan detikNews 2025-10-20. Setiap baris menyebut sumbernya di `sumber_data`. Alamat jalan berasal dari OpenStreetMap dan diberi label "(street from OSM)": itu jalan terdekat dari pin, bukan alamat pos resmi.

**Dimasukkan:** 18 baris "ya" (halaman Distamhut menunjukkan petak kosong, dibaca 2026-09-25) dan 21 baris "tidak" yang pernah dinyatakan pejabat dalam berita resmi. **Tidak dimasukkan (43 baris)** karena tidak ada sumber yang menyatakannya: 29 TPU yang "tidak" hanya berdasarkan inferensi (tidak ada petak kosong di Distamhut dan tidak ada di daftar 11 TPU Kadis), 14 TPU berstatus tidak pasti. Lima pin dikosongkan karena riset menandainya "needs verification".

**Ditolak:** baris 37 `TPU Kampung Bayur`: alamat kosong (riset tidak punya pin maupun alamat untuknya).

### Pertanyaan terbuka untuk owner (TPU)

1. **29 TPU berstatus "tidak" hanya inferensi** (tidak ada pernyataan resmi): Malaka Ampat, Jembatan Sampi, Sarang Bango/Malaka I, Tegal Kunir, Plumpang, Kampung Mangga, Sungai Bambu, Semper, Kebon Jahe, Basmol, Pondok Ranggon, Bantar Jati, Susukan Islam, Susukan Budha, Ciracas, Pondok Kelapa, Kampung Rambutan I/II, Kampung Gedong, Cipinang Asem, Kebon Pala, Cijantung, Kali Sari, Penggilingan, Kampung Penggilingan, Kampung Kapuk, Kampung Baru & Cipinang Baru, Utan Kayu (Kemiri), Malaka I (Pondok Kopi), Malaka II/Tanah Merah. Masukkan sebagai "tidak" (berdasar inferensi di `research/dki-tpu-list.md` §Method 5), tunggu telepon ke Sudin, atau tetap dikeluarkan?
2. **10 TPU berstatus "unknown"** (sumber bertentangan atau tanpa data): Petamburan, Tegal Alur I, Pegadungan, Srengseng Sawah, Menteng Pulo II, dan 5 TPU Kepulauan Seribu (Pulau Tidung, Lancang, Untung Jawa, Karya, Harapan/Kelapa). Jangan dimasukkan sampai ada kepastian?
3. **TPU Kampung Bayur** (status "ya", 3 petak): alamat dan pin tidak ada, kota (Jakarta Timur) paling tidak pasti. Berikan alamat, atau keluarkan dari draf?
4. **Pin yang dikosongkan**, isi kalau owner mau memakai koordinat yang sudah ditandai perlu verifikasi: Karet Pasar Baru Barat (titik berlabel "Karet Tengsin", dicocokkan dari jalan), Joglo (OSM; titik resmi jatuh di Jakarta Selatan), Pisangan (OSM menamai titik yang sama "TPU wakaf ragunan"), Rawa Terate (kepercayaan rendah; titik OSM "TPU Kober Cantang"). Malaka Ampat (OSM) tidak masuk draf.
5. **Jeruk Purut**: Distamhut menampilkan 5 petak kosong, tetapi Sudin Jaksel (Okt 2025) menyebutnya makam tumpang saja. Tetap "ya"?
6. **"ya" bisa berbalik dalam sehari** (satu petak = ya hari ini): dicatat riset per unit agama. Apakah flag tunggal ini cukup untuk peluncuran?
7. **Lapisan pin Jakarta Satu** berasal dari peta berjudul "(Dummy)" dengan satu kesalahan yang diketahui (Cipinang Besar sudah dikoreksi di riset). Cukup layak dipakai untuk pin peluncuran?
8. Daftar Distamhut 78 TPU vs ucapan Kadis "80" (Okt 2025) dan "82" (Mar 2026): tidak ada daftar resmi terurai. Dataset satudata.jakarta.go.id "Data Pemakaman di Provinsi DKI Jakarta" (alamat jalan resmi) tidak terjangkau dari sini; perlu diunduh orang dengan koneksi Indonesia.

## 2. `katalog-layanan.csv`: 5 baris (2 lolos)

**Sumber:** daftar lima Layanan v1 dari keputusan tiket 09 (`.scratch/makam-v1/issues/09-layanan-catalog.md`); varian Bunga dan Batu Nisan dari migrasi aplikasi lama `makam-app` (`2026_07_26_180200_seed_marketplace_products_and_variants.php`, repositori `andrianm28/makam-app`, dibaca read-only): Karangan Bunga Papan, Paket Bunga Tabur; empat varian Batu Nisan yang di aplikasi lama tertulis sebagai contoh ilustratif ("Granit Hitam 60 x 80 cm" dll.). Katalog `makam_beta` yang diimpor tiket 86 fiktif (riset `old-app-catalog-and-cutover-data.md`) dan aplikasi lama tidak menyimpan satu harga pun (`base_price_idr` semua NULL), jadi **tidak ada sumber harga**. Lead time 1/3/14 hari (Bunga, Pembersihan, Nisan) adalah contoh "e.g." di tiket 09, bukan keputusan. Deskripsi saya tulis sendiri dari nama Layanan.

**Ditolak:** Pembersihan Makam, Perawatan Rumput & Taman dan Laporan Foto/Video (baris 4 sampai 6): `varian` kosong; Perawatan dan Laporan juga `lead_time_hari` kosong. Saya tidak mengarang nama varian (contoh template "Standar | Menyeluruh" bukan dari sumber).

### Pertanyaan terbuka untuk owner (Layanan)

9. Nama dan isi **varian** Pembersihan Makam (satu atau beberapa)?
10. Nama dan isi **varian** Perawatan Rumput & Taman? (Aplikasi lama punya Bulanan/3 Bulan/6 Bulan/Tahunan; di v1 frekuensi itu urusan Paket Layanan, jadi bukan varian.)
11. Nama dan isi **varian** Laporan Foto/Video Kondisi Makam?
12. **Lead time** Perawatan Rumput & Taman dan Laporan Foto/Video (hari)?
13. Konfirmasi lead time Bunga 1 hari, Pembersihan 3 hari, Batu Nisan 14 hari (contoh di tiket 09).
14. Layanan Bunga: satu Layanan "Bunga Ziarah / Bunga Pemakaman" dengan varian Karangan Bunga Papan dan Paket Bunga Tabur, atau dipecah jadi dua Layanan? Ukuran bunga di tiket 09 disebut sebagai contoh varian.
15. **Varian Batu Nisan**: empat varian dari aplikasi lama itu contoh ilustratif. Mana yang sungguhan, dan mana yang "boleh di TPU DKI" (ditandai di layar Admin Platform setelah impor, bukan di CSV)?
16. Kolom `bisa_hari_h` dan `ada_di_petak_kosong` saya isi dari contoh di tiket 09 (hari-H hanya Bunga; petak kosong untuk Pembersihan, Perawatan, Laporan). Benar?
17. Teks label Batu Nisan "Tulisan pada nisan" dan semua deskripsi (copy buatan saya): setuju?

## 3. `layanan-dki.csv`: 6 baris, semua kosong harga (ditolak)

Enam varian (dua Bunga, empat Batu Nisan) dengan `harga_dki_rupiah` dan `tarif_mitra_jasa_rupiah` **kosong**, karena tidak ada sumber. Pembersihan, Perawatan dan Laporan tidak punya baris sampai variannya ada (pertanyaan 9 sampai 11).

### Pertanyaan terbuka (uang)

18. Harga DKI (yang dibayar keluarga) dan tarif Mitra Jasa (rupiah) untuk **setiap** varian: Karangan Bunga Papan; Paket Bunga Tabur; Granit Hitam 60 x 80 cm; Granit Abu-abu 80 x 100 cm; Marmer Putih 60 x 80 cm; Marmer Krem 80 x 100 cm; dan setiap varian Pembersihan, Perawatan, Laporan nanti. Itu 12 jumlah uang untuk enam baris ini saja, dan `berlaku_mulai` (kosong = hari impor).

## 4. `biaya-pengurusan.csv`: 2 baris, jumlah kosong (ditolak)

### Pertanyaan terbuka (uang)

19. Biaya Pengurusan **pemakaman** (rupiah) dan 20. Biaya Pengurusan **berkas** (rupiah, lebih rendah dari pemakaman menurut tiket 26), serta tanggal `berlaku_mulai` (tidak boleh tanggal lampau). Template memuat 750000 dan 350000 hanya sebagai contoh; saya tidak menganggapnya keputusan.

## 5. `nazhir.csv`: 0 baris (hanya baris judul)

Tidak ada sumber publik yang terjangkau: `apps.bwi.go.id/data-wakaf` hanya statistik; `nazhir.bwi.go.id` dan `data.bwi.go.id` tidak terhubung; pencarian web hanya menemukan peraturan, bukan daftar. Satu contoh nomor BWI muncul di sebuah hasil pencarian (Universitas Andalas, 3.3.00474) tetapi itu Nazhir di luar Jabodetabek dan bukan daftar resmi, jadi tidak dimasukkan. Tidak ada kontak yang saya tulis atau karang. Tiket 58 menyatakan Nazhir dikelola lewat layar Admin Platform (CRUD), jadi file kosong dapat diterima.

21. Apakah owner punya daftar Nazhir Jabodetabek (nama, jenis, kab/kota, kontak organisasi yang dipublikasikan, nomor BWI) untuk diisi, atau Nazhir diisi lewat layar Admin Platform?

## Hitungan

Pertanyaan terbuka: **21** (uang: nomor 18, 19, 20; dua belas jumlah di nomor 18 dan dua di 19 dan 20 dihitung dalam tiga butir ini).
