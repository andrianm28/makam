# Content: the TPU Layanan price list, Wakaf's Dirujuk status, and a kind-aware notice on filing-only IPTM orders

Status: resolved
Blocked by: none (found by the UAT runner audit and the reviews of ticket 116; group B; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 43 (the TPU page and prices), 58 (Wakaf Tanah), 47 (Pengurusan IPTM); checklist R3-43.3 and the Wakaf items

## What to build

1. **`/pengurusan-tpu` says the TPU Layanan price list is not available yet.** `src/app/(site)/pengurusan-tpu/page.tsx` (about line 124) reads "Daftar harga Layanan di TPU DKI (perawatan makam, batu nisan, bunga) belum tersedia. Segera hadir.", although the DKI Layanan prices exist (Tarif, ticket 49, Data Contoh rilis3). Show the price list from the Tarif module's public reads. While the prices are Data Contoh, label them "harga contoh", as ticket 112 does.
2. **Wakaf outside Jabodetabek:** the confirmation page `/wakaf-tanah?nomor=…` (`src/app/(site)/wakaf-tanah/page.tsx`) shows only "Pengajuan wakaf diterima". It must show the Pengajuan's status, Dirujuk, with the pointer to KUA and BWI that ticket 58 specifies.
3. **A filing-only IPTM order shows a burial notice.** `src/app/pengurusan/[nomor]/pengajuan-pemesan.tsx` (about line 115) tells a family that buried on their own "…sejak pemakaman diatur dengan TPU". Make the notice kind-aware: for a filing-only order, speak of the filing, not of a burial we arranged. Do not change the refund rule behind it (money).

## Acceptance criteria

- [ ] **`/pengurusan-tpu`** lists the DKI Layanan with their prices (labelled "harga contoh" while Data Contoh is active). There is no "Segera hadir" for it.
- [ ] **Wakaf:** outside Jabodetabek, the confirmation shows Dirujuk and the KUA and BWI pointer. Inside, it is unchanged.
- [ ] **The filing-only notice** no longer mentions a burial. The Saat Duka TPU wording is unchanged.
- [ ] **Tests:** static renders with real reads; the copy is in Bahasa Indonesia and passes the copy guards.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Copy for the owner to glance at in the review.

### Build (2026-10-05)

Builder (Sonnet, branch `ticket-124-konten-harga-tpu-wakaf`, base `9da0fb3b`; not a review record). Not money code: only wording of the refund notice changed, the refund rule (`batalkanPengurusan`) is untouched. Failing tests first and committed on their own (`480d7af5`, `bfd12eca`), then the code.

**What changed**

1. **`/pengurusan-tpu`: the DKI Layanan price list.** The card "Harga Layanan di TPU DKI" no longer says "Segera hadir". It lists each Layanan a DKI TPU offers, in catalog order, with each variant and its DKI price (`kelompokHargaLayananTpu` in `src/lib/content-pages.ts`, drawn by the page). Each amount carries "harga contoh" while `pricesMayBeExamples()` holds (the marker ticket 112 uses for the two Biaya Pengurusan on the same page), with a note under the list. Where no Layanan is offered the card says so plainly (never "Segera hadir").
2. **`/wakaf-tanah?nomor=…`: Dirujuk.** For a Dirujuk Pengajuan the confirmation now says "Status: Dirujuk." followed by the pointer to the local KUA and BWI (the Pengajuan's own `alasan`, which is `PETUNJUK_DIRUJUK` for the automatic Dirujuk), and where the news also goes. Inside Jabodetabek the confirmation is byte for byte what it was (pinned by a test).
3. **A filing-only order's cancellation notice** (`pengajuan-pemesan.tsx`) comes from `catatanPembatalanPengurusan(kind)` in `src/lib/pengurusan-labels.ts`: a filing-only order speaks of the filing; a Saat Duka TPU order and a Perpanjangan TPU order read exactly as before (each pinned).

**Copy for the owner to glance at** (Bahasa Indonesia, as in the code)

- Layanan card, under the title: "Satu harga untuk semua TPU DKI, tanpa Biaya Layanan Platform." Then, per Layanan, its name and one row per variant: "<variant> … Rp <harga> harga contoh". Under the list while examples show: "Selama masa uji coba, harga Layanan di atas adalah harga contoh, bukan harga yang berlaku." Then: "Untuk memesan, buka Pesan Layanan di TPU DKI." (link to `/layanan/tpu`). Empty: "Layanan di TPU DKI belum tersedia." (plus "Tanya CS di WhatsApp (<jam>)." when Pengaturan Operator has the CS).
- Wakaf, Dirujuk: "Status: Dirujuk. Pengajuan di luar Jabodetabek belum kami tangani. Silakan datang ke Kantor Urusan Agama (KUA) kecamatan setempat atau kantor perwakilan Badan Wakaf Indonesia (BWI) di kabupaten/kota tanah Anda untuk memulai proses ikrar wakaf." then "Kabar ini juga kami kirim ke <email>." The heading stays "Pengajuan wakaf diterima" for every status.
- Filing-only cancellation: "Bisa dibatalkan sampai IPTM diajukan. Tagihan yang belum dibayar dibatalkan; yang sudah dibayar dikembalikan, kecuali Biaya Pengurusan sejak berkas IPTM mulai kami urus." (Saat Duka TPU, unchanged: "… kecuali Biaya Pengurusan sejak pemakaman diatur dengan TPU." Perpanjangan TPU, unchanged: "Tagihan yang belum dibayar dibatalkan.")

**Spec gaps and decisions for the owner**

- **No acceptance criterion is undeliverable as written.** The decisions below are mine, yours to overrule.
- **What marks "Data Contoh is active" (decision).** I used `pricesMayBeExamples()` for the Layanan amounts too, as ticket 112 does for the Biaya Pengurusan, so the whole page labels itself one way. Ticket 109's `dataContoh.aktif()` exists on `main` now and 112 said to swap to it once it did; nobody has. The swap is one call in the page, and should be made for both blocks together (it changes which environments show the label: staging without a planted set would stop showing it).
- **Where the prices are read (decision).** They are Tarif's DKI prices, read through the Layanan module's public `penawaranTpuUntukPesanan()` (Layanan owns the catalog's names and the "boleh di TPU DKI" mark, and it prices each variant through Tarif's `quote`). It is the very list the TPU order is priced from, so the guide cannot list what the order does not offer, nor a different price. It costs one quote per variant per page view, as the order page does.
- **The filing-only refund rule is worded by the filing, not changed (spec gap).** The spec words the rule by the burial ("once the Operator has arranged the burial with the TPU (Dimakamkan or later) the Biaya Pengurusan is kept", spec line 428). A filing-only order starts at Dimakamkan and has no burial of ours, so the module keeps the Biaya Pengurusan from its first status, and I worded that as "since we began on the IPTM file". If the owner means that a filing-only family gets the Biaya Pengurusan back until the filing begins, that is a rule change (money), not wording. The clause only bites in one narrow case: a family that cancels after paying, in the minute before the order is Diproses (from Diproses on, cancelling is not offered). A shorter wording without a reason is "… kecuali Biaya Pengurusan."
- **The Wakaf heading stays "Pengajuan wakaf diterima" for a Dirujuk Pengajuan** (decision): the Pengajuan was received and has its Nomor, and the UAT helper `ajukanWakaf` waits for that heading after filing in Jabodetabek and outside it.
- **Added beyond the ticket's bullets, one line each:** the link "Pesan Layanan di TPU DKI" under the list (a price list with no way to order is a dead end; ticket 112's note offered "link the card to it" beside "build a list here"), and the explanation "Satu harga … tanpa Biaya Layanan Platform." Drop either by deleting its line.
- **Not built from `content-drafts.md` ("Layanan Makam di TPU DKI"):** the "Pesan paling lambat" (lead time) column and the Paket Layanan sentence. The ticket asks for the Layanan and their prices; the lead time is on the order page. Say if you want the column.
- **UAT, for its owner (not touched):** R3-58.1's comment in `rilis3-wakaf-tanpa-bayar.uat.ts` says the confirmation carries only the pointer; it now also says "Status: Dirujuk.", and the journey's assertions still hold. R3-43.3 checks only the card's title, which is unchanged; it could now check a price.

**Tests** (read off whole logs; exit codes in brackets)

- Red first: `content-pages`, `pengurusan-tpu/page`, `wakaf-tanah/page` and `halaman-pesanan`: 19 failed, 41 passed [1], each for the intended reason (a missing function, the "Segera hadir" card, no "Status: Dirujuk", the burial in the filing-only notice). `pengurusan-labels`: 3 failed [1].
- Green: the four files and the label test (five files): 63 tests [0]. The touched directories (`src/app/pengurusan/`, `wakaf-tanah/`, `pengurusan-tpu/`, `content-pages`, `pengurusan-labels`): 6 files, 67 tests [0].
- New page tests render the real page on real reads and a real Postgres (`renderToStaticMarkup`): the Layanan list in catalog order with prices and "harga contoh", none on a production paying live, the order link, the empty state, no "Segera hadir"; Wakaf outside Jabodetabek (Dirujuk and the KUA and BWI pointer, no promise of a first contact) and inside (unchanged); the filing-only notice at Dimakamkan and Menunggu Pembayaran, and the Saat Duka TPU notice unchanged.
- Copy guards and neighbours (`dependency-direction`, `no-ticket-numbers`, `no-retired-company-name`, `brand-tokens`, `no-ops-email-verification`, `rilis-guard`, `rilis`, `proxy`, `public-navigation`, `homepage-content`, `makam-keluarga-content`, `copy-scan`, `tests/uat`): 23 files, 512 tests [0].
- `npm run lint` [0], 0 errors (6 warnings, none in touched files); `npm run typecheck` [0].
- Not run: `npm run build` (not needed), the full suite, e2e and the UAT. Unverified: the pages in a browser, and the real Data Contoh rilis3 set (the tests use the two Layanan of `siapTpu`).

### Review and merge (2026-10-06, orchestrator; fixed point 9da0fb3b, head 7be441ed)

- **Two-axis review:** Standards and Spec reviewers (sonnet) in parallel; round 0: Standards Hard: 0, soft: 4, Spec Hard: 0, soft: 2.
- **Status:** clean, with Hard 0 on both axes in the last round. The soft findings and the builder's spec gaps are in the review entries and in "Spec gaps and decisions for the owner" above; the owner triages them.
- **Merged** in batch MB14, after the full verification (typecheck, lint, build, `npm run test:shared`).

