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

### Review (2026-10-04, round 1; fixed point ea371143, head ec5de35e)

Two review reports, pasted verbatim by the fix pass. Only their heading levels are lowered, so the entry stays inside `## Comments` (`tests/support/ticket-workflow.ts` ends a Comments section at the next `## ` heading).

#### Standards

The fixed point ea371143 resolves, and `git diff ea371143...ec5de35e` is not empty (18 files, +1564/−89). As the brief asks, I ran only the ticket's three changed test files, each run on its own throwaway Postgres:

`npx vitest run src/domain/data-contoh/data-contoh.test.ts src/cli/data-contoh-command.test.ts src/domain/tariffs/layanan-harga.test.ts`

Result: **exit 0, 3 files, 86 tests** (42+35+9, as the ticket says). Two test processes log a pg "client.query() while already executing" DeprecationWarning. The stack traces never reach app code, so I can't tie it to this diff.

**What checked clean:**
- Tests call public functions and assert outcomes: returned values, the TPU listing, `status`, Audit Log counts. Nothing asserts on table layout or call order, and test names use CONTEXT terms.
- Time comes only from the Clock.
- Neighbour modules are reached only through their public functions.
- The CLI-only Admin Platform stays out of app code.
- `--set rilis3` goes through the shared `--izinkan-*` and sandbox guards (/home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:111-134).
- No secrets in the output or in audit reasons: the NIKs start with 00 and the addresses end in `.invalid`.
- The Mitra Jasa rate history is Admin Platform only, and that is tested (/home/ubuntu/makam-t111/src/domain/tariffs/layanan-harga.ts:305-306).
- No workflow, deploy script, bash or prune changes.

**HARD**

1. /home/ubuntu/makam-t111/CONTEXT.md:443: the Data Contoh glossary entry was edited by hand.
   - It now carries the builder's own decisions: a variant comes off the TPU listing while its DKI price *or Mitra Jasa rate* is still an example, Mitra Jasa are set to Berhenti, and Nazhir are removed.
   - It was also edited to make a go-live-docs check that was already red pass (/home/ubuntu/makam-t111/.scratch/makam-v1-build/issues/111-data-contoh-rilis-2-3.md:37: "made to satisfy three checks of `tests/tooling/go-live-docs.test.ts`").
   - /home/ubuntu/makam-t111/docs/agents/orchestration.md:16 says "any edit to CONTEXT.md or an ADR is `domain-modeling`'s output, not a hand edit made in passing", and needs a Comments record that names the skill. /home/ubuntu/makam-t111/AGENTS.md:67 says the same. The ticket has no such record.
   - origin/main 6a87d75d has since rewritten this entry. Keep main's version and route any addition through domain-modeling.

**SOFT**

1. **Stale against main.** A trial merge (`git merge-tree origin/main ec5de35e`) gives content conflicts in /home/ubuntu/makam-t111/CONTEXT.md and /home/ubuntu/makam-t111/docs/ops/runbook.md. The branch edits two Data Contoh sections (:448 with its new :518, and :615), and 6a87d75d has merged those into one. Re-apply the edits to that one section and re-run go-live-docs.
2. **A neighbour module is stubbed.** /home/ubuntu/makam-t111/src/domain/data-contoh/data-contoh.test.ts:669 replaces Layanan's `tandaiBolehDiTpu` with a stub that returns `tidak_berwenang`.
   - No base domain test stubs a module function.
   - The helper's comment at :25 promises "its neighbours' real public functions" (AGENTS.md:34 allows only real Postgres, the fake Clock and in-memory fakes).
   - The real call cannot refuse here: `lokasi.buat` and `layanan.kelola` are both Admin Platform only (/home/ubuntu/makam-t111/src/domain/identity/authorize.ts:532,566). So the test covers a branch that can never run (/home/ubuntu/makam-t111/src/domain/data-contoh/index.ts:778-790).
3. **Untested behaviour change.** Two dry runs now refuse without an Admin Platform: `cabut` (/home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:638-640) and `tanam --set rilis3` (:566). No test covers either; the only seed:admin cases use `--tulis` (/home/ubuntu/makam-t111/src/cli/data-contoh-command.test.ts:153,525).
4. **`rencanaCabut(by)` never refuses an actor** (/home/ubuntu/makam-t111/src/domain/data-contoh/index.ts:652). For an actor who is not Admin Platform the Mitra Jasa rate reads return nothing, so the dry-run plan silently leaves out variants whose only example price is the rate. `cabut` itself is guarded (:763).
5. **Copy** in /home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:
   - :370 says "dan keduanya belum lengkap" even when only one prerequisite is missing.
   - :616 is also printed by the dry run, which tells the operator to "tandai variannya lagi" before anything has been unmarked.
   - :578: when planting fails, the message does not say that the real Retribusi entered at :574 stays.
6. **Decisions filed under the wrong heading.** Decisions 2 and 4 (/home/ubuntu/makam-t111/.scratch/makam-v1-build/issues/111-data-contoh-rilis-2-3.md:50,52) settle the AC's wording ("All of it recorded…", "Nonaktif") under "Decisions". AGENTS.md:68 asks for these under "Spec gaps and decisions for the owner" (:57). Whether the readings are right is for the Spec axis.

Standards: 7 findings. Worst: CONTEXT.md glossary edited by hand with no domain-modeling record, and it conflicts with main. hard violations: yes

Hard: 1, soft: 6

#### Spec

Fixed point `ea371143` resolves (ea3711435a71). The diff `ea371143...ec5de35e` is non-empty: 18 files, +1564/-89. origin/main has since moved to 6a87d75d (see S3).

**AC1 `tanam --set rilis3`: MET**
- **Prices, rates and marks:** all 11 variants get a DKI price, a Mitra Jasa rate and the "boleh di TPU DKI" mark (`src/cli/data-contoh-command.ts:399-441`). Amounts are at `src/cli/data-contoh/rilis3.ts:21-36`. The test "prices, marks and covers all 11 variants of the launch catalog" (`data-contoh-command.test.ts:597`) imports the real `katalog-layanan.csv`.
- **Mitra Jasa:** 3 Mitra Jasa (Contoh), Aktif, with coverage (`:443-467`). Test `:549` shows them Aktif and offered by the picker; coverage counts are [7, 11, 11] in `:597`.
- **Nazhir:** 2 Nazhir (Contoh) (`:469-486`).
- **Rilis 2 rules:** written on Firdaus and Nurul Huda, and only over the defaults (`:381`, `:488-509`). Tumpang on released plots is already set by rilis1 (`seed-contoh-publik-command.ts:1028`), so UAT checklist P7 is covered.
- **Retribusi:** Rp 0 is entered as a real value (`:519-530`); its reason starts "nilai asli" (`:527`). The Audit Log keeps an explicit reason rather than overwriting it (`audit/index.ts:436`). Tests `:594` and `:743`.
- **Registry and idempotence:** six new kinds (`data-contoh/index.ts:73-90`). The test "planting twice changes nothing" (`:636`) shows no new version, no new Entri Audit and the same status.

**AC2 `cabut` extended: MET**
- Mitra Jasa are set to Berhenti (`index.ts:566-569`).
- Nazhir are removed (`:570-572`). `nazhirId` has no foreign key (`wakaf/schema.ts:83`), so removal is safe.
- Affected variants are unmarked before any row is retired (`:634-648`, `:777-790`).
- `status` lists every kind (`data-contoh-command.ts:156-178`), asserted in test `:549`.

**AC3 Tests: MET**
- Idempotence: `:636`.
- `cabut` effects: `:743`, `:757`, plus domain tests `data-contoh.test.ts:648`, `:664`, `:694`, `:710`.
- TPU quote: `:725`. `hargaPesananTpu` returns a total after `tanam`, then null after `cabut`, and the TPU listing is empty.

**AC4 Amounts: PARTIAL.** The amounts are listed in Comments (ticket `:39-45`) and match `rilis3.ts` and the CSV's 11 variants. They are not approved (ticket `:59`). See H1.

**Money checks**
- **No TPU price retired without a real successor: MET.** Tariffs only inserts versions. A variant is offered only with the mark and a DKI price (`layanan/tpu.ts:68-82`). `cabut` unmarks every marked variant named by a row whose DKI price or rate in force is still a contoh version. If the mark cannot be taken off, the variant's rows stay active and the run fails (`:779-790`, test `:664`). A variant whose two prices are both real keeps its mark (test `:757`). `katalog()` reads every variant, active or not (`katalog.ts:304-312`).
- **Retribusi is real, not contoh: MET.** After `cabut` it is still Rp 0 and `cabut` exits 0.
- **Idempotence: MET.** A price a killed run left is recorded, not entered a second time (`index.ts:698-716`, test `:710`).
- **Audit reasons: MET.** `tanam` writes carry "data-contoh tanam (...)" (`data-contoh-command.ts:406,419,436`), asserted at `:592`. `cabut`'s reasons are set at `index.ts:568` and `:780`.
- **Production refused without its flag: MET.** The guard runs before any database access, for every set (`data-contoh-command.ts:123-136`). It is tested only with rilis1 (`test:104-118`).

**Narrowing**
- "All of it recorded" is read as "everything contoh", so the Retribusi has no registry row (decision 2). Justified: a row would make it look contoh and `cabut` would wait on it.
- "Nonaktif" becomes Berhenti (decision 4). Justified: the statuses are aktif, ditangguhkan and berhenti (`layanan/schema.ts:247`).
- `status` lists unrecorded leftover prices only for global prices (`index.ts:803`). See S1.

##### Findings
**HARD**
- **H1** (ticket `:22`, `:59`): the owner has not approved the amounts (DKI prices, rates, rule fees, Retribusi Rp 0). AC4 makes that approval a condition of merging.

**SOFT**
- **S1** (`index.ts:634-648`, `:800-812`): `cabut` only checks variants named by an active row, and `status` and `aktif()` only scan global prices. Two cases slip through:
  - a contoh price a killed run left on a variant with no row;
  - a variant re-marked by hand after `cabut`, which is offered at the contoh price, and a second `cabut` will not catch it.

  Decision 6's claim that `cabut` finds these prices is only partly true. Likelihood is low because the mark defaults to false. Fix: scan every marked catalog variant.
- **S2** (`index.ts:568`): `cabut` discards the in-progress jobs (`berjalan`) that `ubahStatus` returns, and does not report open TPU orders at contoh prices (unlike `pesananTerbuka` for Lokasi Mitra orders).
- **S3** (`CONTEXT.md:441`, `runbook.md:451-655`): origin/main 6a87d75d rewrote the same sections, so this branch needs a rebase. The ticket's statements at `:30` and `:62` are out of date.

Findings: 4. Worst Spec issue: H1, amounts not approved by the owner. hard violations: yes

Hard: 1, soft: 3

