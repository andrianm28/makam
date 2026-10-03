# Operator facts and launch reference data

Status: ready-for-human
Spec: Domain modules > 17. Pengaturan Operator; 1. Identity & Access (first Admin Platform); Public site > Content pages; story 188

## What to build

A pre-launch checklist for the Operator. Every value below is entered by Admin Platform in the dashboard; nothing is seeded except the first Admin Platform. Content page copy stays in code and only needs sign-off.

## Acceptance criteria

- [ ] First Admin Platform: phone number and email given to the engineer for the CLI seed (ticket 09).
- [ ] Pengaturan Operator (ticket 63): PT Jaya Korpora Prima legal name, registered address and contact (phone, email); CS WhatsApp number and its reply hours ("dibalas mulai pukul 06:00"), used only for `wa.me` links and display (ADR 0004).
- [ ] Tariffs (ticket 12): Biaya Layanan Platform amount (flat, one rate) and its effective date.
- [ ] DKI TPU (ticket 43): the burial and filing-only Biaya Pengurusan; every DKI TPU with name, address, pin, data source and its initial "menerima makam baru" flag.
- [ ] Layanan (ticket 49): DKI Layanan variant prices and the Mitra Jasa rate per Layanan variant.
- [ ] Wakaf (ticket 58): the Nazhir list (name, type, kab/kota, contact, BWI number), if any.
- [ ] Sign-off on the v1 content page copy drafted in ticket 26 (Tentang Kami, Cara Kami Bekerja, FAQ, Hubungi Kami) and the Pengurusan di TPU DKI DIY guide (ticket 43).

## Added (2026-10-03, owner decision: a data template and importer for the launch reference data)

- [ ] A template the owner fills in a spreadsheet: one CSV per kind of row under `docs/ops/data-peluncuran/`, each with a header row and one worked example row, plus a README in Bahasa Indonesia that says what each column means and which item of this ticket it answers. It covers the multi-row data of this ticket: the DKI TPU (name, address, pin, data source, "menerima makam baru") with the burial and filing-only Biaya Pengurusan; the DKI Layanan variant prices with the Mitra Jasa rate per variant; the Nazhir list. Single-record items (Pengaturan Operator, the Biaya Layanan Platform, the first Admin Platform) are documented in the README with the screen or CLI that already sets them, not imported.
- [ ] `npm run import:data-peluncuran -- --sumber <dir> [--tulis]`: rows validated with Zod; a dry run by default that prints what it would create or change and every row it refuses, with the reason; `--tulis` writes only through the owning domain modules' public functions (no table writes from the CLI), idempotent on a natural key so a second run changes nothing; it refuses staging without `--izinkan-staging` and production without an explicit production flag, like `import:katalog-lama`.
- [ ] Domain tests against real Postgres for each kind (create, idempotent re-run, refusal with its reason), and a test that the template's example rows pass the dry run.

## Comments

- 2026-09-26 — Also needed from the Operator: its own photographs for the public site (team, service at partner Lokasi, well-kept graves, flowers; natural light, calm, no heavy grief visuals, people's consent). Until then licensed stock is used (spec, "imagery").
- 2026-09-26 — ADR 0004: the CS WhatsApp number is still entered, but only as a `wa.me` link and display value; no WhatsApp Business API number, Meta verification or kirim.dev account is needed (ticket 05 is wontfix).
- 2026-09-26 — User decision: v1 uses dummy content and free stock photos/images; the Operator's real facts and photos come later.
- 2026-10-03 — Builder (ticket 06, template + importer). Template `docs/ops/data-peluncuran/` (4 CSVs with one example row each, README in Bahasa Indonesia) and `npm run import:data-peluncuran -- --sumber <dir> [--tulis] [--izinkan-staging] [--izinkan-production]` (`src/cli/import-data-peluncuran-command.ts`, `src/cli/data-peluncuran/{csv,baris}.ts`). Writes only through `Lokasi.createTpuDki/updateTpuDki/updateTpuDkiFlag`, `Tariffs.setGlobalTariff/setHargaLayananDki/setTarifMitraJasa`, `Wakaf` Nazhir functions. Keys: TPU name; Biaya jenis; Layanan+varian name; Nazhir name+kab/kota. A run that refuses any row exits 1 but still writes the good rows. Two narrow public additions: `createKatalogLayanan` (Layanan) and `createNazhirList` (Wakaf). Migrations: none. Red/green: a few characterization tests (second run, refusals of Biaya and Layanan) passed on first run because the earlier green over-built; they are committed as `test:`, not `test(red):`.

  **Spec gaps and decisions for the owner**
  - The importer does not create Layanan or variants (the catalog, ticket 49, is not seeded by migrations): a row whose variant is missing is refused. The owner or Admin Platform creates the catalog first, or says the importer should.
  - Mitra Jasa as people/companies are not imported (invites go through the Mitra Jasa screen); only the rate per variant is.
  - The ticket places Biaya Pengurusan in the DKI TPU item; it is a global tariff, so it has its own CSV (`biaya-pengurusan.csv`). Retribusi Pemda (IPTM) is not in the template.
  - Production flag is named `--izinkan-production`. Partial writes: a Layanan row whose DKI price is entered but whose Mitra Jasa rate is refused is reported as refused with the DKI price already entered; a re-run completes it.
  - Not verified against staging or production (no access).

  HANDOFF: branch `ticket-06-data-peluncuran`, importer + template done. `npx vitest run src/cli src/domain/wakaf/nazhir.test.ts src/domain/layanan/katalog.test.ts tests/support/global-prune.test.ts`: 15 test files, 133 tests passed (own file `src/cli/import-data-peluncuran-command.test.ts`: 25 tests). `npm run lint` exit 0 (6 pre-existing warnings), `npm run typecheck` exit 0. Full suite not run (orchestrator's). Review on Opus (prices and rates).

- 2026-10-03 — Review (Opus, money code) of the Added section's template + importer, HEAD `6073a09`, fixed point `4fab4b1` (merge-base with `main`; 15 files, +1076). Tests re-run by the reviewer: `npx vitest run src/cli src/domain/wakaf/nazhir.test.ts src/domain/layanan/katalog.test.ts tests/support/global-prune.test.ts`, exit 0: 15 test files, 133 tests passed.

  **Standards** (0 blocking / 5 should-fix / 3 nit)
  - should-fix — `src/cli/import-data-peluncuran-command.ts:206-213`: the DKI price and the Mitra Jasa rate are two separate writes with no transaction, although `Tariffs.within(tx)` / `inTransaction` exist. If `setHargaLayananDki` commits and `setTarifMitraJasa` then refuses, the new DKI price is live for orders while the old Mitra Jasa rate still applies, and the row is reported "ditolak" even though half of it was written. Write the pair atomically.
  - should-fix — `command.ts:62,72,78`: TPU rows are matched and de-duplicated on the exact `name`. Lokasi's key is folded (trim, lower case, single spaces; `src/domain/lokasi/tpu.ts:88-90`). The CLI already folds Layanan and Nazhir names with `kunciNama`. Failure case: the stored "TPU Karet Bivak" plus a CSV row "TPU Karet bivak" with a corrected address gives "akan dibuat" in the dry run, then `nama_sudah_ada` under `--tulis`. The correction is never applied and every run exits 1, so the import is not idempotent on its natural key.
  - should-fix — `command.ts:111-115,135-153`: the domain checks (a past `berlaku_mulai`, giving `tanggal_berlaku_lampau` from `src/domain/tariffs/money.ts:15`; the `rupiahSchema` upper bound) run only under `--tulis`. The dry run reports such a row as "akan dibuat/diubah, 0 ditolak". The operator sees the refusal only on the production write, after the other rows are already written. Validate these rows in the dry run too (Zod refine on the row, or a domain check function that doesn't write).
  - should-fix — `command.ts:109,145`: the audit reason is the fixed string `ALASAN_IMPOR`. The precedent (`import-katalog-lama-command.ts:21-24,52-53`) names the staging or production allowance in the reason of every write. A production price change is recorded under whichever Admin Platform account is found first (`:344-356`), and nothing in the Audit Log shows it came from `--izinkan-production`.
  - should-fix (horizontal slicing) — red commit `59764a4` tests five behaviours at once (Nazhir idempotence, Nazhir refusals, Excel CSV, the example rows, the missing folder). `974e06b` (staging + production) and `a68cb99` (DKI price + Mitra Jasa rate) each pair two behaviours.
  - nit — `src/domain/wakaf/index.ts:97-104`: `createNazhirList` also exposes `hapusNazhir`, which nothing uses (Speculative Generality).
  - nit — `src/domain/wakaf/nazhir.ts:5-8`: the `NazhirDeps` export sits between two import blocks.
  - nit — `command.ts:47-56` vs `:86`: the TPU profile comparison is written out twice.
  - Noted, not counted: an unset `APP_ENV` defaults to development, so a production `DATABASE_URL` with no `APP_ENV` skips the production flag. `import:katalog-lama` has the same behaviour.
  - Verified fine: tariffs are append-only versions (`src/domain/tariffs/version-writes.ts:35`). A changed amount adds a new dated version and never overwrites a price in use. Amounts are whole rupiah ("750.000" and "Rp" are refused). Duplicates within a file are refused. Writes go only through public domain functions. Zod checks argv, env and every row. There is no `new Date()`. Tests read state back through public queries.

  **Spec** (0 blocking / 4 should-fix / 3 nit)
  - should-fix — "a dry run by default that prints … every row it refuses, with the reason": domain refusals appear only with `--tulis` (same root cause as Standards #3). README:35 says "Tidak boleh tanggal lampau", yet the dry run accepts a past date. The test covers this only with `--tulis` (`test.ts:178,184`).
  - should-fix — "idempotent on a natural key so a second run changes nothing": the TPU key differs from the domain's key (Standards #2). The duplicate check within a file misses case variants too.
  - should-fix — "a README in Bahasa Indonesia that says what each column means": the README doesn't yet let the owner export the CSV without help.
    - It never mentions encoding: the reader is UTF-8 only, while Excel's plain "CSV" save is ANSI, so the owner should pick "CSV UTF-8".
    - It doesn't warn that Excel reformats dates, a leading 0 in `kontak`, and `-6.1200` in an Indonesian locale unless the cells are set to Teks.
    - It gives no list of accepted `kab/kota` spellings.
    - It doesn't say that `seed:admin` must run first (the importer refuses without it, `command.ts:347`).
  - should-fix (horizontal slicing) — commit `59764a4`, as under Standards.
  - nit — refusal reasons reach the owner as raw codes (`tanggal_berlaku_lampau`, `nama_sudah_ada`, `tpu_tidak_valid`; `command.ts:90,100,148`).
  - nit — scope: the unused `hapusNazhir` (as under Standards).
  - nit — the reported partial Layanan write is finished on a re-run (it goes away if Standards #1 is fixed).
  - Complete: one CSV per kind, each with a header and one example row. Every column is explained, with the ticket item each file answers. The single-record items point to screens that exist (`src/app/staf/admin-platform/{pengaturan-operator,tarif,layanan}`) and to `seed:admin`. The example rows pass a dry run (`test.ts:341-353`). Each kind has create, re-run and refusal tests against Postgres. The staging and production flags are enforced. The builder's four spec gaps are genuine gaps, not narrowing.

  Worst finding: Standards, the non-atomic DKI price + Mitra Jasa rate write. Spec, the dry run not showing domain refusals (past date).

- 2026-10-03 — Builder fix pass (ticket 06, on review head `22c8745`). Owner decisions applied: (a) the importer now creates the Layanan catalog (`katalog-layanan.csv`: Layanan with `jenis`, `deskripsi`, lead time, hari-H and empty-plot flags, label, variants in one cell separated by `|`) through the Layanan module's public functions (`createLayanan`, `ubahLayanan`, `tambahVarian`, via the narrow `createKatalogLayanan`), before the DKI prices and Mitra Jasa rates; idempotent on the folded Layanan and variant names; a variant is added, never removed. The "importer does not create the catalog" spec gap is closed (the module had the public functions). Mitra Jasa people stay out. (b) README lists Retribusi Pemda (IPTM) among the single-record items for the Tarif screen.

  Findings, Standards: (1) non-atomic DKI price + Mitra Jasa rate — **fixed**: both go in one `refusable` transaction on `Tariffs.within(tx)`; a row whose second amount is refused enters neither (tested; the case is reached through the row's amount limit, so the transaction is the second line of defence). (2) TPU key not folded — **fixed**: matched and de-duplicated on the name folded as Lokasi folds it; the stored name is kept on update. (3) dry run skipped domain checks — **fixed** at the root: a dry run is now the real run inside a transaction that is rolled back, so past dates, taken names and over-limit amounts show; amounts above Rp 100.000.000.000 are also refused per row by Zod. (4) audit reason — **fixed** for every write that takes a reason (tariffs, Layanan): on staging/production it reads `... (ticket 06, staging, --izinkan-staging)` / `... production, --izinkan-production)`; TPU and Nazhir writes take no reason in their modules, so their entries carry none (same as `import:katalog-lama`). (5) horizontal slicing — **left**: pushed history is not rewritten; later red commits are one behaviour each (the dry-run/wording red and the TPU-fold red each cover two facets of one rule). Nits: unused `hapusNazhir` removed from `createNazhirList` — fixed; `NazhirDeps` moved under the imports — fixed; TPU profile comparison written once — fixed. Noted item (unset `APP_ENV` defaults to development, skipping the production flag) — **left**: same as `import:katalog-lama`; the owner should set `APP_ENV` in the production shell.

  Findings, Spec: (1) dry run — fixed as above. (2) natural key — fixed as above. (3) README — **fixed**: CSV UTF-8, Teks cells (leading zeros, dates, coordinates), the accepted kota/kabupaten spellings, `seed:admin` first, import order; the reader still takes UTF-8 only and does not detect an ANSI file (left: the README tells the owner which save option to pick). (4) slicing — left, as above. Nits: raw refusal codes — **fixed** (`alasanModul` words them, e.g. "berlaku_mulai 2026-09-01 sudah lewat"); `hapusNazhir` — fixed; partial Layanan write — gone with (1).

  HANDOFF: branch `ticket-06-data-peluncuran`, fix pass done. `npx vitest run src/cli src/domain/wakaf src/domain/layanan/katalog.test.ts src/domain/layanan/varian.test.ts tests/support/global-prune.test.ts`: 19 test files, 179 tests passed (own file `src/cli/import-data-peluncuran-command.test.ts`: 35). `npm run lint` exit 0 (6 pre-existing warnings), `npm run typecheck` exit 0. Full suite not run (orchestrator's).

- 2026-10-03 — Re-review (Opus, money code) of the fix pass. HEAD `32e77f7`, fixed point `22c8745` (11 files, +508/−113). The reviewer re-ran the tests with Docker up: `npx vitest run src/cli src/domain/wakaf src/domain/layanan/katalog.test.ts src/domain/layanan/varian.test.ts tests/support/global-prune.test.ts`, exit 0, 19 test files, 179 tests passed (counts read off the whole log).

  **Earlier findings: 13 of 15 FIXED**
  - Standards should-fix 1, non-atomic DKI price + Mitra Jasa rate: **FIXED** in code. Both writes now go through `refusable(db, tx => tariffs.within(tx)…)` (`src/cli/import-data-peluncuran-command.ts:300-311`). The writes are still append-only dated versions, so no price in use is overwritten. The test does not pin it, see new finding 2.
  - Standards should-fix 2, TPU key: **FIXED**. Matching and de-duplication use `kunciNama` (`command.ts:49,70-87`), and the stored name is kept.
  - Standards should-fix 3, dry run skipped domain checks: **FIXED**. The dry run is the real run inside a transaction that is rolled back (`command.ts:485-497`). Every module, the audit included (`audit.staffWrite(db, …)`), is composed on `tx`, and nothing enqueues or writes files, so nothing leaks. The nested `refusable` becomes a savepoint. The amount ceiling is also checked in Zod (`src/cli/data-peluncuran/baris.ts:62-67`, `RUPIAH_MAX`).
  - Standards should-fix 4, audit reason: **FIXED** (`command.ts:136-137`, test "names the staging allowance…"). TPU and Nazhir writes take no reason; that matches `import:katalog-lama` and is acceptable.
  - Standards and Spec should-fix 5 and 4, horizontal slicing in `59764a4` / `974e06b` / `a68cb99`: **NOT FIXED**. The reason (pushed history is not rewritten) is accepted for the old commits. The fix pass repeats the problem, though (new finding 3).
  - Nits: unused `hapusNazhir` **FIXED** (`src/domain/wakaf/index.ts:96-103`). `NazhirDeps` placement **FIXED** (`nazhir.ts:5-9`). Profile comparison written once **FIXED** (`command.ts:52`).
  - Spec should-fix 1 and 2: **FIXED**, as Standards 3 and 2.
  - Spec should-fix 3, README: **FIXED** (`docs/ops/data-peluncuran/README.md:7-11`: CSV UTF-8, Teks cells, kota spellings, `seed:admin` first). The reader still refuses nothing for an ANSI file. Since the README names the save option, that is accepted.
  - Spec nits: raw codes **FIXED** (`alasanModul`, `command.ts:114`). `hapusNazhir` **FIXED**. Partial Layanan write **FIXED** (with Standards 1).
  - The earlier "noted" item, an unset `APP_ENV` defaulting to development: left. It is the same in `import:katalog-lama`; reason accepted.

  **Owner decisions**
  - (a) The catalog is created through Layanan's public functions (`createKatalogLayanan`: `createLayanan` / `ubahLayanan` / `tambahVarian`, `src/domain/layanan/index.ts:810-819`), before the prices in the same run (`command.ts:393-395`). It is idempotent on the folded Layanan and variant names. Applied.
  - (b) README lists Retribusi Pemda (IPTM) on the Tarif screen (`README.md:47,95`). Applied.

  **New findings: 0 blocking / 4 should-fix / 6 nit**

  Standards (0 / 3 / 5)
  - should-fix: in `command.ts:235-246`, `ubahLayanan` commits before the `tambahVarian` loop and no transaction wraps them. Failure case: a variant is refused after the description changed. The row is reported "ditolak", yet half of it is written. Wrap the row in `refusable` as `olahLayanan` does.
  - should-fix: the test "enters neither price when one of the row's two amounts is refused" (`test.ts:378-388`) feeds `100000000001`, which the row's Zod (`RUPIAH_MAX`) refuses before `refusable` is entered. Replacing `refusable` with two plain writes still passes, so the atomicity is untested. Force a second-write refusal through a seam, or rename the test for what it checks. The builder's entry says this ("second line of defence"), but the test name still claims atomicity.
  - should-fix (horizontal slicing): red commit `56c6e09` tests 5 behaviours (second run, update, refusals, atomic pair, template-file list). It was committed after `8f57f29`, which already implemented the catalog and the atomic pair, so the atomic pair was test-after and its commit is wrongly labelled `test(red)`.
  - nit: the `fieldBerbeda` cascade (`command.ts:223-229`) repeats the shape of `profilBerbeda` (`:52`).
  - nit: `alasanModul` hard-codes "Rp 100.000.000.000" (`:121`) although `RUPIAH_MAX` exists.
  - nit: the second parameter of `alasanModul` (`berlakuMulai`) serves one case only.
  - nit: `varian.ts:85` writes out `Pick<LayananDeps,"db"|"clock"|"audit">` instead of using the new `KatalogDeps`.
  - nit: `hasil!` (`:496`) relies on assignment inside a closure.

  Spec (0 / 3 / 1; two of the three are the same as Standards)
  - should-fix: "Domain tests … for each kind (create, idempotent re-run, refusal with its reason)". The catalog kind's refusal tests cover only CLI/Zod refusals; none covers a refusal from the Layanan module. Only `deskripsi` changes are tested. A change to `lead_time_hari`, `bisa_hari_h`, `ada_di_petak_kosong` or `teks_label` is untested (`test.ts:293,304-323`).
  - should-fix: the catalog row half-written and reported "ditolak" (as under Standards).
  - should-fix: slicing (as under Standards).
  - nit: no dry-run test asserts that the Audit Log stays empty.

  Worst finding. Standards: the half-written catalog row (not money). Spec: the catalog refusals that are untested at the module. Money handling (amounts, dates, no overwrite, atomic price pair, dry-run rollback) is sound in the code.

  **Hard remaining: no.** Nothing is blocking. The four should-fix items are a small fix pass, or the orchestrator can defer them.
