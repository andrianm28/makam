# Lokasi terverifikasi and published tariffs

Type: grilling
Status: resolved
Map: ../map.md

## Question

The brief promises "lokasi terverifikasi" and "harga transparan" as trust elements from the homepage onward. What does "terverifikasi" mean for a Lokasi Mitra (signed agreement with the Operator, site visit by a Petugas Lapangan, plots imported and checked) and for a DKI TPU (listed from official Pemda data)? Is it a badge on the Lokasi card and page, and can it be lost? Does the Lokasi page publish the full tariff list (Harga Hak Pakai per Jenis Makam, Biaya Pemakaman, Perpanjangan per term, Layanan prices, Pembatalan policy) before anyone starts a booking, and for TPU the official retribusi plus the Operator's Pengurusan fee? What other trust cues appear (photos, facilities, number of orders served, contact of the pengelola)?

Context from "Booking flow prototype for a Lokasi Mitra": prices in the booking flow are all-in totals incl. Biaya Layanan Platform with the parts in small print. From "Operator entity": no YIEM / yayasan framing; brand "Makam.co.id", footer "dikelola oleh PT Jaya Korpora Prima".

## Answer

Resolved by grilling on 2026-09-25; every recommendation was accepted.

**"Terverifikasi" for a Lokasi Mitra is a publish gate, not a badge**

- A Lokasi Mitra is listed only after all of these: a signed agreement with the Operator, a **Kunjungan Verifikasi** by a Petugas Lapangan (address and map pin confirmed, photos taken, facilities checked), and its Jenis Makam and tariffs entered and checked by Admin Platform. So every listed Lokasi Mitra is Terverifikasi. No listing is ever shown as unverified, and there is no badge tier.
- The plot import is **not** part of the gate. Saat Duka orders are made by Jenis Makam, so a Lokasi can go live while its imported Hak Pakai are still `Perlu Verifikasi`.
- The Lokasi page shows one line: "Terverifikasi Makam.co.id · dikunjungi <bulan tahun>", with a "what we checked" popover.

**Terencana plot-map booking switches on separately**

- A per-Lokasi switch, "Pemesanan Terencana aktif", is set by Admin Platform once (1) no Petak Makam in the blocks offered for sale is still `Perlu Verifikasi`, and (2) a Petugas Lapangan has spot-checked that the plot map matches the ground.
- Until then the Lokasi page hides the Terencana entry point and shows "Pemesanan terencana segera tersedia".

**TPU: an official cemetery, not "terverifikasi"**

- Every DKI TPU is listed (tumpang works at all of them), labelled "TPU resmi Pemprov DKI Jakarta", with the data source and "Status penerimaan makam baru diperbarui <tanggal>" (the date Admin Platform last set the flag).
- The word "terverifikasi" is never used for a TPU, since the Operator checks nothing there.

**Losing it: Ditangguhkan and Berhenti**

- **Ditangguhkan** (set by Admin Platform, e.g. repeated Keluhan, a failed revisit, a dispute): off lists and search. The page URL stays up with "sementara tidak menerima pesanan". No new Pemesanan Makam. Perpanjangan and Layanan for existing Pemegang Hak keep working. Admin Platform can reinstate it.
- **Berhenti** (agreement ended): the same, plus Perpanjangan and Layanan stop. Existing Hak Pakai stay visible read-only in Akun Saya with the pengelola's contact. Notification, record export and held Pencairan follow "If the Lokasi Mitra partnership ends" in [Pemesanan Terencana contract terms](./17-terencana-contract-terms.md).
- No scheduled revisits in v1. Admin Platform can order a Kunjungan Verifikasi at any time, and it updates the "dikunjungi" date.

**Published tariffs: "harga transparan" = the price on the page is the price on the Tagihan**

- **Lokasi Mitra page**, public and with no login: Harga Hak Pakai per Jenis Makam with its tenure (perpetual / N years), Biaya Pemakaman (and the tumpang amount if different), Perpanjangan price per term for fixed-term Jenis Makam, the Layanan offered there with prices, the Pembatalan policy (Masa Pembatalan and the later %) in plain language, and the document checklist. Every amount is shown as the all-in total including Biaya Layanan Platform, with the parts in small print, as in the booking flow. A line reads "Harga berlaku sejak <tanggal>".
- **TPU pages**: each shows the same short price box (retribusi IPTM Rp 0, "gratis sejak Perda DKI 1/2024"; the Operator's Pengurusan fee labelled as a service fee; "lihat harga Layanan"), plus a link to one shared **"Pengurusan di TPU DKI"** page holding the free DIY guide and the DKI-wide Layanan price list. Nothing varies per TPU.

**Tariff changes**

- Only Admin Platform enters a change, per the agreement, with an **effective date** that may be in the future. The page shows "Harga baru mulai <tanggal>" once a change is scheduled.
- An issued Tagihan keeps its price. A recurring Paket Layanan takes the new price from the next cycle, and the H-7 cycle invoice message mentions the change. Biaya Pemakaman and Perpanjangan use the rate on the day (already settled).
- Old tariffs are kept as versions, never deleted, so any past Tagihan can be explained.

**Pengelola and contact**

- The pengelola's **name** is public ("Dikelola oleh Yayasan X / PT Y"), since it is the counterparty on the Bukti Pemesanan.
- Before booking, contact goes only to the Operator's CS WhatsApp. The pengelola's on-site contact appears on the Konfirmasi / Bukti after confirmation.

**Other trust cues**

- Photos: the Petugas Lapangan's visit photos are required and labelled "foto kunjungan <tanggal>". Partner-supplied photos are optional.
- Facilities: a fixed checklist (e.g. mushola, parkir, akses jalan mobil, air, keamanan, jam buka) plus one free-text note. The checklist drives the brief's facilities filter.
- **No** order counter (small numbers at launch, and counting deaths reads badly). **No** reviews or ratings in v1 (low volume, grief context, moderation cost); Keluhan covers complaints.

**Homepage promises**

- Each claim in the trust strip ("Lokasi terverifikasi · Harga transparan · Bantuan proses administrasi") links to a section of a static **"Cara Kami Bekerja"** page (it can live inside Tentang Kami) explaining the checks, the price-equals-Tagihan rule with the Biaya Layanan Platform shown separately, and that the TPU permit is free and families can file it themselves. This is content written in the spec.

Glossary: added **Terverifikasi**, **Kunjungan Verifikasi**, **Ditangguhkan**, **Berhenti** to `CONTEXT.md`.
