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

### Fix pass 1 (2026-10-04)

Answers to the round 1 review above, item by item. Each change went test first (a failing test, then the change); where the behaviour already existed, the test was shown to fail with the guard turned off. The earlier Build entry is left as written, so the line numbers the reviews quote still point at it.

**Standards**

- **HARD 1, CONTEXT.md edited by hand: undone.** The merge took main's (6a87d75d) Data Contoh entry unchanged: `git diff origin/main -- CONTEXT.md` is empty. What the hand edit added (a variant comes off the TPU listing, Mitra Jasa go to Berhenti, Nazhir are removed) is implementation, which the `domain-modeling` skill keeps out of the glossary ("a glossary and nothing else"); it lives in the runbook. This ticket makes no glossary edit, so no `domain-modeling` record is owed for one. A proposal for the owner, not an edit, is under "Spec gaps and decisions for the owner", item 5.
- **SOFT 1, stale against main: fixed.** `origin/main` merged into the branch twice: 6a87d75d (the state the reviews read; two conflicts: CONTEXT.md took main's, and the runbook took main's single Data Contoh section with this ticket's rilis3 edits re-applied to it) and then 552ef51a (ticket 114; clean). `go-live-docs`, `ticket-workflow`, `katalog-lama-runbook` and `image-retention` run after each step: 145 tests, exit 0.
- **SOFT 2, stubbed neighbour: fixed.** The case with the `tandaiBolehDiTpu` stub is removed. The branch it covered cannot be reached by a real call: Layanan refuses the mark only to an actor who is not Admin Platform, whom `cabut` has already refused, so no honest test exists. The branch stays, with a comment saying so (a rule Layanan adds later then stops the retirement instead of leaving a variant offered). The test helper's override is now used for one thing only: the Layanan composed by the setup, with the job port a test seeds (real functions).
- **SOFT 3, untested dry-run refusals: tests added.** "asks for seed:admin first for the dry run of cabut too", and the Rilis 3 case now runs with and without `--tulis`. They passed at once, so I turned the two guards off: both new tests failed (rilis1's own, guard untouched, passed); guards restored.
- **SOFT 4, `rencanaCabut(by)` never refused an actor: fixed.** It refuses an actor who is not Admin Platform (`tidak_berwenang`, `perlu_totp`) and answers `{ ok: true, ...plan }` otherwise; `cabut` is guarded as before. Test, red before: "refuses the dry run to an actor who is not Admin Platform…".
- **SOFT 5, copy: fixed, the three items.** (a) The refusal for a missing prerequisite no longer says "keduanya belum lengkap": it says "yang berikut belum ada" and lists only what is missing (test: launch data there, Lokasi (Contoh) not, no "keduanya" and no blame on the catalog). (b) The dry run of `cabut` tells the operator to enter the real prices "sebelum cabut --tulis"; only the real run says "tandai variannya lagi" (test). (c) A failed `tanam --set rilis3` says Retribusi Pemda IPTM "(nilai asli) tetap berlaku" and that the parts finished before stay recorded (test: a Mitra Jasa whose NIK someone else holds makes the run fail after the Retribusi went in).
- **SOFT 6, decisions under the wrong heading: re-filed.** Decisions 1 to 4 of the Build entry settle a reading of an AC; they are restated under "Spec gaps and decisions for the owner" below.

**Spec**

- **H1, amounts not approved: open, the owner's.** No amount changed in this pass (`src/cli/data-contoh/rilis3.ts` is untouched); the list in the Build entry stands and AC4 still waits for the owner.
- **S1, `cabut` scans only variants a row names: fixed for `cabut`; `status`, the banner and the preflight are not changed (item 6 below).** `cabut` and its dry run look at every variant offered now and take the mark off each whose DKI price or Mitra Jasa rate in force is still an example version, a row naming it or not; the Audit Log tells the example version, so a variant marked again after an earlier `cabut` and one whose price a killed `tanam` left unrecorded are both found. Tests, red before: "stops offering a variant somebody marked again after cabut…", "stops offering a marked variant whose DKI price is a contoh version no registry row names…", and in the command "takes a variant somebody marked again after cabut… at the next cabut, and the dry run lists it first". "never stops offering a variant the registry holds no price of" (an Operator's own, real prices) still passes.
- **S2, in-progress jobs and open TPU orders: the jobs fixed, the orders not.** `cabut` reports the jobs a Mitra Jasa (Contoh) still has in progress when it ends it (it leaves them to the Mitra Jasa, as `ubahStatus` does; the CLI lists them for reassignment). Test, red before: "reports the jobs a Mitra Jasa (Contoh) still has in progress when cabut ends it…" (the started job is listed, the not yet started one is released). Open TPU orders at example prices are not reported: no public read of open TPU orders exists (only a read of one order); see item 7 below. The CLI report and the runbook now say `cabut` cancels no order and to look in the Antrean first.
- **S3, stale: fixed** (Standards SOFT 1). Two statements of the Build entry are out of date, by design left as written: that `origin/main` lacks the Data Contoh module (main has had it since 6a87d75d), and the branch base.
- **Note, production flag tested only with rilis1: fixed.** The case now also runs `tanam --set rilis3` (with and without `--tulis`) and `cabut --tulis` on production and on staging without their flags.

**Spec gaps and decisions for the owner**

1. **Amounts: need the owner's approval before merge** (the list in the Build entry; to change one, name it, it is one file). Open since the Build entry.
2. **Reading of "All of it recorded in the 109 registry" (Build decision 2).** I read it as "everything contoh", so the Retribusi Pemda IPTM Rp 0, which the AC also makes a real value, has no registry row: a row would make it look contoh and `cabut` would wait on it and the banner stay on. If the owner meant a row for it too, say so; it changes what `cabut` waits for.
3. **Reading of "Mitra Jasa → Nonaktif" (Build decision 4).** I read it as Berhenti: the statuses in Layanan are aktif, ditangguhkan and berhenti, the glossary avoids "Nonaktif", and Ditangguhkan is reversible. Nazhir are removed (Wakaf has no deactivation).
4. **Reading of "no real successor version → that variant is no longer offered" (Build decisions 1 and 3).** `cabut` takes the variant off the TPU listing instead of refusing, and I extended the test to the Mitra Jasa rate (a variant offered at a real DKI price with an example rate would pay a Mitra Jasa an example amount). "The 11 variants" is every variant of the catalog. Say so if either reading is wrong.
5. **Glossary vs the TPU rule (for `domain-modeling`, not edited).** Main's entry says retiring a Data Contoh set waits until a real version has superseded a price entered. That is exactly true for the Biaya Layanan Platform; for the DKI prices and Mitra Jasa rates of this set the AC has retiring take the variant off the TPU listing instead. If the owner wants the glossary to say so, a code-free sentence such as "A Layanan variant at a TPU priced by a set is no longer offered, rather than waited for, while its price is still an example" would be `domain-modeling`'s output after the owner's word.
6. **What can see a variant offered at an example price.** Only `cabut` (the dry run included) scans every offered variant. `status`, the trial banner and the preflight's "data contoh" line read the registry and the global prices only: the banner runs on every page load, and a scan would cost two Audit Log reads per offered variant each time; `status` takes no Admin Platform to read the rates with. The runbook makes the dry run of `cabut` the check at go-live. If the preflight must also fail on a variant offered at an example price, it needs either a cheap Audit Log read (by action and reason) or a cached answer: the owner's call.
7. **Open TPU orders at example prices.** No public read of open TPU orders exists, so `cabut` cannot list them as it lists the orders at a Lokasi Mitra (Contoh). An additive read in Layanan (open TPU orders, by variant) would let it; not added here.
8. **Onboarding rows of the Mitra Jasa (Contoh)** (carried over, still open): Tier 4 "Onboarding Mitra Jasa" lists the three, and after `cabut` the Berhenti records stay in it. The owner's call between completing their onboarding in the set or having that row skip Berhenti records.
9. **The dry runs of `cabut` and of `tanam --set rilis3` need `seed:admin`** (Build decision 7), now tested and refused by the module for any other actor. Say so if the dry run of `cabut` must work on a stack with no Admin Platform; it would then skip the rate check and say so.

### Build (2026-10-04), fix pass 1

**What changed.** `src/domain/data-contoh/index.ts`: `rencanaCabut` refuses a non-Admin Platform actor (`RencanaCabutResult`), `cabut` and the dry run scan every offered variant (the plan no longer starts from the rows), `cabut` returns `pekerjaanBerjalan` (the jobs a Mitra Jasa (Contoh) had in progress), the comments say why the unmark-refusal branch stays. `src/cli/data-contoh-command.ts`: the three copy fixes, the report of the jobs left, the wording when the registry holds nothing but variants are offered, the TPU-orders hint, the header on the dry runs. Tests: `data-contoh.test.ts` (stub case removed, +4: second `cabut`, unrecorded price, refusal, jobs; a helper reads the plan), `data-contoh-command.test.ts` (+5 and three widened cases). Docs: the runbook's Rilis 2/3 subsection (what `cabut` scans, the jobs, the orders, where the check is). Merged `origin/main` (6a87d75d, then 552ef51a). CONTEXT.md is main's, byte for byte. No migration, no dependency, no change to Tariffs, Layanan or Wakaf.

**Decisions.**
1. A merge, not a rebase: a rebase would need a forced push, which this repository's rules do not give a builder. The two merge commits keep the review's fixed point reachable.
2. The dry run is refused with the same action as the writes (`lokasi.buat`), not a new one: Admin Platform is the only role that can read the rates, and a second action would be a second place to forget.
3. `cabut` scans every offered variant rather than extending `status` or `aktif()` (item 6 of the owner list): the cost and the missing actor are the reason, and `cabut` is the command that promises "exit 0 only when nothing contoh is left active".
4. The stub case is deleted and its branch kept (Standards SOFT 2): the module's other refusals of a neighbour (`cabutEntri`) are handled the same way and have no test either, for the same reason.
5. The jobs left in progress come back from `cabut`, not from the dry run: Layanan has no read of a Mitra Jasa's jobs apart from the status change that returns them.

**Tests** (read from whole logs). `npx vitest run` over `src/domain/data-contoh`, `src/cli/data-contoh-command.test.ts`, `src/cli/import-data-peluncuran-command.test.ts`, `src/domain/tariffs/layanan-harga.test.ts`, `src/app/api/browser-config`, `src/domain/layanan/mitra-jasa.test.ts`, `src/domain/layanan/penawaran.test.ts`, `src/domain/wakaf/nazhir.test.ts` and the tooling tests `data-contoh-bundle`, `go-live-docs`, `ticket-workflow`, `katalog-lama-runbook`, `image-retention`, `makam-preflight`: **14 files, 398 tests, exit 0**, 114.85 s, read from the whole log (the domain file alone 45 tests, was 42; the command file 40, was 35). `npm run typecheck` exit 0. `npm run lint` exit 0 (6 warnings, none in a file this ticket touches). Red before green for each new case (10 domain and 4 command cases failed before the change); the two dry-run guards turned off made their 2 new tests fail, and were restored.
- **Not run:** `npm run build`, the full suite, Playwright, CI, a real run on the staging database. The CLI's list of jobs left in progress is not driven through the command (a real TPU job in progress is a long fixture); the domain case covers what it prints from.

### Review (2026-10-04, round 2; fixed point ea371143, head 29f4ad5c)

Two review reports, pasted verbatim by the fix pass. Only their heading levels are lowered, so the entry stays inside `## Comments` (`tests/support/ticket-workflow.ts` ends a Comments section at the next `## ` heading).

#### Standards

**Scope.** The fixed point `ea371143` resolves (ea3711435a71), and `git diff ea371143...29f4ad5c` is not empty (27 files, +2631/−191).
- `origin/main` has moved to 552ef51a (ticket 114), and the branch merged it in 81d56bfd. Ten of the 27 files come from that merge and are byte-identical to main: `deploy/bin/*`, `tests/tooling/makam-*.test.ts`, `go-live-docs.test.ts`, `CONTEXT.md`, ticket 114 and the index, plus part of the runbook. `git diff origin/main 29f4ad5c` lists only ticket 111's 17 files.
- I gave main's deploy scripts a light check. Their new failure statuses go through `status()`, which ends in `|| true` (/home/ubuntu/makam-t111/deploy/bin/makam-deploy:171-174), so reporting cannot change a deploy's outcome. The diff has no workflow, prune or secret.
- Next round, pin the fixed point to 552ef51a (/home/ubuntu/makam-t111/docs/agents/orchestration.md:12).

**Tests.** I ran `npx vitest run src/domain/data-contoh/data-contoh.test.ts src/cli/data-contoh-command.test.ts src/domain/tariffs/layanan-harga.test.ts tests/tooling/go-live-docs.test.ts`: **exit 0, 4 files, 159 tests**, 54.7 s, on its own throwaway Postgres container. The log has two pg `client.query()` DeprecationWarnings, the same as round 1.

**Earlier findings**
1. **OK.** `git diff origin/main 29f4ad5c -- CONTEXT.md` is empty.
   - The fix pass says (/home/ubuntu/makam-t111/.scratch/makam-v1-build/issues/111-data-contoh-rilis-2-3.md:182): "HARD 1, CONTEXT.md edited by hand: undone. The merge took main's (6a87d75d) Data Contoh entry unchanged".
   - The proposed wording is now owner item 5 for `domain-modeling`, marked "not edited" (:204).
   - `go-live-docs` passes against main's entry, and its test file is main's, unchanged by this ticket.
2. **BELUM.** The ticket still says:
   - :22: "- [ ] **Amounts:** … approved by the owner before merge"
   - :192: "H1, amounts not approved: open, the owner's"
   - :200: "need the owner's approval before merge"

   `src/cli/data-contoh/rilis3.ts` is unchanged since ec5de35e, and no approval is recorded anywhere. Closing this needs the owner, not a code change. The builder filed it correctly under "Spec gaps and decisions for the owner" (/home/ubuntu/makam-t111/AGENTS.md:68).

**What the fix pass got right**
- **Stub removed.** The `ganti` override now swaps in only the setup's real Layanan, over the job port the test seeds (/home/ubuntu/makam-t111/src/domain/data-contoh/data-contoh.test.ts:25-28, :825). The assertion on `setup.pekerjaan.dilepas` (:840) follows the existing pattern at /home/ubuntu/makam-t111/src/domain/layanan/mitra-jasa.test.ts:329.
- **Outcome assertions only.** The new tests check returned results, the TPU listing, `status`, `globalTariff` and Audit Log counts. None adds `vi.fn`, `spyOn` or mocks, and none checks call order. The negative copy assertions (/home/ubuntu/makam-t111/src/cli/data-contoh-command.test.ts:553-555) match the real strings at /home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:368-369, so they do guard something.
- **Guards.** `rencanaCabut` refuses anyone who is not Admin Platform (/home/ubuntu/makam-t111/src/domain/data-contoh/index.ts:693-697), with a test at data-contoh.test.ts:730. `cabut` still checks the actor before `susunRencanaCabut` (index.ts:801-806).
- **Clock, logs and copy.** The added lines have no `new Date()`, `Date.now()` or `console` calls. `ReleasedJob` holds only id, target date and status (/home/ubuntu/makam-t111/src/domain/layanan/mitra-jasa.ts:60-64), so the printed job list has no personal data. The new copy is in Bahasa Indonesia.
- **Process.** The round-1 reports were filed in 27c064a4 (12:42), before the fix commits (13:00–13:21), as orchestration.md:15 requires. The ticket's status matches the index (:418).

**HARD**
1. (Carried from round 1, Spec H1.) The AC4 amounts are still not approved; see item 2.

**SOFT**
1. **The jobs copy names the wrong screen.**
   - /home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:639 says "tugaskan ulang lewat layar Layanan".
   - /home/ubuntu/makam-t111/docs/ops/runbook.md:557 says "reassigns them on the Layanan screen".
   - The app's own copy for the same event says the jobs go "ke Antrean untuk ditugaskan ulang" (/home/ubuntu/makam-t111/src/app/staf/admin-platform/mitra-jasa/mitra-jasa-forms.tsx:405-406).
   - The assign action is on the Pekerjaan TPU screen (/home/ubuntu/makam-t111/src/app/staf/admin-platform/pekerjaan-tpu/[pekerjaanId]/actions.ts:27). The Layanan screen has no assignment action.
2. **The jobs report has no command-level test.** No command test drives `laporanPekerjaanBerjalan` (/home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:635-642, called at :686 and :698), and the ticket says so (:222-223). The domain case (data-contoh.test.ts:821) checks only the data, not the printed list.

Standards: 3 findings (1 carried from Spec, 2 soft). Worst: the AC4 amounts are still not approved by the owner (carried from Spec H1); the fix pass adds no new hard violation. hard violations: yes

Hard: 1, soft: 2

#### Spec

**Range.** The fixed point `ea371143` resolves (ea3711435a71), and `git diff ea371143...29f4ad5c` is not empty (27 files, +2631/−191). That range also carries main's own commits, merged in at 900aba88 and 81d56bfd: 6a87d75d (MB3) and e0f85aa6/552ef51a (ticket 114: deploy/bin, the makam-* tooling tests, CONTEXT.md, go-live-docs). origin/main is now 552ef51a, and the head already contains it. Ticket 111's own change is `git diff origin/main 29f4ad5c` (17 files, +1945/−97), and that is what I judged below.

**Earlier findings, item by item**
1. **OK.** `git diff origin/main 29f4ad5c -- CONTEXT.md` is empty. The entry at /home/ubuntu/makam-t111/CONTEXT.md:443-444 is main's 6a87d75d text, with none of the Berhenti, TPU-listing or rate wording. The branch no longer touches go-live-docs.test.ts. Ticket :182: "The merge took main's (6a87d75d) Data Contoh entry unchanged". The proposed glossary sentence is parked for `domain-modeling`, marked "not edited" (:204). The edit at /home/ubuntu/makam-t111/docs/agents/orchestration.md:54 is a module note, not CONTEXT.md or an ADR.
2. **BELUM.** Ticket :192: "H1, amounts not approved: open, the owner's." Ticket :200: "need the owner's approval before merge … Open since the Build entry". The checklist line for plan C2/C3 at /home/ubuntu/makam-t111/.scratch/makam-v1-build/go-live-rilis-1.md:27 is still `[ ]`. rilis3.ts has not changed since ec5de35e.

**AC1 `tanam --set rilis3`: MET.** The "(owner confirms)" on Retribusi depends on AC4.
- **Prices, rates and marks:** a DKI price, a rate and a mark for every variant (/home/ubuntu/makam-t111/src/cli/data-contoh-command.ts:402-442). The mark goes only on a variant the set priced (:435). Test: `prices, marks and covers all 11 variants of the launch catalog` (data-contoh-command.test.ts:640).
- **Mitra Jasa, Nazhir and rules:** 3 Mitra Jasa, Aktif, with coverage; 2 Nazhir; the rules on Firdaus and Nurul Huda (:446-514). The test `plants the TPU prices with their marks…` (:592) asserts each of them.
- **Retribusi:** Rp 0 is entered with the reason `nilai asli…` (:522-533) and has no registry row (asserted at :629-637).
- **Registry and status:** six new kinds (/home/ubuntu/makam-t111/src/domain/data-contoh/index.ts:82-95), and `status` lists them (test :629-630).

**AC2 `cabut` extended: MET.**
- Mitra Jasa are set to Berhenti (index.ts:597-601). Nazhir are removed (:602-605), which the AC allows ("removed or deactivated").
- A variant is unmarked whenever its DKI price or rate in force is still contoh (:670-679, :815-825).
- `status` covers the new kinds.
- The reading of "Nonaktif" is S1.

**AC3 Tests: MET.**
- **Idempotence:** `planting twice changes nothing` (:679): no new Entri Audit, one version per price book, the same status.
- **`cabut` effects:** command tests :786, :831, :848; domain tests :616, :643, :658, :674, :691, :742, :798, :863.
- **TPU quote:** `a TPU quote succeeds after tanam and is unavailable again after cabut without a real price` (:768). `hargaPesananTpu` returns a total after tanam and null after cabut, and the TPU listing is empty.

**AC4 Amounts: PARTIAL.** The amounts are listed (ticket :39-45) and match /home/ubuntu/makam-t111/src/cli/data-contoh/rilis3.ts:21-39,119-122, but the owner has not approved them. See H1.

**Money checks**
- **No TPU price let go without a real successor: MET.** `cabut` looks at every offered variant (index.ts:671) and unmarks it before any of its rows is retired. If the unmark fails, those rows stay active and the run fails (:819-831). Only a real version counts as a successor (`versiContohBerlaku` :538-560). A variant is offered only with the mark and a DKI price (layanan/tpu.ts:74, :117). The rate history is gated on `tarif.ubah`, which is the same Admin Platform rule as the `lokasi.buat` guard (authorize.ts:532,561), so the rate check cannot fail open.
- **Retribusi is real, not contoh: MET.** The tanam-reason check (`olehTanam`, :468) is false for "nilai asli". An explicit reason wins over the default (audit/index.ts:436). The value survives `cabut` (test :786).
- **Idempotence: MET.** This includes a price a killed run left (:746; domain test :691) and taking over a Mitra Jasa or Nazhir a killed run left (command test :737).
- **Audit reasons: MET.** tanam's reasons are asserted (:635-637). On cabut, the unmark (:819), the Berhenti change (:599, test :816) and the registry rows all carry the run's reason. The Nazhir removal gets it only through the command's default (wakaf/nazhir.ts:105 has `reason: null`), and no test asserts it.
- **Production refused without its flag: MET.** The guard (data-contoh-command.ts:126-131) runs before any database access. It is now tested for the rilis3 dry run, rilis3 `--tulis` and `cabut --tulis` (:105-113).

**Narrowing.** None of it is silent. Each reading is filed for the owner (ticket :201-203): the Retribusi kept out of the registry, "every variant" of the catalog, and the rate included in the TPU check. Each is either conservative or reconciles two clauses of the AC.

**HARD**
- **H1** (re-review item 2; ticket :22, :192, :200; go-live-rilis-1.md:27): the owner has not approved the amounts (DKI prices, rates, rule fees, Retribusi Rp 0), and AC4 makes that approval a condition of merge.

**SOFT**
- **S1** (ticket :202; CONTEXT.md:69-71, :176; data-contoh-command.ts:455-461): owner item 3 picks Berhenti because "the glossary avoids 'Nonaktif'". But CONTEXT.md:71 lists Nonaktif as the word to avoid for **Ditangguhkan**. Berhenti is "ended for good", yet re-planting sets a Berhenti record back to Aktif, and no test covers that path. Restate item 3 accurately for the owner.

Findings: 2. Worst Spec issue: H1, the amounts are not approved by the owner (AC4). hard violations: yes

Hard: 1, soft: 1

### Fix pass 2 (2026-10-04)

Answers to the round 2 review above, item by item. The round 2 reports were filed first (ce4a6f28), then the fixes (90700a31). Each code change went test first; where the behaviour already existed, the test was shown to fail with the guard turned off. The earlier entries are left as written, so the line numbers the reviews quote still point at them. `origin/main` fetched in this turn is still 552ef51a and the branch contains it (81d56bfd): no merge was needed. The Standards review asks that the next round pin its fixed point to 552ef51a (Scope).

**Standards**

- **Earlier finding 1 (CONTEXT.md): OK, unchanged.** CONTEXT.md is main's, byte for byte, and this pass makes no glossary edit.
- **Earlier finding 2 and HARD 1 (AC4 amounts not approved): open, the owner's; this pass does not close it.** No amount changed (`src/cli/data-contoh/rilis3.ts` is untouched) and nothing a builder does can record an approval. The plan file (owner-approved 2026-10-04) says the TPU prices are dummy and the Retribusi Pemda is Rp 0 as a real value, but it names no amount for a price, a rate or a rule fee, so it is not the approval AC4 asks for. The go-live checklist line (`go-live-rilis-1.md:27`, plan C2/C3) is the owner's and stays `[ ]`. The sheet to approve is item 1 under "Spec gaps and decisions for the owner": one word ("setuju") or the one amount to change.
- **SOFT 1, the jobs copy named the wrong screen: fixed.** `cabut`'s list of the jobs a Mitra Jasa (Contoh) still has in progress now says "tugaskan ulang lewat layar Pekerjaan TPU" (it said "layar Layanan"), and the runbook says "on the Pekerjaan TPU screen". That screen holds the two actions: "Lepas untuk ditugaskan ulang" and "Tugaskan" (`pekerjaan-tpu/[pekerjaanId]/actions.ts`). The Layanan screen is where the real DKI price and rate are entered, so the two other "layar Layanan" in the same report (enter real prices) are right and stay. I did not take the app's "dikembalikan ke Antrean" wording: a job in progress has no Antrean row until Admin Platform releases the assignment (`lepasPenugasan`: the job "reappears in the Antrean as perlu penugasan ulang" only after that). One thing the line cannot do: the id after "pekerjaan" is the assignment's (the job port's id for a held job; the Entri Audit of the status change records the same ids under `pekerjaanBerjalan`), not the job's, and the Pekerjaan TPU screen lists a job by the Mitra Jasa's name and its target date; the line gives the Mitra Jasa's code and the target date for that.
- **SOFT 2, no command-level test of the jobs report: fixed.** A new command case drives a real job: a Karangan Bunga ordered at the first TPU, paid, handed to Agus Pratama (Contoh), who accepts it and takes the first photo (so it is Sedang Dikerjakan), all through Layanan's public functions with the helpers the TPU tests use; then `cabut --tulis`. It asserts the count line, the Pekerjaan TPU wording on that line (and not "layar Layanan"), the line with the Mitra Jasa's code and "target 2026-10-05", and, through the Mitra Jasa's own read (`pekerjaanTpuSaya`), that the job is still with them while they are Berhenti. Red before: it failed on the old wording. No stub and no seeded port: the command composes the real job port itself. The earlier Build entry called a real job in progress "a long fixture"; it is about 25 lines.

**Spec**

- **Earlier finding 1: OK. Earlier finding 2 and H1: open, the owner's** (as above).
- **S1, owner item 3 stated inaccurately: restated** (item 3 below), and the path it names is now tested. "takes up again the Mitra Jasa (Contoh) an earlier cabut ended when it plants again…": `cabut`, then the two Lokasi (Contoh) planted again (a Rilis 3 run builds on them and `cabut` retired them), then `tanam --set rilis3 --tulis`. The three Mitra Jasa are Aktif once more, there are three of them and no second set, `status` says `mitra_jasa: 3`, and the picker offers the same Mitra Jasa as before the `cabut` (and none while they were Berhenti). It passed at once (the behaviour existed), so I turned the reactivation branch off: it failed (`berhenti` three times where `aktif` was expected); restored.
- **Note (inside "Audit reasons", not a numbered finding): the Nazhir removal's reason is now tested.** "every Entri Audit a cabut writes after tanam --set rilis3, in whichever module, carries a reason naming the command…" reads the Audit Log across modules: the two Nazhir removals, the three Berhenti changes, the unmarks and the registry rows all carry a reason that begins `data-contoh cabut`. Red with the Audit Log's default reason dropped from the command's composition (the Nazhir removals then had none).

**Spec gaps and decisions for the owner** (the list after this pass; items 2 and 4 to 9 of the Fix pass 1 list stand as written there, item 3 is replaced by the one below)

1. **Amounts: need the owner's approval before merge. Open since the Build entry, unchanged by this pass.** The sheet, as `src/cli/data-contoh/rilis3.ts` has it at this commit (to change one, name it; it is one file):

   | What | Amount | Constant |
   |---|---|---|
   | DKI price a family pays at a TPU, per kind of Layanan (the 11 variants of the launch catalog) | bunga Rp 150.000 (Karangan Bunga Papan Standar, Paket Bunga Tabur Standar); nisan Rp 1.500.000 (the four Batu Nisan); pembersihan Rp 250.000 (Standar, Menyeluruh); perawatan Rp 350.000 (Standar); laporan Rp 75.000 (Foto, Foto & Video) | `HARGA_DKI_DATA_CONTOH` |
   | Mitra Jasa rate, what the Operator pays (never shown to a family) | bunga Rp 100.000; nisan Rp 1.000.000; pembersihan Rp 150.000; perawatan Rp 200.000; laporan Rp 50.000 | `TARIF_MITRA_JASA_DATA_CONTOH` |
   | Retribusi Pemda IPTM, a real value, not contoh | Rp 0 | `RETRIBUSI_PEMDA_IPTM_ASLI` |
   | Rilis 2 rules, Taman Makam Firdaus (Contoh) | Masa Tenggang 3 bulan, at most 3 terms per Perpanjangan, Ganti Pemegang Hak by sale allowed, its fee Rp 500.000 | `ATURAN_RILIS2_DATA_CONTOH` |
   | Rilis 2 rules, Makam Masjid Nurul Huda (Contoh) | Masa Tenggang 6 bulan, at most 2 terms, sale allowed, its fee Rp 250.000 | `ATURAN_RILIS2_DATA_CONTOH` |

3. **Reading of "Mitra Jasa → Nonaktif" (restated; replaces item 3 of Fix pass 1).** The AC says "Nonaktif". The glossary lists Nonaktif as the word to avoid *for Ditangguhkan* (CONTEXT.md:69-71: "A Mitra Jasa can be Ditangguhkan too: no new jobs until Admin Platform reinstates them. _Avoid_: Nonaktif, diblokir"), so my earlier reason ("the glossary avoids Nonaktif, and Ditangguhkan is reversible") was wrong: the avoidance points at Ditangguhkan, which means the AC's word, if it names a status at all, names the reversible one. The Mitra Jasa statuses are Aktif, Ditangguhkan (no new jobs, reversible) and Berhenti (ended for good). I built **Berhenti**, because `cabut` retires example data and "ended" is what a retired record is. What that costs: Berhenti is not final here. Planting `--set rilis3` again after a `cabut` takes the three Mitra Jasa (Contoh) back up to Aktif (now tested), and Admin Platform's own status form also lets a Berhenti Mitra Jasa go back to Aktif. What it does not change: `ubahStatus` releases the jobs not yet started and leaves the ones in progress for Ditangguhkan and Berhenti alike, and the picker offers an Aktif Mitra Jasa only (after `cabut` it offers none, tested). The owner's call: keep Berhenti (a `cabut` ends them, a later `tanam` revives them), or switch to Ditangguhkan (a `cabut` suspends them and a later `tanam` reinstates them, which is what the glossary describes for that status). Switching is one status word in `cabut` (`src/domain/data-contoh/index.ts`, where the Mitra Jasa are set to Berhenti) with its tests and the runbook.

### Build (2026-10-04), fix pass 2

**What changed.** `src/cli/data-contoh-command.ts`: one string, the screen the jobs report names. `src/cli/data-contoh-command.test.ts`: three new cases (43 in the file, was 40); the stack helper also returns the first TPU and `tanamLokasi` (it plants the two Lokasi (Contoh) and their registry rows, what a Rilis 3 run builds on), and the imports for the TPU order fixtures. `docs/ops/runbook.md`: the screen name, and one sentence saying Berhenti is not final for the three Mitra Jasa (Contoh). This ticket's Comments: the round 2 reports (ce4a6f28) and these two entries. No change in `src/domain`, no migration, no dependency; CONTEXT.md is main's.

**Decisions.**
1. No domain change: the three new cases describe existing behaviour, and the only code change is the copy.
2. The jobs report is tested with a real job, not a stub or a seeded port. The fixture is the TPU order flow the Layanan tests use (order, payment, assignment, acceptance, first photo); Pengaturan Operator is entered first because a Tagihan is headed with it.
3. The re-planting case plants the two Lokasi (Contoh) again before the second Rilis 3 run, because `cabut` retired them and a Rilis 3 run refuses without them (the existing prerequisite, with its own message and test). It does not run the whole Rilis 1 set again.
4. The Audit reason case accepts a reason that begins `data-contoh cabut`: an unmark carries the run's reason followed by its explanation.
5. HARD 1 / H1 (the amounts) is not touched: it is the owner's.

**Tests** (read from whole logs). `npx vitest run` over `src/domain/data-contoh`, `src/cli/data-contoh-command.test.ts`, `src/cli/import-data-peluncuran-command.test.ts`, `src/domain/tariffs/layanan-harga.test.ts`, `src/app/api/browser-config`, `src/domain/layanan/mitra-jasa.test.ts`, `src/domain/layanan/penawaran.test.ts`, `src/domain/wakaf/nazhir.test.ts` and the tooling tests `data-contoh-bundle`, `go-live-docs`, `ticket-workflow`, `katalog-lama-runbook`, `image-retention`, `makam-preflight`: **14 files, 401 tests, exit 0**, 116.48 s, on the tree of 90700a31 (it was 398 at fix pass 1: +3 command cases). `npm run typecheck` exit 0. `npm run lint` exit 0 (6 warnings, none in a file this ticket touches). Red before green: the jobs case failed on the old wording first; the re-planting case (reactivation branch off, the statuses stayed `berhenti`) and the Audit reason case (the default reason dropped, the Nazhir removals had none) were shown to fail with their guard off, then restored (`git diff` of the command file is the one-string change).
- **Not run:** `npm run build`, the full suite, Playwright, CI, a real run on the staging database.

