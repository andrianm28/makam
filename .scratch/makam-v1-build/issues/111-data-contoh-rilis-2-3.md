# Data Contoh for Rilis 2/3: TPU prices and rates, Mitra Jasa, Nazhir, Rilis 2 rules

Status: ready-for-agent
Blocked by: 109
Spec: Release plan (Rilis 2/3); tickets 43–48, 55–58; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

Extend 109's Data Contoh command with a Rilis 2/3 set. Production can then open level 3 during the beta without the owner's real TPU prices (owner decision 2026-10-04: dummy data for all releases, prices included). Today, at level 3, TPU Layanan are unpriced and unoffered, no Mitra Jasa or Nazhir exist, and a TPU order is refused with `tarif_belum_ada` until Retribusi is entered.

## Acceptance criteria

- [ ] **`tanam --set rilis3`:**
  - DKI price and Mitra Jasa rate for the 11 TPU Layanan variants (`src/domain/tariffs/layanan-harga.ts`), and the "boleh di TPU DKI" marks.
  - 3 Mitra Jasa "(Contoh)", Aktif, with coverage (`src/domain/layanan/mitra-jasa.ts`).
  - 2 Nazhir "(Contoh)" (`src/domain/wakaf/nazhir.ts`).
  - Rilis 2 rules on 2 contoh Lokasi (`src/domain/lokasi/policies.ts`).
  - Retribusi Pemda IPTM = Rp 0, entered as a **real** value, not contoh (owner confirms).
  - All of it recorded in the 109 registry; idempotent.
- [ ] **`cabut` extended:** Mitra Jasa → Nonaktif; Nazhir removed or deactivated; a TPU price with no real successor version → that variant is no longer offered at a TPU. `status` covers the new kinds.
- [ ] **Tests:** idempotence; `cabut` effects; a TPU quote succeeds after `tanam rilis3` and is unavailable again after `cabut` without a real price.
- [ ] **Amounts:** the fixture amounts are listed in Comments and approved by the owner before merge.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB6). **Money code (tariffs): opus review, merged alone.**

### Build (2026-10-04)

Built on branch `ticket-111-data-contoh-rilis-2-3`, based on ea371143 (the local `main` after MB3, ticket 109 merged; the remote `origin/main` is still at f0ef4e93, which has no Data Contoh module).

**What changed**

- **Registry** (`src/domain/data-contoh/index.ts`; no migration, the `himpunan` and `jenis` columns are plain text): set `rilis3`; six new kinds of entry (`harga_layanan_dki`, `tarif_mitra_jasa`, `tanda_tpu_dki`, `mitra_jasa`, `nazhir`, `aturan_lokasi`). A DKI price or a Mitra Jasa rate version is named `<variant id>:<version>`; a price fixture names its variant (`layananVariantId`), and `tanam` records a contoh version of that book a killed run left unrecorded instead of entering a second one, told by the Audit Log's reason mark exactly as for the Biaya Layanan Platform (the price-book logic is now one function over a `Buku`, global or per variant; the global behaviour is unchanged). New deps `layanan` and `wakaf` (both runtimes pass them). `rencanaCabut(by)` now takes the Admin Platform, because the Mitra Jasa rate is Admin Platform's to read.
- **CLI** (`src/cli/data-contoh-command.ts`, `src/cli/data-contoh/rilis3.ts`): `tanam --set rilis3`, dry run unless `--tulis`, same flags and guards as rilis1. It builds on the launch data and on rilis1 and refuses, writing nothing (the dry run too, exit 1), when the Layanan catalog, the DKI TPU or the two Lokasi (Contoh) its rules go on are missing, naming what to run first. `status` lists the new kinds; `cabut` (dry run and `--tulis`) reports the variants it stops offering at a TPU.
- **Neighbour modules, additive only:** Tariffs `hargaLayananDkiHistory` and `mitraJasaRateHistory` (the second Admin Platform only); Layanan `createMitraJasaDaftar` (the roster with the real TPU job port), `createPenawaranLayanan` also serves `tandaiBolehDiTpu`, and the roster functions take a narrower `MitraJasaDeps`; Wakaf `createNazhirList` also serves `hapusNazhir`.
- **Docs:** runbook (both Data Contoh sections), CONTEXT.md (Data Contoh), `docs/agents/orchestration.md`. The CONTEXT.md entry and the runbook's first Data Contoh section were also made to satisfy three checks of `tests/tooling/go-live-docs.test.ts` that were already red at ea371143 (the MB3 merge left the entry with commands in it, and the first Data Contoh section of the runbook is now 109's, which lacked "rilis3", "only way example data reaches production" and ADR 0007). Docs only.

**Amounts for the owner to approve** (all in `src/cli/data-contoh/rilis3.ts`; every one a multiple of Rp 25.000, and the DKI prices differ from the Rilis 1 Lokasi prices on purpose, so a read of the wrong price book shows)

- DKI price a family pays at any TPU, one amount per kind of Layanan, so for the 11 variants of the launch catalog: Karangan Bunga Papan Standar and Paket Bunga Tabur Standar **Rp 150.000** each; the four Batu Nisan (Granit Hitam 60 x 80, Granit Abu-abu 80 x 100, Marmer Putih 60 x 80, Marmer Krem 80 x 100) **Rp 1.500.000** each; Pembersihan Standar and Menyeluruh **Rp 250.000** each; Perawatan Standar **Rp 350.000**; Laporan Foto and Foto & Video **Rp 75.000** each.
- Mitra Jasa rate (what the Operator pays; never shown to a family): bunga **Rp 100.000**, nisan **Rp 1.000.000**, pembersihan **Rp 150.000**, perawatan **Rp 200.000**, laporan **Rp 50.000**.
- **Retribusi Pemda IPTM Rp 0**, entered as a real value (owner's decision), only when no version of it is in force.
- Rilis 2 rules (the other rules of these Lokasi stay as the Rilis 1 set left them; tumpang is already on at all five): **Taman Makam Firdaus (Contoh)**: Masa Tenggang 3 bulan, at most 3 terms per Perpanjangan (K), Ganti Pemegang Hak by sale allowed, its fee **Rp 500.000** (three terms of its Makam Taman is Rp 9.000.000, under the Rp 10.000.000 QRIS cap with the contoh platform fee); **Makam Masjid Nurul Huda (Contoh)**: Masa Tenggang 6 bulan, K 2, sale allowed, fee **Rp 250.000**. The other three Lokasi (Contoh) keep the defaults, so a refused sale can be tried too.
- Three Mitra Jasa (Contoh), Aktif, on `.invalid` addresses with fictional NIKs that start with the province code 00: Agus Pratama (every TPU, every variant), Siti Rahayu (every TPU, no Batu Nisan), Bambang Wijaya (the first half of the TPU by name, every variant). Two Nazhir (Contoh): Nazhir Wakaf Sejahtera (badan hukum, Jakarta Selatan) and Nazhir Amanah Umat (organisasi, Bogor).

**Decisions** (each the conservative reading; none rewords a requirement)

1. **"A TPU price with no real successor": `cabut` takes the variant off the TPU listing, it does not refuse.** The "boleh di TPU DKI" mark is what offers a variant at a TPU, so `cabut` turns it off for every variant whose DKI price or whose Mitra Jasa rate in force is still a contoh version, whoever set the mark. I included the rate on purpose: a variant offered at a real DKI price with an example rate would pay a Mitra Jasa an example amount when its proof is approved. A variant whose two prices both have a real version after the example ones keeps its mark. The Biaya Layanan Platform of rilis1 still makes `cabut` refuse (109's rule, unchanged). The example versions stay in the price books as history (Tariffs never erases one).
2. **The Retribusi Pemda is not in the registry.** The AC says "all of it recorded in the 109 registry" and also "a real value, not contoh"; I read the first as everything contoh. A row for it would make `cabut` wait for it to be superseded and keep the banner on for ever. Its reason begins "nilai asli" (the module tells an example price by a reason that begins `data-contoh tanam`), so nothing counts it as contoh.
3. **"The 11 variants" is every variant of the catalog**: 11 at launch, and the set follows a catalog that changes. A variant that already has a DKI price (or a rate) in force keeps the Operator's, and is not marked: `status` and `tanam` then show fewer rows than variants, and the run says how many fixtures it skipped.
4. **"Mitra Jasa Nonaktif" is Berhenti** (`ubahStatus`, with the reason of the run): the glossary avoids "Nonaktif" and Ditangguhkan is reversible. A Mitra Jasa (Contoh) an earlier `cabut` ended, or one a killed run left, is taken up again (set Aktif, coverage replaced) rather than created twice. **Nazhir are removed** (Wakaf has no deactivation); one with the same name left by a killed run is recorded, not added twice.
5. **Rilis 2 rules** go on Taman Makam Firdaus and Makam Masjid Nurul Huda (the checklist's Lokasi B is a berjangka Lokasi); only Masa Tenggang, K, the sale flag and its fee are written, and only while a Lokasi's four are still the defaults (rules someone has set are left, and not recorded). `cabut` has nothing to undo there: the Lokasi is hidden for good.
6. `aktif()` (banner, preflight) stays registry-only for the TPU books, because the browser-config route asks it twice per page load and an unrecorded-price check would cost two Audit Log reads per variant. The Layanan prices a killed run left are still found by `tanam` and by `cabut`.
7. The dry run of `cabut` now needs `seed:admin` too (it reads the rates as Admin Platform).

**Spec gaps and decisions for the owner**

- **Amounts: need the owner's approval before merge** (the list above; to change one, name it, it is one file).
- **Onboarding rows of the Mitra Jasa (Contoh).** They are Aktif with coverage as the AC says, with no KTP, photo, agreement scan or bank account, so Tier 4 "Onboarding Mitra Jasa" lists all three (the monthly scorecard review will open rows for them too). That row counts a record at any status (`mitraJasaBelumLengkap`), so after `cabut` the three Berhenti records stay in it for good. Two ways out, the owner's call: complete their onboarding in the set (placeholder files in the private FileStore, a bank account in the KTP name; more machinery and example bank data), or have that row skip Berhenti records (a Layanan and Queues rule). Not done here.
- **After `cabut` a contoh DKI price or rate is still the version in force** for a variant that is no longer offered. If someone marks that variant again by hand before entering real prices, it is offered at the example price and nothing flags it (the preflight sees registry rows only, decision 6). The runbook says to enter the real DKI price and rate before marking a variant again.
- **The remote `origin/main` lacks the Data Contoh module** (ea371143 is the local `main`): push the merge before this branch if the review reads against the remote.

**Tests** (read from whole logs)

`npx vitest run` over `src/domain/data-contoh`, `src/cli/data-contoh-command.test.ts`, `src/cli/import-data-peluncuran-command.test.ts`, `src/domain/tariffs/layanan-harga.test.ts`, `src/app/api/browser-config`, `src/domain/layanan/mitra-jasa.test.ts`, `src/domain/layanan/penawaran.test.ts`, `src/domain/wakaf/nazhir.test.ts` and the tooling tests `data-contoh-bundle`, `go-live-docs`, `ticket-workflow`, `katalog-lama-runbook`, `image-retention`, `makam-preflight`: **14 files, 387 tests, exit 0**, 118 s, read from the whole log. New: domain +13 (42 in the file), command +14 (35 in the file), Tariffs +1 (9 in the file).

- **Test first:** the history reads and the module cases were run red before their change (`hargaLayananDkiHistory is not a function`; 12 domain cases failing on the unknown set `rilis3`), the command cases written against the then missing `rilis3.ts`. **Mutation checks**, each turned at least one test red and was then restored: skipping the step that takes a variant off the TPU listing (4 tests failed); ignoring the Mitra Jasa rate (3); not recording a price a killed run left (2); not setting a Mitra Jasa to Berhenti (1); not removing a Nazhir (1); retiring the rows of a variant whose mark could not be taken off (1); in the command: marking a variant the set did not price (1), overwriting a real DKI price (1), overwriting rules someone had set (1), giving the Retribusi the reason of a tanam so it looks contoh (4).
- The AC's three tests: idempotence ("planting twice changes nothing": no second version, no Entri Audit, the same status); the effects of `cabut` (domain and command: Mitra Jasa Berhenti, Nazhir removed, variants off the TPU listing, real prices keep a variant offered, the Retribusi untouched, exit 0 with nothing active); "a TPU quote succeeds after `tanam --set rilis3` and is unavailable again after `cabut` without a real price" (`hargaPesananTpu` answers a total, then `null`; the TPU listing is empty), plus one case that plants all 11 variants of the launch catalog's own `katalog-layanan.csv` (imported by `olahKatalog`) at the per-kind amounts.
- `npm run typecheck` exit 0. `npm run lint` exit 0 (6 warnings, the same as at ea371143, none in a file this ticket touches).
- **Not run:** `npm run build` (nothing here needs it; the bundle test builds and runs the bundle itself), the full suite, Playwright, CI, and a real run against the staging database's 38 TPU and 6 Layanan (the tests use a 3-variant catalog and the launch catalog's CSV on the test Postgres).

