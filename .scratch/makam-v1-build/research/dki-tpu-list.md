# DKI Jakarta TPU list (Pemprov-run public cemeteries) for makam.co.id v1

Researched 2026-09-25. Companion data file: [dki-tpu-list.csv](dki-tpu-list.csv) (78 rows).

This builds on [../../makam-v1/research/dki-tpu-burial-sequence.md](../../makam-v1/research/dki-tpu-burial-sequence.md) §2 (the Distamhut availability page, "69 of 80 full") and [../../makam-v1/research/cemetery-plot-regulation.md](../../makam-v1/research/cemetery-plot-regulation.md). It does not repeat that material.

**Bottom line**

- **78 TPU** are on Distamhut's own current list: Jakarta Pusat 4, Jakarta Utara 9, Jakarta Barat 12, Jakarta Selatan 17, Jakarta Timur 31, Kepulauan Seribu 5.
- The Kadis Distamhut has given other totals: **80** TPU "di 5 wilayah" in Oct 2025, which excludes Kepulauan Seribu, and **82** in Mar 2026. The gap is probably counting: Distamhut merges some sites into one row ("Tanah Kusir I/II", "Kampung Rambutan I/II", "Cibubur I/II", "Kampung Baru & Cipinang Baru"), and a few names in the news are missing from the page (see §5). **No official enumerated list of 80 or 82 was found.**
- **Coordinates:** an official Distamhut point layer exists on the Pemprov GIS portal, Jakarta Satu. It supplied coordinates for 72 of the 78 rows. 3 more come from OpenStreetMap map search, and 3 have none.
- **Status:**

  | menerima_makam_baru | Rows |
  |---|---|
  | ya | 18 |
  | tidak (tumpang only) | 50 |
  | unknown | 10 |

  "ya" often means only a few petak, or only a non-Muslim unit (see §3).

## Sources

| Key | Source | Kind | Freshness | Used for |
|---|---|---|---|---|
| **AV** | Distamhut, "Ketersediaan Petak Makam", [distamhut.jakarta.go.id/ketersediaan-perpetakan](https://distamhut.jakarta.go.id/ketersediaan-perpetakan) | Primary (official live page) | Read 2026-09-25. The page shows no "last updated" date | **The master list of names**, free-petak counts per TPU/unit/blok/blad, and staff contacts |
| **GIS** | Jakarta Satu (Pemprov DKI geoportal), ArcGIS feature layer `Hosted/Titik_Lokasi_Pemakaman/FeatureServer/0`, owner "operasional", tags Pemakaman / Struktur Ruang. Portal item `634ad859d3fd4d96bb0d626e1981c472`, used in the web map "Persebaran Lokasi Tempat Pemakaman Umum di DKI Jakarta (Dummy)" and a dashboard of the same name, both tagged *Dinas Pertamanan dan Hutan Kota*. Query: `https://jakartasatu.jakarta.go.id/server/rest/services/Hosted/Titik_Lokasi_Pemakaman/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json` | Primary (official dataset), but of draft quality (see caveats) | Created and last modified 2024-06-23 | **Coordinates** (86 points, only `fid` and `name` fields) |
| **ADM** | Jakarta Satu, `Hosted/Batas_Administrasi_DKI_Jakarta/FeatureServer/1` (Batas Kelurahan). Each GIS point was intersected with it | Primary (official boundaries) | Current | **Kelurahan, kecamatan and kota** in the address, plus a cross-check of each row's kota |
| **OSM** | OpenStreetMap: Nominatim reverse geocoding of each GIS point (street name) and an Overpass query of `landuse=cemetery` / `amenity=grave_yard` in DKI (name matching, and coordinates where GIS has none) | Secondary, crowd-sourced | Read 2026-09-25 | The **street** part of the address; coordinates for 3 rows; sanity checks |
| **D25** | detikNews, "69 dari 80 TPU di Jakarta Sudah Penuh…", 22 Oct 2025, [link](https://news.detik.com/berita/d-8173196/69-dari-80-tpu-di-jakarta-sudah-penuh-hanya-menerima-makam-tumpang). Quotes Kadis Distamhut Fajar Sauri | Official-quoted news | 2025-10-22 | The 11 TPU with remaining capacity: Rawa Terate, Cipayung, Cilangkap, Bambu Apus, Cipinang Besar, Rorotan, Tanah Kusir, Srengseng Sawah, Kampung Kandang, Tegal Alur, Pegadungan. About 118,348 petak in total |
| **JS** | detikNews/Antara, "Lahan Penuh, 9 TPU di Jaksel Tak Lagi Terima Makam Baru", 20 Oct 2025, [link](https://news.detik.com/berita/d-8169575/lahan-penuh-9-tpu-di-jaksel-tak-lagi-terima-makam-baru). Quotes Arwin Adlin Barus, Kasie Jalur & Pemakaman, Sudin Tamhut Jaksel | Official-quoted news | 2025-10-20 | 9 full: Tanjung Barat, Jagakarsa, Kampung Kongsi, Grogol Selatan, Kebagusan, Pisangan, Pejaten Timur, Pejaten Barat, Cikoko. 9 at >95% using tumpang: Menteng Pulo I/II/III, Jeruk Purut, Tanah Kusir, Cidodol, Kampung Kandang, Srengseng Sawah, Pasar Minggu. Says Jaksel has 16 TPU |
| **JP** | Kompas, "Krisis Pemakaman di Jakpus: Tiga Sudah Penuh Total…", 24 Jun 2026, [link](https://megapolitan.kompas.com/read/2026/06/24/16184091/krisis-pemakaman-di-jakpus-tiga-sudah-penuh-total-satu-lagi-mulai). Quotes Mila Ananda, Kasudin Tamhut Jakpus | Official-quoted news | 2026-06-24 | Jakpus has 4 TPU. Karet Bivak, Pasar Baru Barat and Kawi-Kawi are full (tumpang only). Petamburan (non-Muslim) has limited space left |
| **JB** | Pemkot Jakarta Barat, "Sebelas TPU di Jakbar Terapkan Sistem Makam Tumpang", 23 Oct 2025, [barat.jakarta.go.id](https://barat.jakarta.go.id/berita/sebelas-tpu-di-jakbar-terapkan-sistem-makam-tumpang). Quotes Dirja Kusuma, Kasudin Tamhut Jakbar | Official (Pemkot site) | 2025-10-23 | Tumpang at Tegal Alur ("unit Kristen masih menerima makam baru"), Utan Jati, Joglo, Kamal, Sukabumi Selatan, Grogol Kemanggisan, Duri Kepa, Kober, Semanan, Slipi and Tanah Merah |
| **JB2** | Kompas, "Lahan Penuh, 9 TPU di Jakbar Hanya Bisa Layani Pemakaman Tumpang", 25 Oct 2025, [link](https://megapolitan.kompas.com/read/2025/10/25/08235521/lahan-penuh-9-tpu-di-jakbar-hanya-bisa-layani-pemakaman-tumpang). Same official | Official-quoted news | 2025-10-25 (data as of 30 Sep 2025) | Tegal Alur still takes new burials: 1,250 Islam and 64 Kristen petak ready, about 57,878 / 3,814 including undeveloped land. Rawa Kopi, Semanan, Kapuk and Grogol Kemanggisan are tumpang only |
| **MP** | Antara, "Distamhut DKI tambah 1.300 makam di TPU Menteng Pulo 2 usai relokasi", [link](https://www.antaranews.com/berita/5281661/distamhut-dki-tambah-1300-makam-di-tpu-menteng-pulo-2-usai-relokasi) | Official-quoted news | Late 2025 (residents to vacate by 4 Dec 2025) | 1,300 new petak planned at Menteng Pulo 2 |
| **WK/Akurat** | Akurat, 6 Mar 2026, [link](https://jakarta.akurat.co/kebon-sirih/838648/distamhut-dki-sediakan-layanan-pemakaman-gratis-dan-bebas-pungli-di-82-tpu-ini-syarat-dan-ketentuannya) | Official-quoted news | 2026-03-06 | The "82 TPU" total. The article gives no list |

**Could not be reached from this environment:**

- **satudata.jakarta.go.id** (every URL returns "URL YANG DIMINTA DI TOLAK"). This blocked two datasets. The first is "Data Pemakaman di Provinsi DKI Jakarta" (publisher Distamhut, dcat_issued 2023-10-03, mirrored on data.go.id and modified there 2026-09-03). Its export URLs are `https://satudata.jakarta.go.id/backend/restapi/v1/datasets/export/c60d1ef205dffc48f0109ad4674b3cfd/data-pemakaman-di-provinsi-dki-jakarta.csv` (and `.xlsx`). The second is the older "Data Tempat Pemakaman Umum (TPU) Tahun 2018" on data.jakarta.go.id (dataset `data-makam`). Its fields, from search snippets, are `nama_TPU, lokasi, kelurahan, kecamatan, kota, luas_pembebasan, konfirmasi, zona, keterangan`.
- **data.jakarta.go.id** (connection reset) and **pertamananpemakaman.jakarta.go.id** (connection refused).
- **katalog.data.go.id** (DNS failure).
- **Wartakota** (403).

**These two datasets are the most likely official source of street addresses** (`lokasi`) and possibly of the full 80/82 list. Someone with an Indonesian connection should download them.

## Method

1. **Names** were taken from AV, the only current, first-party, enumerated list. Where AV lists "TPU Cilangkap" twice (once with contacts, once with petak), it was merged into one row. Combined entries such as "Tanah Kusir I/II" were kept as one row, the way Distamhut presents them.
2. **Kota** is not shown on AV; the page is a flat list. It was assigned by (a) the ADM kota of the matched GIS point, and (b) the Sudin contact clusters on AV, since each kota's Sudin staff recur across its TPU (for example "Budi Hidayat, ST" for all of Jakpus, and "Sylvia, S.T." / "J. Siregar" for Jakut). Every row with a GIS point agreed with its ADM kota; the script checked this and found no mismatches. The resulting counts fit what officials have said: Jakpus 4 (JP says 4), Jaksel 17 (JS says 16 but names 18). The 3 rows without coordinates were placed by contact cluster alone (see §4).
3. **Coordinates** come from matching each AV name to a GIS point by name. Where the match needed judgement, `coord_source` says so. Where GIS had no usable point, the nearest OSM cemetery polygon of the same name was used, marked "from map search, needs verification".
4. **Address** = `[street from OSM], Kel. X, Kec. Y, Kota`. Kelurahan, kecamatan and kota come from the official boundary layer at the GIS point. **The street name comes from OSM reverse geocoding of that point and is the nearest road, not necessarily the TPU's postal address.** It is labelled "(street from OSM)" and omitted where OSM returned nothing useful. No official street address was obtained for any TPU (see the Sources caveat).
5. **Status** (`menerima_makam_baru`) followed these rules, in order:
   - **ya**: AV currently (2026-09-25) lists at least one free petak in any unit. `status_as_of` = 2026-09-25, source AV.
   - **unknown**: official sources conflict, or AV has no data and no official statement exists. This covers Srengseng Sawah, Pegadungan, Tegal Alur I, Menteng Pulo II, Petamburan and the 5 Kepulauan Seribu TPU.
   - **tidak**: an official has named the TPU as full or tumpang only (JS, JP, JB, JB2; `status_as_of` = that article's date). **Or**, for TPU never named individually, the TPU is not among the Kadis's 11 with capacity (D25) **and** AV shows no free petak. The second case is an **inference**. For those rows `status_as_of` = 2026-09-25 and the source is AV.

## 1. Per-field provenance and freshness (summary)

| Field | Source | Trust | As of |
|---|---|---|---|
| name | AV (Distamhut) | High (first-party) | 2026-09-25 |
| kota | ADM ∩ GIS, plus AV contact clusters | High where a GIS point exists | Boundaries current; GIS 2024-06-23 |
| address: kelurahan/kecamatan/kota | ADM at the GIS point | High for the point, but only as good as the point | as above |
| address: street | OSM reverse geocode | Low, needs verification | 2026-09-25 |
| lat/lng | GIS (72 rows) / OSM (3 rows) / none (3 rows) | GIS medium (layer from a "(Dummy)" web map; one known error), OSM low | GIS 2024-06-23 |
| menerima_makam_baru | AV (ya), officials in the news (tidak), inference (tidak*), conflicts (unknown) | Varies; see `status_as_of` and `source_url` per row | 2025-10-20 → 2026-09-25 |

## 2. The list

The full data is in the CSV. Summary by kota, with ✓ = ya, ✗ = tidak, ? = unknown:

- **Jakarta Pusat (4):** Karet Bivak ✗, Karet Pasar Baru Barat ("Karet PSBB" on AV) ✗, Kawi-Kawi ✗, Petamburan ?
- **Jakarta Utara (9):** Rorotan ✓, Malaka Ampat ✗, Jembatan Sampi ✗, Sarang Bango/Malaka I ✗, Tegal Kunir ✗, Plumpang ✗, Kampung Mangga ✗, Sungai Bambu ✗, Semper ✗
- **Jakarta Barat (12):** Tegal Alur I ?, Tegal Alur II ✓, Pegadungan ?, Utan Jati ✗, Kebon Jahe ✗, Semanan ✗, Sukabumi Selatan ✗, Kepa Duri ✗, Joglo ✗, Rawa Kopi ✗, Basmol ✗, Grogol Kemanggisan ✗
- **Jakarta Selatan (17):** Tanah Kusir I/II ✓, Kampung Kandang ✓, Jeruk Purut ✓, Pasar Minggu ✓, Srengseng Sawah ?, Menteng Pulo II ?, Menteng Pulo I ✗, Cidodol ✗, Jagakarsa ✗, Tanjung Barat ✗, Kampung Kongsi ✗, Grogol Selatan ✗, Kebagusan ✗, Pisangan ✗, Pejaten Timur ✗, Pejaten Barat ✗, Cikoko ✗
- **Jakarta Timur (31):**
  - ✓: Rawa Terate, Cipayung, Cilangkap, Bambu Apus, Cipinang Besar, Prumpung, Kober Jatinegara, Kampung Dukuh, Kampung Bayur, Munjul, Ceger, Cibubur I/II
  - ✗: Pondok Ranggon, Bantar Jati, Susukan Islam, Susukan Budha, Ciracas, Pondok Kelapa, Kampung Rambutan I/II, Kampung Gedong, Cipinang Asem, Kebon Pala, Cijantung, Kali Sari, Penggilingan, Kampung Penggilingan, Kampung Kapuk, Kampung Baru & Cipinang Baru, Utan Kayu (Kemiri), Malaka I (Pondok Kopi), Malaka II/Tanah Merah
- **Kepulauan Seribu (5):** Pulau Tidung ?, Pulau Lancang ?, Pulau Untung Jawa ?, Pulau Karya ?, Pulau Harapan/Kelapa ?

## 3. What "ya" means: free petak on AV, 2026-09-25

Counts were read off the live page, which has no date on it. One read differed from another by 3 petak (Pasar Minggu Kristen AI Blad001: 40 vs 37), so treat the numbers as approximate and live.

| TPU | Free petak (unit: blok/blad count) | Note |
|---|---|---|
| Tegal Alur II (Jakbar) | Islam AAII: ≈3,040 across Blad021–032 | By far the largest reserve |
| Rawa Terate (Jaktim) | Islam AII: 1,049 (Blad001–004) | |
| Kampung Kandang (Jaksel) | Islam AAI: 434; Kristen AAII: 15 | |
| Rorotan (Jakut) | Islam AAI: 195 (Blad061); Kristen AAI: 45 | Former COVID TPU |
| Cipayung (Jaktim) | Islam AAI: 209 | |
| Pasar Minggu (Jaksel) | Kristen: ≈164; Budha: 14 | **No Islam unit petak.** The Sudin calls it >95% full (JS) |
| Cipinang Besar (Jaktim) | Kristen AAII: 93 | **No Islam unit petak** |
| Kober Jatinegara (Jaktim) | Islam AII: 41 | Not in D25's 11 |
| Cilangkap (Jaktim) | Islam AII: 40 | |
| Tanah Kusir I/II (Jaksel) | Kristen: 28; Islam: 5 | |
| Kampung Dukuh (Jaktim) | Islam AII: 28 | Not in D25's 11 |
| Bambu Apus (Jaktim) | Islam AAI: 21 | |
| Prumpung (Jaktim) | Islam: 19 | Not in D25's 11 |
| Munjul (Jaktim) | Islam AII: 7 | Not in D25's 11 |
| Jeruk Purut (Jaksel) | Islam AAI: 5 | The Sudin says tumpang (JS) |
| Kampung Bayur (Jaktim) | Islam AII: 3 | |
| Ceger (Jaktim) | Islam AAI: 1 | |
| Cibubur I/II (Jaktim) | Islam AII: 1 | |

**Implications for Admin Platform:**

- "Accepts new graves" should really be tracked **per religious unit**, and it changes daily. A TPU with 1 petak is "ya" today and "tidak" tomorrow.
- Several TPU that the Oct 2025 statements called full now show a handful of petak: Jeruk Purut, Kober Jatinegara, Prumpung, Kampung Dukuh, Munjul, Ceger, Cibubur and Kampung Bayur. These are probably petak reclaimed from lapsed IPTM (see the earlier research: "Makam tanpa IPTM yang aktif dapat ditumpang…").
- The CSV's single ya/tidak flag is a snapshot. The platform should link to AV, or re-check it, rather than trust a stored flag.

**The "unknown" rows:**

- **Srengseng Sawah, Pegadungan:** named by the Kadis in Oct 2025 as having capacity (D25), but AV shows no petak today. JS (Oct 2025) says Srengseng Sawah is >95% full and on tumpang.
- **Tegal Alur I:** Sudin Jakbar said the Kristen unit still takes new burials (JB, JB2: 64 Kristen petak). AV shows petak only under "Tegal Alur II", and only Islam. It is not clear which of I/II holds the Kristen unit.
- **Menteng Pulo II:** 1,300 new petak were planned after the Dec 2025 relocation (MP), but AV shows none.
- **Petamburan:** "masih memiliki ruang tersisa meski semakin terbatas" for non-Muslim burials (JP, Jun 2026), but AV shows no petak.
- **Kepulauan Seribu (5):** outside the "80 TPU di 5 wilayah" statements, and AV lists them with no contacts or petak. The news (DPRD, Antara Jul 2026, beritapulauseribu) says the island TPU are insufficient, with rebuilding at Pulau Karya and Pulau Tidung in 2025. No official status was found.

## 4. Coordinate caveats (read before importing)

- **The GIS layer is draft quality.** The web map that uses it is titled "(Dummy)". It has 86 points and only a `name` field:
  - 12 points are **unnamed**;
  - one point is **Ereveld Ancol**, the Dutch war cemetery, which is not a TPU (unnamed fid 79 matches OSM "Ereveld Ancol" at 16 m);
  - one point lies **outside the DKI boundary** (fid 81, near Pondok Labu / the Depok border).
- **Known error:** the point labelled "Tpu Cipinang Besar" (fid 23) has exactly the same coordinates as "Tpu Prumpung Cipinang" (fid 52). The CSV uses unnamed fid 80 for Cipinang Besar instead, because it sits 160 m from OSM "TPU Cipinang Besar" (Jl. Kebon Nanas).
- **Joglo:** the layer's "Tpu Joglo 2 Swadarma" falls in Kel. Petukangan Utara, **Jakarta Selatan**. The CSV uses OSM "TPU Joglo" instead (Kel. Srengseng, Kembangan, Jakarta Barat), marked "map search". Joglo may have two sites.
- **Karet PSBB:** matched to the layer's "Tpu Karet Tengsin" because it lies on Jl. Karet Pasar Baru Barat. PSBB is read here as Pasar Baru Barat, and JP names "TPU Pasar Baru Barat" among Jakpus's 4. This is an interpretation.
- **Tegal Alur I vs II:** the two layer points ("Tpu Tegal Alur" in Kel. Kamal and "Tpu Tegal Alur Islam" in Kel. Tegal Alur) were assigned to I and II by guess.
- **Pisangan:** OSM labels the same spot "TPU wakaf ragunan". This needs a field check.
- **Map search, needs verification:** Malaka Ampat (OSM "TPU Malaka IV"), Joglo, and **Rawa Terate**. Rawa Terate is **low confidence**: neither GIS nor OSM has a "TPU Rawa Terate". The coordinates used are those of OSM "TPU Kober Cantang" inside Kel. Rawa Terate, Cakung. Because Rawa Terate is one of the biggest remaining reserves, verify it first.
- **No coordinates:** Pegadungan, Kebon Jahe, Kampung Bayur. Their kota comes from the AV contact clusters alone:
  - Pegadungan and Kebon Jahe share Jakbar Sudin staff. Pegadungan is also a Jakbar kelurahan (Kalideres), and D25 lists it under Jakarta Barat.
  - Kampung Bayur shares contact Halim Fatrah with Kober Jatinegara, Cipinang Besar and Prumpung (Jaktim). **Kampung Bayur's kota is the least certain.**
  - OSM's "TPU Islam Utan Jati" is inside Kel. Pegadungan, so Pegadungan may be the same complex as, or adjacent to, Utan Jati.
- **Unnamed GIS points that may be missing TPU:**

  | fid | Location | Coordinates |
  |---|---|---|
  | 75, 78 | Meruya Selatan, Kembangan, Jakbar | -6.2132,106.7218 / -6.2101,106.7432 |
  | 76, 77 | Joglo, Kembangan, Jakbar | -6.2168,106.7256 / -6.2168,106.7404 |
  | 82, 83 | Cilandak Barat, Jaksel | -6.2999,106.7874 / -6.2886,106.7876 |
  | 84 | Lebak Bulus, Jaksel | -6.2925,106.7704 |
  | 85 | Gandaria Selatan, Jaksel | -6.2695,106.7930 |
  | 86 | Cipedak, Jaksel | -6.3456,106.8055 |

  Kebon Jahe could be one of 75–78. Several of the Jaksel points coincide with OSM *wakaf* cemeteries (fid 82 is 26 m from "Makam Wakaf Cilandak Barat", fid 84 is 17 m from "Taman Makam RW 02"), so they may not be Pemprov TPU at all.

## 5. Names in official statements that are not on AV (not in the CSV)

Keep these as candidates for Admin Platform to confirm or reject:

| Name | Where it appears | Likely explanation |
|---|---|---|
| TPU Karet Tengsin | GIS fid 31 | Probably = Karet PSBB (used as its point) |
| TPU Kramat Jati (Kramatjati) | GIS fid 37 (Kel. Kampung Tengah, Kramat Jati, Jaktim); a community site (rw010bonpal.com) | A real TPU missing from AV, or an alias |
| TPU Cilangkap II | OSM | Probably merged into AV's "Cilangkap" |
| TPU Menteng Pulo III | JS | Not on AV; may be merged into Menteng Pulo I/II |
| Kamal, Kober, Slipi, Tanah Merah (Jakbar) | JB (Sudin Jakbar, official) | Not on AV under these names. "Kamal" may be the Tegal Alur site in Kel. Kamal; "Tanah Merah" may be confused with Jaktim's Malaka II/Tanah Merah. **Needs clarification from Sudin Jakbar** |
| Kapuk (Jakbar) | JB2 | AV's "Kampung Kapuk" is in Klender, Jaktim. A Jakbar Kapuk (Cengkareng) TPU is not on AV |
| Pondok Kopi | CNA, Oct 2025 | Probably Malaka I / Pondok Kelapa, which are in Kel. Pondok Kopi |

JS says Jaksel has 16 TPU; AV gives 17. JB says Jakbar has 11 on tumpang plus Tegal Alur, and JB2 counts "9". Official counts per kota do not reconcile exactly with AV.

## 6. Gaps

1. **No official street addresses.** The datasets that probably hold them (Satu Data "Data Pemakaman di Provinsi DKI Jakarta", data.jakarta.go.id "data-makam" 2018) are blocked from outside Indonesia. **Next step: download the CSV from an Indonesian IP** (the export URL is under Sources). That may also settle the 80/82 total and the kota of the 3 unplaced rows.
2. **The 80 vs 82 vs 78 count** is unresolved. No enumerated official list of 80 or 82 was found.
3. **Coordinates:** 3 rows have none. 3 are from map search (Rawa Terate at low confidence). The official layer has known errors and 12 unnamed points.
4. **Status is a snapshot.** AV changes daily and has no timestamp. The "tidak" rows for TPU never named by an official rest on inference. Religious-unit granularity is lost in the CSV.
5. **Kepulauan Seribu:** no status at all. It is also unclear whether v1 should serve it at all, since it needs sea transport.
6. **Whether each TPU is Pemprov-owned**, as opposed to a TPBU or wakaf site, was not checked from a registry. It is assumed because AV lists it and Distamhut staff run it.
