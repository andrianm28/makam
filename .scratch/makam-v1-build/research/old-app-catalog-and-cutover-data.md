# Riset: katalog aplikasi lama (`makam_beta`) dan keputusan data saat cutover

Tanggal riset: 2026-09-27 · untuk tiket 86 (impor katalog) dan tiket 65 (switch `makam.co.id`)
Metode: read-only. Tidak ada kode aplikasi yang ditulis, tidak ada DB yang disentuh, tidak ada
container yang dijalankan.

**Cara membaca dokumen ini.** Setiap klaim diberi kutipan `path:baris` atau commit hash. Klaim
dipisah tegas menjadi **(A) fakta berdasar sumber**, **(B) inferensi saya**, **(C) tidak diketahui**.
Lokal yang disebut "aplikasi lama" adalah `/home/ubuntu/makam-app` (Laravel 13 / Livewire /
Filament) — repo terpisah dari `/home/ubuntu/makam` (v1).

---

## Ringkasan eksekutif

1. **Skema katalog aplikasi lama ADA di host ini, di dalam repo aplikasi lama itu sendiri.**
   `.scratch/` dan git history v1 tidak memuat satu baris pun tentang skema katalog; yang ada
   hanya rujukan. Yang memuat skema adalah 182 file migrasi di
   `/home/ubuntu/makam-app/database/migrations/`. Jadi Q1 **tidak** perlu di_export dari DB untuk
   sampai ke bentuk tabel/kolomnya.
2. **Tapi isi katalog di `makam_beta` praktis tidak ada.** Katalog di `makam_beta` adalah **100 %
   data fiktif**: 10 baris `cemeteries`, seluruhnya beralamat `Jl. Contoh …` (§1.3, §1.5). Empat
   "TPU nyata" yang pernah disebut di migrasi **tidak ada** di database mana pun yang diukur
   (§1.5). Artinya AC tiket 86 "testers see real-looking Lokasi" **tidak bisa dipenuhi dari
   sumber yang disebut di tiket itu sendiri** — ini temuan paling penting dari riset ini.
3. **Alternatif yang sudah ada di repo v1:** `.scratch/makam-v1-build/research/dki-tpu-list.csv`
   berisi **78 TPU DKI nyata** dengan alamat, koordinat, sumber data, dan flag
   `menerima_makam_baru` (§1.6). Ini kandidat yang jauh lebih baik untuk beta, dan ticket 43 sudah
   memiliki tiket sendiri untuk masukan TPU tersebut (§1.6) — menimbulkan benturan scope dengan
   tiket 86 yang harus diputuskan owner.
4. **Q2 (carry-over) sebagian besar sudah terjawab oleh keputusan owner 2026-09-26, tapi masih
   open pada dua sub-pertanyaan.** Yang sudah jelas: tidak ada uang nyata yang perlu dipindahkan,
   dan katalog-lah satu-satunya yang "pindah" (§2.1). Yang masih open: (a) apakah dump terenkripsi
   users/orders di Stage 3 dibuat atau dilewati, dan (b) konfirmasi bahwa "~22 order contacts
   ber-nomor realistis" memang akun tim (§2.1). Rekomendasi saya: **tentatively resolved** dengan
   dua follow-up yang harus dijawab sebelum switch**, bukan open penuh.

---

# Q1 — Seperti apa skema katalog aplikasi lama

## 1.1 Di mana sumbernya (A)

Repo v1 sendiri **tidak** punya skema katalog. Yang ada hanya rujukan:

- `.scratch/makam-v1-build/issues/86-import-old-app-catalog-for-beta.md:9` — "read-only from its
  database at /home/ubuntu/makam-app's stack".
- `.scratch/makam-v1-build/handoff-cloud.md:27` — "**86 blocked**: needs a read-only catalog export
  from the old app's `makam_beta` DB … Asked the owner."
- `docs/adr/0002-rebuild-on-nextjs-self-hosted-in-jakarta.md:3` — "not a continuation of the
  existing Laravel app at `/home/ubuntu/makam-app` (Laravel 13 / Livewire / Filament, ~1,500
  commits, dev and beta running), which is frozen as reference."

Commit yang membuat tiket 86 dan menyinggung katalog: `86998e1` ("Beta UAT on makam.co.id:
host-disk FileStore, local nightly backups, old-app catalog import (ticket 86)").

**Tapi `/home/ubuntu/makam-app` ada utuh di host ini** (182 migrasi, `app/Domain/` berisi 21
domain). Iterator grep di `/home/ubuntu/makam-app` tidak menemukan satu pun string `tayang` maupun
`kavling` — jadi **"belum tayang" dan "Kavling Keluarga" adalah konsep v1, bukan konsep aplikasi
lama**. Ini penting untuk pemetaan (Bagian 1.6).

## 1.2 Tabel katalog di aplikasi lama (A)

Lima tabel, semuanya milik subtree `CemeteryDirectory` + `CemeteryCapability` + `PlotInventory` +
`GraveRegistry`:

### `cemeteries` — tabel utama, satu baris per "TPU/TPS"
`/home/ubuntu/makam-app/database/migrations/2026_07_26_190000_create_cemeteries_table.php:102-141`

| Kolom | Tipe | Keterangan (berdasar doc block + DDL) |
|---|---|---|
| `id` | `uuid` PK | `:103`; deviates deliberate dari konvensi auto-increment repo ini (`:23-40`) |
| `type` | `string(8)` | `:105`; `TPU` / `TPS`, closed-list di app layer (`:45-47`) |
| `publication_status` | `string(16)`, default `draft` | `:106` |
| `name` | `string` | `:108` |
| `slug` | `string` unique | `:109` |
| `city` | `string(32)` | `:111`; kode kota, bukan nama kota |
| `address` | `text` **wajib** | `:112`; satu-satunya field detail view boleh andalkan tanpa syarat (`:56-59`) |
| `latitude` | `decimal(10,7)` nullable | `:114` |
| `longitude` | `decimal(10,7)` nullable | `:115` |
| `google_maps_url` | `string` nullable | `:116` |
| `primary_photo_path` | `string` nullable | `:118`; **path storage, bukan URL publik** (`:60-63`) |
| `facilities` | `json` nullable | `:120`; array label free-text, bukan closed list (`:64-67`) |
| `price_min` | `decimal(14,2)` nullable | `:122` |
| `price_max` | `decimal(14,2)` nullable | `:123` |
| `price_currency` | `string(3)`, default `IDR` | `:124`; satu-satunya kolom harga yang wajib |
| `price_source` | `string` nullable | `:125` |
| `price_effective_at` | `timestamp` nullable | `:126` |
| `operator_name` | `string` nullable | `:128`; atribusi pemilik/pengelola fisik |
| `published_at` | `timestamp` nullable | `:130` |
| `unpublished_at` | `timestamp` nullable | `:131` |
| `plot_tracking_mode` | `string(16)`, default `aggregate` | migration terpisah `2026_08_26_150000_…:36-37` |
| `demo_batch_id` | `uuid` nullable | migration `2026_09_03_150000_…:22-28` |

### `cemetery_capability_profiles` — append-only, 6 mode
`2026_07_26_190100_create_cemetery_capability_profiles_table.php:82-109`
Kolom: `id`, `cemetery_id` (FK, cascade), `version_number`, lalu enam mode
(`availability_mode`, `booking_mode`, `map_mode`, `registry_mode`, `certificate_mode`,
`visitation_mode`), lalu `source` (wajib), `owner`, `evidence`, `rollback_plan`, `effective_at`,
`superseded_at` (NULL = versi current). Nilai tiap mode:
`INDICATIVE|PACKAGE_CLASS|SPECIFIC_PLOT`, `REQUEST_CONFIRMATION|RESERVE_PLOT|DIRECT_PURCHASE`,
`LOCATION_ONLY|BLOCK_MAP|PLOT_MAP`, `NONE|BASIC|AUTHORITATIVE`, `NONE|MANUAL|PLATFORM_MANAGED`,
`NONE|INFORMATION_ONLY|BOOKABLE` (`app/Domain/CemeteryCapability/{Availability,Booking,Map,Registry,
Certificate,Visitation}Mode.php`; default aman di
`Models/CemeteryCapabilityProfile.php:207-214`).

### `cemetery_packages` — analogue terdekat "Jenis Makam"
`2026_07_26_190200_create_cemetery_packages_table.php:54-71`, plus 5 kolom harga di
`2026_08_26_110000_add_price_fields_to_cemetery_packages_table.php:71-77`
Kolom: `id`, `cemetery_id` (FK, cascade), `name` (ctk. "Makam Tumpang"), `class_label` (ctk. "Kelas
A"), `availability_status` (`AVAILABLE|LIMITED|UNAVAILABLE`,
`CemeteryPackageAvailabilityStatus.php:34-40`), `description`, `sort_order`, `is_active`, plus
`price_min`, `price_max`, `price_currency`, `price_source`, `price_effective_at`.
Dokumennya eksplisit: tabel ini **bukan** tabel petak dan **tidak pernah** dijumlahkan/dibayar —
`2026_07_26_190200_…:19-24` dan `2026_08_26_110000_…:26-42`.

### `cemetery_blocks` dan `grave_plots` — grid petak
`2026_08_16_100000_create_cemetery_blocks_table.php:48-61` — `id` (uuid), `cemetery_id`
(restrict), `code` (unique per cemetery, di-normalisasi uppercase), `name`, `capacity` (≥1),
`is_active`, `timestamps`.
`2026_08_16_100010_create_grave_plots_table.php:53-66` — `id` (uuid), `block_id` (restrict),
`slot` (unique per block, `001..N`), `plot_state`
(`AVAILABLE|RESERVED|OCCUPIED|MAINTENANCE`, `PlotState.php:32-52`), `cemetery_package_id`
(`nullOnDelete`), `timestamps`.
`grave_plots` **dibangkitkan massal** dari `capacity` blok
(`app/Domain/PlotInventory/Actions/CreateCemeteryBlock.php:128-153`), bukan satu baris satu petak
dari sumber luar.

### `grave_records` — registri jenazah (DATA PRIBADI)
`2026_08_08_100000_create_grave_records_table.php:142-186` — `deceased_name`,
`deceased_name_normalized`, `block`, `death_date` (nullable), `due_date` (nullable),
`heir_contact_reference` (nullable, **dokumennya tegas: tidak pernah nomor telepon atau alamat**,
`:71-83`), `access_mode` (`OPEN|LIMITED|CLOSED`), `source`, `source_updated_at`.

### Tabel pendukung katalog
- `launch_cities` — `code` unique, `label`, `is_active`, `sort_order`
  (`2026_08_15_110000_create_launch_cities_table.php:31-38`); 5 kota:
  `JAKARTA, BOGOR, DEPOK, TANGERANG, BEKASI` (`app/Domain/CemeteryDirectory/LaunchCityCode.php:42-50,57-63`).
- `cemetery_visitation_policies`, `plot_reservations`, `visititation_*` — **tidak relevan** untuk
  impor beta.

### Yang BUKAN katalog (jangan tertukar)
`products` / `product_variants` (`2026_07_26_180000_create_products_table.php:125-146`) adalah
**marketplace jasa** (Karangan Bunga, Batu Nisan, Perawatan Makam) dengan kategori
`FLOWERS|GRAVESTONES|GRAVE_CARE` — bukan pemakaman. `price_versions`
(`2026_07_26_180400_…:76-98`) adalah harga append-only untuk `ServiceDefinition`, dan
`service_definitions` adalah katalog **Layanan**, bukan Jenis Makam. Untuk beta, `products` dan
`price_versions` sebaiknya **tidak** diimpor (lihat 1.6).

## 1.3 "Belum tayang" vs tayang — bagaimana aplikasi lama menandainya (A)

**Tidak ada kolom bernama "tayang".** Yang ada adalah **dua sumbu terpisah**, dan mencampur keduanya
adalah kesalahan yang paling mungkin terjadi di tiket 86:

### Sumbu A — status publikasi direktori (untuk direktori publik)
`app/Domain/CemeteryDirectory/CemeteryPublicationStatus.php`
- `DRAFT = 'draft'` (`:37`) — "Never yet published. Not visible to any public directory query."
- `PUBLISHED = 'published'` (`:43`)
- `UNPUBLISHED = 'unpublished'` (`:49`)
- `DEFAULT = self::DRAFT` (`:51`)

Ditambah pasangan `published_at` / `unpublished_at` (`cemeteries:130-131`), dan query publik
memakai `Cemetery::scopePublished()` — indeks pendukungnya `cemeteries_city_status_idx`
(`cemeteries:137`).

**Kondisi nyata di `makam_beta`:** 10 baris, **9 `published` + 1 `draft`**
(`app/Support/ExampleData/CemeteryExampleData.php:251` + `:146-151`; draft adalah index 9,
`tps-bekasi-10`). Dikonfirmasi pengukuran 13 Sep 2026 di produksi: "**sembilan lokasi** yang tampil
di direktori publik" (`docs/superpowers/plans/2026-09-13-kamboja-design-language.md:1108-1110`).

### Sumbu B — penanda data fiktif (ini yang sebenarnya menentukan "belum tayang")
Ada **dua penanda yang ditulis seeder** ke dalam kolom, bukan dihitung saat render:

1. `cemeteries.address` diawali `"Jl. Contoh"` — dibekukan sebagai konstanta
   `FABRICATED_ADDRESS_PREFIX` di `2026_09_17_100000_mark_fabricated_cemetery_names_as_examples.php:81`,
   dipakai di `:88`.
2. `cemeteries.name` diberi akhiran `" (pemakaman contoh)"` — migration
   `2026_09_17_100000_…:83, 90-93`. Alasan putting marker in the column, bukan di presenter,
   ada di `:29-45`: nama mengalir ke notifikasi, sertifikat, dan order.
3. `grave_records.source = 'contoh'` (`GraveRecordSource::CONTOH`; dipakai di
   `PurgeExampleDataCommand.php:336-338`).

Penanda 1 dan 2 ini yang dijadikan **evidence Keys** yang beku oleh
`app/Console/Commands/PurgeExampleDataCommand.php:330-342` — dengan alasan eksplisit bahwa
`CemeteryExampleData::slugs()` adalah identitas terhadap kode yang bergerak, sementara
marker `Jl. Contoh` ditulis seeder dan tidak akan berubah
(`2026_09_17_100000_…:47-60`; `PurgeExampleDataCommand.php:300-317`).

**Ringkasan (A):** di aplikasi lama, "belum tayang" = `publication_status = 'draft'`
(1 baris), sedangkan "ini bukan data nyata" = penanda `Jl. Contoh` / `(pemakaman contoh)` /
`source = 'contoh'` (semua 10 baris). Keduanya harus diekspor terpisah.

## 1.4 Bagaimana harga disimpan (A)

Aplikasi lama punya **dua konvensi harga yang berbeda**, dan memilih yang salah akan berarti
memperlakukan angka indikatif sebagai harga yang bisa ditagihkan:

| # | Konvensi | Bentuk | Dipakai untuk |
|---|---|---|---|
| 1 | **Indikatif, beratribusi** | `decimal(14,2)` + `price_currency` + `price_source` + `price_effective_at`, nullable | `cemeteries` (`2026_07_26_190000_…:122-126`) dan `cemetery_packages` (`2026_08_26_110000_…:72-76`) |
| 2 | **Transactable, minor-unit, append-only** | `bigint` `*_minor` / `Money`, atau `price_versions(priceable_type, priceable_id, version_number, amount decimal(12,2), currency, source, effective_from, superseded_at)` | `vendor_listings`, `renewal_quotes`, `price_versions` |

Dokumen `2026_08_26_110000_…:20-42` menyatakan konvensi 2 secara eksplisit dan memanggil harga
paket konvensi 1: "A package/class price is the second kind: it is not added to a cart, not quoted,
not paid… `ServiceDefinition` prices feed real `Quote`/`Order` totals; this one never does."

**Nilai harga yang benar-benar ada di `cemeteries`:** **tidak ada yang nyata.** Seluruhnya
placeholder yang diturunkan dari index:
`price_min = 3_000_000 + index × 500_000`, `price_max = round(price_min × 1.8)`
(`app/Support/ExampleData/CemeteryExampleData.php:300-305`), dengan
`price_source = 'Estimasi internal (data contoh)'` (`:408-411`). Jadi rentang Rp 3.000.000 –
Rp 13.500.000, semuanya sintetis.

`cemetery_packages` pada baris seed **tidak punya harga sama sekali** (`:482-492` tidak menyertakan
kolom harga; 5 kolom harga ditambahkan 26 Aug, sesudahnya). Tiga produk marketplace pun sengaja
`NULL` (`2026_07_26_180000_…:87-99`), diisi kemudian dengan placeholder yang **disederhanakan secara
eksplisit** (`2026_07_26_200100_…:15-22`).

**Foto (A):** `primary_photo_path` **bukan** foto makam tersebut. Hanya ada 4 file stock yang
di-round-robin ke semua 14 baris, dan dokumennya mengakui: "none of the four photos below
depicts any of these fourteen specific cemeteries; they are real photos of OTHER real cemeteries,
reused across many rows" (`2026_09_08_100000_…:31-34`; lihat juga
`app/Support/ExampleData/CemeteryExampleData.php:191-213`).

## 1.5 Apa yang benar-benar ada di `makam_beta` (A) — hasil pengukuran, bukan inferensi

Ini fakta terukur yang paling menentukan arah tiket 86:

| Pengukuran | Sumber |
|---|---|
| 16 Sep 2026: `cemeteries` **10 present**, `grave_records` **30 present** di `beta` (dan sama di `dev`) | `app/Console/Commands/PurgeExampleDataCommand.php:269-273` |
| 17 Sep 2026: "**ten of ten cemeteries on beta are fabricated**, and their names are plausible Jakarta-area place names" | `2026_09_17_100000_…:25-26` |
| 14 Sep 2026: slug `tpu-petamburan` dan `tpu-karet-bivak` "neither slug exists in the dev database OR the public beta's"; **keempat** "4 REAL, named cemeteries" **absent from both**; "all ten rows that do exist carry `Contoh` addresses" | `config/marketing.php:29-31`; `docs/adr/0040-…:257-261` |
| Baris fiktif yang tersisa: `cemetery_blocks` (2), `grave_plots` (9), `visitation_bookings` (1) merujuk 10 makam fiktif itu, semuanya `restrictOnDelete` | `PurgeExampleDataCommand.php:286-290` |
| 08 Aug 2026 di dev: "10 cemeteries → 10 (unchanged)" | `docs/planning/sprint-plan.md:691` |

**Empat "TPU nyata" yang disebut migrasi tidak pernah ada sebagai baris.** 8 Sep 2026 migrasi
`2026_08_24_100000_…` menyebut slug `tpu-karet-bivak`, `tpu-petamburan`, `tpu-pondok-kelapa`,
`tpu-semper-budi-dharma` "currently live on `dev`/`stg`/`beta`" (`:9-11`), tapi `…:41-43` mengakui
koordinat mereka "set by an earlier, separate process". Migrari 13 Sep 2026 memakai nilai, bukan slug,
karena "its `cemeteries` rows came from a different seeder and carry descriptive slugs (`tpu-bekasi-
jatiasih`, `tps-bogor-cimanggu`, …)" (`2026_09_13_100000_…:19-22`). Hasilnya tetap: **yang live adalah
yang fiktif.** Dan satu hal bisa dipastikan: `tpu-pondok-kelapa` **sengaja** tidak diberi peta
karena status operasinya masih kontradiktif antar sumber (`2026_08_24_100000_…:59-67`).

## 1.6 Pemetaan ke domain v1 (A untuk bentuk v1, B untuk pemetaan)

Bentuk v1 dari `src/domain/*/schema.ts` adalah fakta; **pemetaannya adalah inferensi saya** dan
perlu dikonfirmasi owner.

| Konsep v1 | Bentuk di v1 | Sumber lama | Verdict |
|---|---|---|---|
| **Lokasi Mitra** | `lokasi_mitra`: `name`, `pengelolaName`, `address`, `city` (text, mis. "Kota Jakarta Timur"), `pinLat`, `pinLng`, `status`, `facilities` jsonb, `facilitiesNote`, `policies`, `flags`, `jamOperasional`, `publishedAt` | `cemeteries`: `name`, `operator_name`→`pengelolaName`, `address`, `city` (kode→harus diubah ke teks), `latitude`/`longitude`→`pinLat`/`pinLng`, `facilities` | **Dipetakan**, dengan 3 koreksi wajib: (1) `city` bentuknya beda — kode vs teks; (2) `pengelola_name` **NOT NULL** di v1 sementara `operator_name` nullable di lama; (3) v1 butuh `facilities_note` dan `policies`/`flags` yang tidak ada di sama sekali |
| **Status Lokasi** | `lokasi_mitra.status` ∈ `belum_tayang, terverifikasi, ditangguhkan, berhenti` (`src/domain/lokasi/schema.ts:9`) | `cemeteries.publication_status` ∈ `draft, published, unpublished` | **TIDAK dipetakan.** Ini sumbu berbeda. `Belum Tayang` = onboarding belum tuntas; `draft` = belum dipublikasikan di direktori. Mengimpor `draft` → Lokasi Mitra tetap `belum_tayang` (hanya itu yang bisa di-set saat pembuatan, `src/domain/lokasi/index.ts:165`) |
| **Keterlihatan publik** | Hanya `status = 'terverifikasi'` yang tercantum (`src/domain/lokasi/public-reads.ts:100,106`) | `publication_status = 'published'` | **Ini blocker terbesar tiket 86.** Lokasi hasil impor akan `belum_tayang` dan **tidak akan terlihat sama sekali** di Daftar Lokasi. Publish gate butuh lima hal: perjanjian + scan, Kunjungan Verifikasi selesai, tarif diperiksa, Jam Operasional, Kontak Siaga (`src/domain/lokasi/publish-gate.ts:30-42`). Tidak ada satupun di sumber lama |
| **Jenis Makam** | `tariff_jenis_makam`: `lokasiId`, `name`, `nameKey`, `description` (`src/domain/tariffs/schema.ts:122-135`); harga di `tariff_jenis_makam_version`: `hargaHakPakai`, `tenureYears` (null = Selamanya), `hargaPerpanjangan` (`:143-166`) | `cemetery_packages`: `name` + `class_label`; harga indikatif `price_min`/`price_max` | **Dipetakan dengan kehati-hatian.** `name` + `class_label` → `name` (ctk. "Makam Tumpang Kelas A"). **Harga tidak boleh dipetakan langsung**: `price_min`/`price_max` adalah rentang indikatif tanpa tenure, tanpa Harga Perpanjangan, tanpa Biaya Layanan Platform — sedangkan v1 butuh `hargaHakPakai` + `tenureYears` + `hargaPerpanjangan` sebagai satu kesatuan. Dan karena 7 baris paket di beta tidak punya harga sama sekali, tidak ada yang bisa dipetakan |
| **Tarif** | `tariff_jenis_makam_version` (versi, `inForceFrom`, `seq`) + `tariff_biaya_pemakaman_version` + `tariff_global_version` (`src/domain/tariffs/schema.ts:62,97,143`) | `cemetery_packages.price_*` indikatif; `price_versions` (append-only, tapi untuk `ServiceDefinition`) | **Tidak ada yang dipetakan.** Untuk v1, `hargaHakPakai` all-in harus ≤ Rp 10.000.000 agar tidak disembunyikan (`src/domain/tariffs/public-pricing.ts:4-6`). Angka placeholder 3–13,5 juta sebagian besar **melewati** cap ini |
| **Denah / Blok** | `inventory_blok`: `lokasiId`, `name`, `nameKey`, `numberPattern`, `rows`, `cols`, `defaultJenisMakamId`, `photoFileKey` (`src/domain/inventory/schema.ts:17-37`) | `cemetery_blocks`: `code`, `name`, `capacity` | **Tidak dipetakan secara bermakna.** v1 Blok adalah **grid `rows × cols`** dengan penomoran dari pattern; lama adalah `capacity` + plot bulk. 2 blok / 9 plot di beta terlalu sedikit dan terlalu fiktif untuk jadi Denah yang bisa dipakai |
| **Petak Makam** | `inventory_petak`: `blokId`, `row`, `col`, `kind` (`petak|jalan|bukan_petak`), `nomorMakam`, `jenisMakamId`, `kavlingId`, `perluVerifikasi` (`src/domain/inventory/schema.ts:77-112`) | `grave_plots`: `slot`, `plot_state` | **Tidak dipetakan**, alasan sama: tanpa grid v1 tidak ada `row`/`col`, dan 9 baris fiktif tidak sebanding dengan 78 TPU nyata |
| **Kavling Keluarga** | `inventory_kavling`: `blokId`, `lokasiId`, `nomorKavling`, `jenisMakamId` — ≥ 2 petak bersebelahan dalam satu Blok (`src/domain/inventory/schema.ts:46-62`) | **tidak ada sama sekali** — grep `kavling` di `/home/ubuntu/makam-app/{app,resources,database,docs}` = 0 hit | **Konsep baru v1.** Tidak ada yang bisa diimpor |
| **Makam TPU** | Bukan Lokasi Mitra; TPU punya jenis, tampilan, dan entri sendiri | tidak ada padanannya di aplikasi lama (`cemetery_packages` bukan TPU) | **Tidak ada padanannya di aplikasi lama.** Lihat catatan benturan di bawah |

### Bentrokan scope yang harus diputuskan owner (B — inferensi)

Ada **dua tiket** yang ingin membuat Lokasi untuk beta, dari sumber yang berbeda:

- **Ticket 86** (`.scratch/…/86-…md:13`): buat Lokasi Mitra + tarif dari katalog aplikasi lama, ditandai
  beta/dummy.
- **Ticket 43** (`.scratch/…/43-…md:9,13`): "every DKI TPU with name, address, pin, data source and
  the 'menerima makam baru' flag … **there is no seed (test fixtures only)**", dan
  `.scratch/…/06-…md:15` melanjutkan: "every DKI TPU … **entered by Admin Platform**".

Keduanya tidak bisa benar kalau keduanya jalan, dan hanya satu yang sumbernya nyata
(dki-tpu-list, §1.6). Selain itu, catatan `index.md:213` ("Reference values are entered by Admin
Platform in the dashboard, never seeded") menetapkan bahwa prinsip repo adalah **tidak men-seed nilai
acuan** — yang membuat impor ticket 86 sendiri menyimpang dari prinsip itu. Kasus `seed-tagihan`
di `AGENTS.md` adalah pengecualian eksplisit untuk dev/e2e, jadi ada preseden, tapi tidak untuk
beta publik.

## 1.7 Yang tidak diketahui (C)

Tidak ada yang berikut yang bisa dijawab tanpa melihat `makam_beta` secara langsung (yang saya
tidak lakukan karena read-only dan tanpa akses DB):

1. **Jumlah baris dan isi persis** `cemetery_packages`, `cemetery_blocks`, `grave_plots`,
   `cemetery_capability_profiles`, `launch_cities` di `makam_beta`. Yang diketahui hanya
   `cemeteries` (10) dan `grave_records` (30) dari pengukuran 16 Sep 2026, plus
   `cemetery_blocks` (2) / `grave_plots` (9) dari catatan referensial.
2. **Apakah `makam_beta` punya baris yang tidak dari seeder.** Dev jelas punya (slug deskriptif
   `tpu-bekasi-jatiasih`, `tps-bogor-cimanggu` — `2026_09_13_100000_…:21`); apakah beta juga punya
   tidak tercatat.
3. **Apakah `price_min`/`price_max` di beta masih formula placeholder** atau sudah ada yang diubah
   manual. Seed menghasilkan `3.000.000 + i×500.000`; tidak ada catatan yang mengukur ulang.
4. **Apakah `cemetery_packages` di beta punya baris di luar 7 baris seed.** Dev dan beta bisa berbeda.
5. **Kontak / telepon / email** di `cemetery_visitation_policies` atau tabel lain yang menyatu
   dengan katalog — belum diperiksa, dan tidak boleh diimpor tanpa dicek.
6. **Siapa yang di-backup-rollback window 14 hari** dan apakah ada export yang lebih baru dari
   16–17 Sep 2026 (§1.5).

## 1.8 Checklist export untuk owner (langsung pakai)

Semua query berikut **read-only** dan harus dijalankan terhadap `makam_beta` **dari luar** (mis.
`psql` dengan user read-only, atau `docker exec … psql -c` — **jangan** `migrate`, `db:seed`,
`purge`, atau apalah yang menulis). Skema tetap tersedia sebagai referensi untuk
`CREATE TABLE` di `database/migrations/`.

### (a) WAJIB — inti katalog (whitelist, tanpa data pribadi)

```sql
-- 1. Lokasi (10 baris). Kolom yang diimpor hanya yang ditandai.
SELECT id, slug, type, name, city, address,
       latitude, longitude, google_maps_url,
       primary_photo_path, facilities,
       operator_name, publication_status, published_at, unpublished_at,
       plot_tracking_mode, demo_batch_id
FROM cemeteries ORDER BY slug;
--   -> v1: name, address, city(ubah kode ke teks), pinLat, pinLng,
--            facilities, PengelolaName(=operator_name), status(=belum_tayang)

-- 2. Penanda fiktif (wajib, jangan sampai hilang — ini satu-satunya bukti "belum tayang")
SELECT slug, name, address,
       (address LIKE 'Jl. Contoh%')                       AS alamat_fiktif,
       (name   LIKE '%(pemakaman contoh)%')                AS nama_bertanda,
       (name   LIKE '%Contoh%')                             AS nama_contain_contoh
FROM cemeteries ORDER BY slug;

-- 3. Harga indikatif (perhatian: SENGAJA tidak diimpor sebagai Tarif; ini untuk laporan saja)
SELECT slug, price_min, price_max, price_currency, price_source, price_effective_at
FROM cemeteries WHERE price_min IS NOT NULL OR price_max IS NOT NULL ORDER BY slug;
```

### (b) WAJIB — kandidat Jenis Makam (read-only; hasilnya boleh kosong)

```sql
-- 4. cemetery_packages: kandidat Jenis Makam. TIGA kolom harga ditambahkan 26 Aug 2026,
--    sehingga baris seed lama tidak punya harga sama sekali.
SELECT c.slug AS lokasi_slug, p.id, p.name, p.class_label,
       p.availability_status, p.is_active, p.sort_order,
       p.price_min, p.price_max, p.price_currency, p.price_source, p.price_effective_at
FROM cemetery_packages p JOIN cemeteries c ON c.id = p.cemetery_id
ORDER BY c.slug, p.sort_order, p.name;
--   -> v1: (name + ' ' + class_label) -> tariff_jenis_makam.name
--   -> harga: TIDAK dipetakan (lihat 1.6)

-- 5. capability profiles: hanya perlu bila ingin meniru setting inventory
SELECT c.slug, pr.version_number, pr.availability_mode, pr.booking_mode, pr.map_mode,
       pr.registry_mode, pr.certificate_mode, pr.visitation_mode, pr.source
FROM cemetery_capability_profiles pr JOIN cemeteries c ON c.id = pr.cemetery_id
WHERE pr.superseded_at IS NULL ORDER BY c.slug;

-- 6. kota: untuk memetakan kode -> teks "Kota/Kabupaten …" yang v1 butuh
SELECT code, label, is_active, sort_order FROM launch_cities ORDER BY sort_order;
```

### (c) OPSIONAL — inventaris, hanya untuk kepastian (kemungkinan besar tidak berguna)

```sql
-- 7. blok & petak: 2 blok / 9 petak, semuanya di cemetery fiktif (PurgeExampleDataCommand:286-290)
SELECT c.slug, b.code, b.name, b.capacity, b.is_active, (SELECT count(*) FROM grave_plots gp WHERE gp.block_id = b.id) AS n_plot
FROM cemetery_blocks b JOIN cemeteries c ON c.id = b.cemetery_id ORDER BY c.slug, b.code;
SELECT c.slug, b.code, g.slot, g.plot_state, g.cemetery_package_id
FROM grave_plots g JOIN cemetery_blocks b ON b.id = g.block_id JOIN cemeteries c ON c.id = b.cemetery_id
ORDER BY c.slug, b.code, g.slot;
--   -> v1: TIDAK dipetakan (lihat 1.6: tidak ada row/col, blok v1 butuh grid)

-- 8. foto: pastikan understanding, jangan mengimpor
SELECT slug, primary_photo_path, count(*) OVER () AS total FROM cemeteries;
-- 4 file stock untuk 10 baris, tidak ada yang menampilkan makam yang benar-benar itu
-- (2026_09_08_100000_...:31-34)
```

### (d) TIDAK BOLEH diimpor (whitelist negative — untuk provenance, jangan diekspor ke file manapun)

Sesuai `.scratch/…/86-…md:14` dan ADR 0002 `:54`. Kalau owner butuh **rekam jejak** bahwa data ini
tidak diimpor, cukup ambil **counts** saja:

```sql
-- 9. Hanya ANGKA. Jangan ambil isi tabel personal ke mana pun.
SELECT 'users' t, count(*) FROM users
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'order_parties', count(*) FROM order_parties
UNION ALL SELECT 'deceased_profiles', count(*) FROM deceased_profiles
UNION ALL SELECT 'booking_drafts', count(*) FROM booking_drafts
UNION ALL SELECT 'payment_sessions', count(*) FROM payment_sessions
UNION ALL SELECT 'payment_intents', count(*) FROM payment_intents
UNION ALL SELECT 'payment_verifications', count(*) FROM payment_verifications
UNION ALL SELECT 'grave_records', count(*) FROM grave_records
UNION ALL SELECT 'renewals', count(*) FROM renewals
UNION ALL SELECT 'certificates', count(*) FROM certificates
UNION ALL SELECT 'documents', count(*) FROM documents;
--  Kolom yang ber-PII di tabel itu (jika owner perlu alasan): order_parties.full_name /
--  contact_phone / contact_email / address (…:70-73), deceased_profiles.full_name /
--  date_of_birth / date_of_death (…:59-61), users.email (…:17).
```

### (e) Yang perlu dikonfirmasi owner sebelum export

1. **Apakah katalog fiktif tetap diimpor, mengingat isinya 100 % placeholder?** Kalau jawabannya
   ya, beta akan menampilkan "TPU Jakarta 1" s/d "TPU Jakarta 10" dengan alamat `Jl. Contoh` — dan
   pengujian UAT akan berjalan di atas data yang jelas-jelas bukan data asli. Kalau jawabannya
   tidak, ticket 86 perlu di-rescope ke `dki-tpu-list.csv` (§1.6) dan kehilangan alasan keberadaannya
   sebagai "impor dari aplikasi lama".
2. **Apakah 9 `published` + 1 `draft` dipetakan ke 9 `terverifikasi` + 1 `belum_tayang`?** Kalau ya,
   perlu decided Substitution: `terverifikasi` berarti lolos publish gate, dan gate itu butuh
   perjanjian bertanda tangan, Kunjungan Verifikasi dengan foto, tarif diperiksa, Jam Operasional,
   dan Kontak Siaga (semuanya tidak ada di sumber).
3. **Siapa yang meng-approve bahwa foto stock boleh dipakai di beta publik** di halaman yang
   menampilkan nama makam nyata (bila pilihan (b) yang diambil). Foto di sumber lama secara eksplisit
   **bukan** foto makamnya.

---

# Q2 — Apakah data aplikasi lama harus dipindahkan atau diarsipkan

Ini "Could not place" butir 2: `.scratch/makam-v1-build/issues/00-index.md:178`.

## 2.1 Bukti yang dikumpulkan (A)

**Sumber otoritatif (spec, ADR, index, tiket) — semuanya menyatakan pertanyaan ini masih terbuka:**

| Sumber | Kutipan |
|---|---|
| `.scratch/makam-v1/spec.md:714` | "**Cutover** from the frozen Laravel app on `makam.co.id` is no longer deferred … **Before the switch, the Operator must answer** whether any data from the old app (users, orders, Lokasi, payments) is carried over or archived." |
| `.scratch/makam-v1/map.md:60` | "**Whether any data from the old app (users, orders, Lokasi, payments) must be carried over or archived is still open** and must be decided before that deploy." |
| `.scratch/makam-v1-build/issues/00-index.md:178` | "**Still open**, and must be answered before the switch: must any data from the old app (users, orders, Lokasi, payments) be carried over or archived?" |
| `.scratch/makam-v1-build/issues/65-production-switch-makam-co-id.md:13` | AC pertama tiket 65: "**Open question answered before the switch** … The Operator's answer, and any carry-over or archive done, is recorded in `## Comments`" |
| `docs/adr/0002-…:8, 35` | Switch adalah langkah satu kali yang digate manusia, di luar pipeline |

**Bukti yang menjawab sebagian besar pertanyaan (keputusan owner 2026-09-26, masuk lewat commit
`b50a005`):**

| Temuan | Kutipan |
|---|---|
| Old app **tidak pernah menerima uang nyata**. Satu-satunya payment session adalah `sumopod-sandbox`, tidak pernah dibayar | `docs/adr/0002-…:60` (koreksi eksplisit atas kalimat `:54` yang sebelumnya terlalu-lebih); `.scratch/…/65-…md:25` |
| Yang dipindahkan ke v1 **hanya katalog non-personal**: nama, alamat, koordinat, foto, harga — **"never people, orders, payments or phone numbers"** | `docs/adr/0002-…:54`; `.scratch/…/86-…md:14` |
| Users aplikasi lama "mostly `example.test` plus team accounts"; 1 akun Gmail tak dikenal + ~22 kontak order bernomor realistis "probably team test entries (**owner to confirm**)" | `.scratch/…/65-…md:25` |
| **Rencana pembersihan 3 tahap sudah disetujui owner**, dan Stage 3 adalah: "**optionally** an encrypted dump of users/orders (**skip if the owner confirms they are all tests**), then remove the `makam-nonprod-*` containers, volumes and the `makam-app` image, `/home/ubuntu/makam-app`, `/opt/makam-notify`, the nginx backup blocks, and archive the `makam-app` GitHub repo" — dijadwalkan "**after ticket 86 and the switch + 14 days of rollback window**" | `.scratch/…/65-…md:25` |
| Beta "holds no real personal or payment data (dummy content, SumoPod sandbox, ticket 86's read-only catalog import), so losing the host loses the beta's data — **an accepted risk for the beta only**" | `docs/ops/runbook.md:421-423`; `docs/adr/0002-…:57` |
| Ticket 86 AC: import "**never** reads or copies users, orders, payments, phone numbers, emails, documents or any personal data" | `.scratch/…/86-…md:14` |
| Webhook SumoPod untuk event yang tidak cocok dengan Tagihan v1 (ctk. payment aplikasi lama) **di-ack 2xx lalu diabaikan** — sudah selesai di ticket 61 | `.scratch/…/61-…md:18` |
| Rollback switch teruji dan terdokumentasi (untuk `dev.makam.co.id`, pola yang sama dipakai untuk apex) | `docs/ops/runbook.md:612-655`; `.scratch/…/07-…md:35` |
| Beta tetap SumoPod **sandbox**; ini menutup pertanyaan "payment lama yang masih terbuka" | `.scratch/…/65-…md:24`; `docs/adr/0002-…:54` |

**Tidak ada satu pun dokumen di repo yang menyuruh memindahkan users, orders, atau payments, dan
tidak ada satu pun yang menyuruh mengarsipkannya secara wajib.** Yang ada adalah "belum
dijawab" (§2.1).

## 2.2 Kesimpulan (B — inferensi, dengan dasar)

**Status: tentatively resolved.** Yaitu: inti pertanyaannya sudah terjawab oleh keputusan owner
2026-09-26, tapi dua sub-pertanyaan kecil masih harus dijawab secara eksplisit sebelum switch, dan
tiket 65 mensyaratkan jawaban itu ditulis di `## Comments`.

Rincian per-kategori, dengan alasan:

| Kategori | Kesimpulan | Dasar |
|---|---|---|
| **payments** | **Tidak dipindahkan, tidak perlu diarsipkan.** Tidak ada yang perlu dipindahkan karena tidak pernah ada pembayaran nyata. Satu-satunya sesi adalah `sumopod-sandbox`, tidak pernah dibayar. | §2.1 (ADR `:60`, tiket 65 `:25`) |
| **users** | **Tidak dipindahkan.** Akun aplikasi lama tidak punya arti di v1: v1 memakai **email sebagai kunci akun** (ADR 0004), dan email aplikasi lama didominasi `example.test`. Membuat Akun v1 dari user lama berarti memindahkan PII tanpa kebutuhan. | §2.1 + `.scratch/…/82-email-is-the-akun-key.md` |
| **orders** | **Tidak dipindahkan.** Model order v1 berbeda total (Pemesanan Saat Duka / Terencana, Tagihan, Hak Pakai) dan tidak ada jalur transformasi. Satu-satunya keputusan eksplisit di ticket 86: jangan. | §2.1, tiket 86 `:14` |
| **Lokasi** | **Dipindahkan, tapi hanya sebagai data dummy beta** — dan hanya katalog non-personal. Ini satu-satunya "carry-over" yang disetujui. | §2.1 (ADR `:54`, tiket 86) |
| **arsip** | **Opsional, diputuskan owner, default-nya "skip".** Tidak ada kewajiban retensi yang berasal dari dalam repo: satu-satunya alasan membuat dump adalah sebagai safety net bila ternyata ada PII yang belum dikonfirmasi owner. Tidak ada kewajiban UU PDP atau pencatatan yang disebut di mana pun. | §2.1 (tiket 65 `:25`) |

**Dua hal yang masih harus dijawab owner (mengapa ini bukan "open penuh"):**

1. Konfirmasi bahwa ~22 kontak order + 1 akun Gmail memang akun tim. Bila ya → dump Stage 3
   **dilewati** dan seluruh data aplikasi lama boleh dihapus setelah jendela rollback 14 hari.
2. Keputusan atas kata "**optionally**" di Stage 3: dump terenkripsi users/orders dibuat atau tidak.
   Rekomendasi saya: **jangan** — argumennya sudah tertulis di `.scratch/…/65-…md:25` sendiri
   ("skip if the owner confirms they are all tests"), dan data itu secara faktual tidak bernilai
   (order fiktif, tanpa pembayaran).

**Satu konsekuensi yang harus dicatat eksplisit** (B): kalau ini diputuskan "tidak ada yang
dipindahkan selain katalog", maka setelah Stage 3 `/home/ubuntu/makam-app` dihapus, **skema katalog
yang di Bagian 1.2 satu-satunya-satunya salinan**. Jadi atau cari salinannya sekarang (ke dalam
dokumen repositori, seperti yang saya lakukan di sini), atau benar-benar diekspor yang hanya
dibutuhkan (Bagian 1.8) sebelum app dihapus.

## 2.3 Yang harus ditulis ke `## Comments` tiket 65 (draft, berbasis bukti)

- Ringkas jawaban carry-over per kategori (tabel 2.2).
- Tulis bahwa katalog saja yang dipindah, dan bahwa isinya 100 % placeholder sehingga yang harus
  diputuskan adalah apakah beta memakai data fiktif atau `dki-tpu-list` (lihat 2.4 butir 3).
- Konfirmasi gate manusia: tidak ada payment aplikasi lama yang terbuka saat switch (sudah
  terpenuhi menurut `docs/adr/0002-…:60`, tapi operator tetap harus mengesahkannya secara
  eksplisit di `## Comments`).
- Catat tanggal keputusan dump Stage 3 (buat / lewati) + alasan.

## 2.4 Pertanyaan spesifik untuk owner (kalau masih open)

1. **~22 order contacts + 1 akun Gmail:** apakah semuanya akun tim? (Bukti: `.scratch/…/65-…md:25`
   — "owner to confirm". Tanpa ini, dump Stage 3 tidak bisa diputuskan.)
2. **Dump Stage 3:** buat atau lewati? Saya rekomendasikan **lewati** bila butir 1 "ya".
3. **Bentrokan 86 vs 43 (§1.6):** beta UAT mau Lokasi dari (a) katalog aplikasi lama — yang
   100 % fiktif, atau (b) 78 TPU nyata dari `research/dki-tpu-list.csv`? Keduanya tidak bisa
   jalan, dan hanya (b) yang memenuhi tujuan "testers see real-looking Lokasi" di
   `.scratch/…/86-…md:9`. Ini keputusan domain, bukan teknis.
4. **Kalau pilih (a):** apakah 9 baris `published` dipromosikan ke `terverifikasi` (agar terlihat
   publik), padahal tidak ada satu pun dari lima butir publish gate yang terpenuhi
   (`src/domain/lokasi/publish-gate.ts:30-42`)? Kalau tidak, impor tidak menghasilkan apa pun yang
   terlihat, dan AC 86 baris 13 perlu ditulis ulang.
5. **Tagihan backup:** adakah kewajiban retensi (PPID/UU PDP, arsip pajak, atau ketentuan vendor
   SumoPod) yang membuat penghapusan data aplikasi lama setelah Stage 3 tidak boleh? Tidak ada
   satu pun yang disebut di repo — perlu konfirmasi bahwa memang tidak ada.

---

# Metode dan batasan

- **Read-only, tanpa efek samping.** Tidak menulis kode aplikasi, tidak menjalankan migrasi/
  seeder, tidak menyentuh database, tidak menjalankan Docker, tidak menyentuh container milik
  repo lain. Hanya `read`/`grep`/`git log`/`git show` pada `/home/ubuntu/makam` dan
  `/home/ubuntu/makam-app`.
- **Tidak ada akses ke `makam_beta`.** Semua angka tentang isi database berasal dari **catatan
  pengukuran di dalam repo aplikasi lama** (16 Sep 2026, 14 Sep 2026, 17 Sep 2026), bukan dari
  query yang saya jalankan. Bagian 1.8 karena itu adalah checklist export, bukan hasil export.
- **Sumber utama (primary sources), sesuai urutan:** migrasi & domain class di
  `/home/ubuntu/makam-app` → dokumen repo v1 (spec, ADR, runbook, tiket) → git history v1.
- **Tidak ada webfetch ke URL eksternal.** Sumber primer eksternal untuk TPU DKI sudah ada di repo
  v1 sebagai hasil riset sebelumnya (`.scratch/makam-v1-build/research/dki-tpu-list.md`), jadi
  saya merujuk file itu alih-alih mengambil ulang.
- **Yang berubah setelah 17 Sep 2026 tidak tertangkap.** Pengukuran tertua adalah 16–17 Sep 2026;
  jika ada aktivitas katalog setelah itu (mis. purge manual), angka 1.5 bisa stale.
