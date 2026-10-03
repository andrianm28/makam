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
