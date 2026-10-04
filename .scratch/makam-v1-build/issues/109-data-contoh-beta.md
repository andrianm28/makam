# Production beta shows marked example data (Data Contoh): registry, Rilis 1 set, one-command removal

Status: ready-for-agent
Blocked by: none (ADR 0007, written by 113 in parallel, records the decision; this ticket's Comments carry it meanwhile)
Spec: Release plan (beta); ADR 0006; ticket 101 (trial banner); `docs/ops/runbook.md` "seed-contoh-publik"; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

The owner decided (2026-10-04) that during the beta on the SumoPod sandbox, production shows **many clearly marked example records ("(Contoh)") across all releases, prices and tariffs included**, removable with **one command** before real operation. No real orders are taken during the beta (decision 3).

Today that cannot happen:
- `src/cli/seed-contoh-publik-command.ts:449` (and `src/cli/dev-seed-support.ts`) always refuses production.
- Rows flagged `dataContoh` are hidden from every public read and refused by the publish gate (`src/domain/lokasi/public-reads.ts:84,123`, `src/domain/lokasi/publish.ts:63`), so the existing flag cannot be the marker for visible dummy data.

Build a Data Contoh registry and command that:
- seeds a visible, marked Rilis 1 set on staging or production;
- records every entity it created;
- can retire all of it at once.

The Rilis 2/3 set follows in 111 on the same registry.

## Acceptance criteria

- [ ] **Registry:** new domain module `src/domain/data-contoh/`, a deep module with `index.ts` that owns its table (`schema.ts`, one migration). It records fixture code → entity kind and id, idempotently, on the `src/domain/katalog-lama/` ledger pattern. Added to the AGENTS.md module list.
- [ ] **CLI:** `src/cli/data-contoh.ts` with `-command.ts`, bundled as `dist/data-contoh.mjs` (the worker/migrate bundle like the other CLIs). Subcommands: `tanam --set rilis1`, `cabut`, `status`.
  - Dry run unless `--tulis`.
  - Staging needs `--izinkan-staging`, production `--izinkan-production`; each is refused without its flag (the `import-data-peluncuran-command.ts` precedent).
  - Needs `seed:admin` first and acts as the stack's first Admin Platform, the same CLI-only pattern as the existing seeds and imports. Every write carries an audit reason naming the command and the environment.
- [ ] **`tanam --set rilis1`** reuses the `seed-contoh-publik` machinery:
  - 5 Lokasi Mitra named "… (Contoh)", taken through the real publish gate (Denah and Petak, Jenis Makam tariffs, Kontak Siaga), so they appear on public pages.
  - Layanan switched on at each Lokasi, with Lokasi prices.
  - A contoh version of the Biaya Layanan Platform if none is set.
  - Staff on `.invalid` addresses.
  - Never writes Pengaturan Operator on production.
  - Running it twice changes nothing.
- [ ] **`cabut`** retires everything the registry holds:
  - Lokasi are flagged `dataContoh` (hidden, unpublishable, via `src/domain/lokasi/data-contoh.ts`); staff are deactivated.
  - A contoh price version must already be superseded by a real version; otherwise it is listed and the command exits 1.
  - Open orders on contoh Lokasi are reported.
  - Exit 0 only when nothing contoh is left active.
- [ ] **`status`** lists what is active per kind.
- [ ] **Marking:** every seeded name carries "(Contoh)". `/api/browser-config` serves `contohAktif`. The trial banner (`src/components/trial-payment-banner.tsx`) adds a second line while Data Contoh is active, worded and confirmed by the owner in Comments, e.g.: "Data bertanda (Contoh) dan harganya adalah contoh; pesanan masa uji coba tidak dilayani sungguhan."
- [ ] **Preflight:** a line "data contoh" in `makam-preflight`: SKIP while on the sandbox; FAIL if anything contoh is active and `SUMOPOD_BASE_URL` is not the sandbox host.
- [ ] **Tests:**
  - Domain, through the module's public interface: `tanam` twice is idempotent; `cabut` hides everything; `cabut` refuses while a contoh price is in force.
  - Command: refused on production without its flag; a dry run writes nothing.
  - `e2e/trial-payment-banner.spec.ts` extended for the contoh line.
- [ ] **Amounts:** the fixture amounts (Lokasi tariffs, Layanan prices, the contoh Biaya Layanan Platform) are listed in Comments and approved by the owner before merge.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB3; **money code: it writes tariffs and prices, so it is reviewed with opus and merged alone**). Owner decisions bind it:
  - beta on the sandbox, no real orders, no real Pencairan;
  - Data Contoh visible on production for all releases, prices included;
  - one-command removal before real operation.

### Build (2026-10-04)

Built on branch `ticket-109-data-contoh-beta`, based on 7415fdf7 (the orchestrator's `merge-mb1`: tickets 106-108, so `makam-preflight --rilis` exists); origin/main is still at 0fd6bf41.

**What changed**

- **Registry** `src/domain/data-contoh/` (`schema.ts`, `index.ts`, one expand-only migration `drizzle/0064_far_tombstone.sql`, a new table only). One row per fixture code, at most one *active* row per code (partial unique index), so `tanam` twice records nothing twice; a retired row frees its code. Public interface: `catat`, `tanam`, `rencanaCabut`, `cabut`, `status`, `aktif`. Two audit actions added (`data_contoh.tanam`, `data_contoh.cabut`, with labels). Added to the AGENTS.md module list; "Data Contoh" added to `CONTEXT.md`; runbook section "Data Contoh on the beta".
- **CLI** `src/cli/data-contoh.ts` + `data-contoh-command.ts`, bundled as `dist/data-contoh.mjs` (`scripts/build-worker.mjs`), `npm run data-contoh`. `tanam --set rilis1`, `cabut`, `status`; dry run unless `--tulis`; `--izinkan-staging` / `--izinkan-production`, each refused without its own flag. It reuses `seed-contoh-publik`'s machinery (`susunModul`, `seedOneLokasi` with a small recording hook, `undangPetugas` are now exported; the existing seed's behaviour is unchanged and its tests pass). The Rilis 1 set is `src/cli/data-contoh/rilis1.ts`.
- **Marking**: Lokasi, pengelola, Jenis Makam and Kontak Siaga names carry "(Contoh)". `/api/browser-config` serves `contohAktif` (true / false / **null** when the registry cannot be read: the browser reads null as "not active", the preflight as "unknown", so a failed read never passes for an empty registry). `src/lib/payment-trial.ts` gets `fetchBrowserTrial` and `barisBanner`; the banner shows the second line only inside the trial banner. `ServerRuntime` gets `dataContoh`.
- **Preflight** `makam-preflight`: line `[109] data contoh`. SKIP while `SUMOPOD_BASE_URL` names the sandbox host; otherwise it asks the running stack's `/api/browser-config`: FAIL if `contohAktif` is true, PASS if false, SKIP (never PASS) when it cannot tell.
- Small additive changes outside the new module: Pemesanan's barrel exports `pesananBerjalanDiLokasi` (as it already exports `pernahMenyebutPetakAtauKavling`); the Layanan module gets `createPenawaranLayanan` (catalog read + `tawarkanLayanan`/`stopLayanan` with only `db`, `clock`, `audit`, `tariffs`, the way `createKatalogLayanan` serves the launch import).

**Decisions** (each is the conservative reading; none rewords a requirement)

1. **`cabut` is all-or-nothing on a blocked price.** While a contoh global price is still the version in force it retires nothing and exits 1 listing the price; once a real version is in force it retires everything. Reading of "must already be superseded".
2. **The supersede rule applies to global prices** (here the Biaya Layanan Platform; ticket 111's DKI prices and Mitra Jasa rates will join it). A price tied to a contoh Lokasi Mitra (Jenis Makam tariffs, Biaya Pemakaman, Layanan Lokasi prices) retires with its Lokasi: it cannot be quoted once the Lokasi is hidden, and no one enters a "real successor" for a hidden Lokasi.
3. **`tanam` never overwrites a real price.** The platform fee is entered only when none is set at all; a Layanan variant is switched on only where the Lokasi has no price for it; the set's own Lokasi prices are written once, when the Lokasi is created. A rerun never reconciles prices (unlike `seed-contoh-publik`).
4. **A build cut short is retired, then built afresh.** The Lokasi is recorded the moment it is created (unfinished); on failure `tanam` retires what that fixture had made (Lokasi hidden, its Admin Lokasi Akun deactivated), and a rerun does the same for an unfinished entry left by a killed process. After a `cabut`, `tanam` plants a new generation. A rerun inside a minute may answer `tunggu_kirim_ulang` (Identity's Kode Masuk resend window); wait and run again.
5. **Open orders are reported, not blocking.** `cabut` lists Pemesanan's running orders (Terencana Diajukan/Dikonfirmasi/Aktif, Saat Duka Diajukan/Dikonfirmasi) at contoh Lokasi and still retires; exit 0 depends only on nothing contoh being left active. Layanan jobs and Tagihan are not listed.
6. **The Layanan step never creates catalog entries.** `hapusLayanan` refuses a Layanan any offering names (stopped ones included), so an example Layanan could never be removed from the global catalog. The set switches on the catalog that exists; with an empty catalog `tanam` says so and a later `tanam` (after `import:data-peluncuran`) adds them.
7. **Extra guard, not in the AC:** `tanam` on production is refused unless `SUMOPOD_BASE_URL` is the sandbox host, so example records are never planted beside real operation. `cabut` and `status` have no such rule. Drop it if you disagree.
8. Staff are new `.invalid` Akun (`data-contoh.<lokasi>@contoh.makam.invalid`, `petugas.data-contoh@…`) with phone numbers distinct from `seed-contoh-publik`'s, so a stack that ran the older seed keeps its own five unmarked Lokasi untouched; `cabut` does not know them (on staging, hide them with `tandaiDataContoh` by hand if wanted).

**Spec gaps and decisions for the owner**

- **Amounts to approve** (all in `src/cli/data-contoh/rilis1.ts`; clearly round, and every Hak Pakai at or under Rp 9.000.000 so that with the platform fee it stays within the Rp 10.000.000 QRIS cap and still shows on the public page). The tenures are the prototype's own.
  - Biaya Layanan Platform (contoh, only when none is set): **Rp 100.000**.
  - Biaya Pemakaman at every contoh Lokasi: **Rp 1.000.000**, tumpang **Rp 500.000**.
  - Hak Pakai / Perpanjangan per Jenis Makam (all named "… (Contoh)"):
    - Taman Makam Firdaus: Makam Standar 20 th 5.000.000 / 2.000.000 (scheduled 6.000.000 from 1 Januari 2027); Makam Taman 20 th 8.000.000 / 3.000.000; Makam Selamanya 9.000.000 / none.
    - Pemakaman Wakaf Al-Ikhlas: Makam Umum (selamanya) 3.000.000 / none; Kavling Keluarga 2 Petak (selamanya) 6.000.000 / none.
    - Makam Masjid Nurul Huda: Makam Umum 10 th 2.000.000 / 1.000.000.
    - Taman Peristirahatan Hijau Asri: Makam Standar 25 th 5.000.000 / 2.000.000; Makam Taman 25 th 8.000.000 / 3.000.000 (no Tersedia Petak, as in the prototype); Kavling Keluarga 4 Petak 25 th 9.000.000 / 4.000.000.
    - Pemakaman Bukit Sejuk: Makam Standar 15 th 4.000.000 / 2.000.000.
  - Layanan Lokasi price, one amount per kind of Layanan for every variant of it: bunga **100.000**, nisan **1.000.000**, pembersihan **200.000**, perawatan **300.000**, laporan **50.000**.
- **Banner wording to confirm.** Built with the AC's own example: "Data bertanda (Contoh) dan harganya adalah contoh; pesanan masa uji coba tidak dilayani sungguhan." (`BARIS_DATA_CONTOH`, `src/lib/payment-trial.ts`), shown under the first line only while Data Contoh is active.
- **"Every write carries an audit reason."** Every write whose module takes a reason carries `data-contoh <subcommand>` plus `(staging, --izinkan-staging)` or `(production, --izinkan-production)`: the Lokasi creation, Jenis Makam and platform-fee tariffs, staff invites, the registry rows, `tandaiDataContoh`, `deactivateStaff`, `tawarkanLayanan`. The Lokasi and Field Work writes whose public functions have no reason field (agreement scan, Jam Operasional, Kontak Siaga, document checklist, policies, publish, the two Tugas Lapangan, Terencana switch) keep recording an Entri Audit without one: that machinery is unchanged.
- **Layanan depends on the catalog** (decision 6): load the launch catalog first, or accept that a Lokasi (Contoh) shows no Layanan until the next `tanam`.

**Tests** (read from whole logs): `npx vitest run` over every touched path, 17 files, 338 tests, exit 0. New or extended: `src/domain/data-contoh/data-contoh.test.ts` (14: registry idempotency, one active entity per code, Admin Platform only, `tanam` twice, nothing-to-plant, cut-short build, replant after `cabut`, `cabut` hides everything, `cabut` idempotent, refuses while a contoh price is in force and lists it, goes ahead once superseded, reports running orders, dry-run plan), `src/cli/data-contoh-command.test.ts` (17: refused without its flag on production/staging, no plant on live production, usage, no Admin Platform, dry run writes nothing, five Lokasi (Contoh) incl. two with Terencana on, example prices, `.invalid` staff, audit reasons incl. staging, Layanan switched on and never re-priced, twice changes nothing, failed build retired and replanted, `cabut` refusal / dry run / success), `src/app/api/browser-config/route.test.ts` (+3), `src/lib/payment-trial.test.ts` (+5), `tests/tooling/makam-preflight.test.ts` (+4, 58 in the file), `tests/tooling/data-contoh-bundle.test.ts` (4, the bundle run alone as the image has it). `npm run lint` exit 0 (6 warnings, all in files this ticket does not touch), `npm run typecheck` exit 0, `npm run build` once, exit 0, then `.next` and `dist` removed.
- **Not run here:** the Playwright cases added to `e2e/trial-payment-banner.spec.ts` (they need a stack; they answer `/api/browser-config` with `page.route`), the full suite, CI, the migration expand/contract job (new table only), a real production or staging run of the command (the production `FileStore`/S3 and the live SMTP are out of reach; the refusals and the policy function are tested).

### Review (2026-10-04, round 1; fixed point 7415fdf7, head 6377d194)

Two review reports, pasted verbatim by the fix pass. Only their heading levels are lowered, so the entry stays inside `## Comments` (`tests/support/ticket-workflow.ts` ends a Comments section at the next `## ` heading).

#### Standards

Fixed point 7415fdf7 is origin/main, and `git diff 7415fdf7...6377d194` is not empty (35 files). I ran the ticket's six new or changed Vitest files with `npx vitest run`: 6 files, 112 tests, exit 0, 69 s, read from the complete log. The worktree was clean afterwards. The Playwright cases were not run because they need a stack.

**Hard**

1. `src/cli/data-contoh-command.test.ts:104-107`: the test "never enters Pengaturan Operator on production" checks `pengaturanOperatorBolehDiisi` (`src/cli/data-contoh-command.ts:53`) instead of the result.
   - That function is exported only for this test; its one real caller is `:257`. AGENTS.md Tests says never assert on private helpers.
   - If the guard at `:257` is deleted, the test still passes, so this AC has no test of its outcome.
   - Production is wired like staging: disk FileStore (`src/composition/adapters.ts:70-74`), `susunModul` swaps in a fake email sender (`seed-contoh-publik-command.ts:467`), and env.ts has no production-only checks.
   - So the test can do what the staging case at `:164` does: run `tanam --tulis --izinkan-production` with `stagingEnv()` plus `APP_ENV=production` and the sandbox `SUMOPOD_BASE_URL`, then assert `operatorSettings.current()` is still null.

**Soft**

1. `deploy/bin/makam-preflight:654-656`: the check for "payments are a trial" is an exact string match copied from `check_sumopod_key` (`:474-475`).
   - The app compares hosts instead (`src/lib/env.ts:399`), and `check_rilis` strips the quotes and spaces that Compose removes (`:609`).
   - So a quoted value, or a URL with a path, that the app reads as a trial makes this line FAIL and tell the owner to run `cabut --tulis` in the middle of the beta.
   - It also lacks `check_rilis`'s `[ ! -r "$ENV_FILE" ]` guard, so an unreadable env file is treated as live payments.
   - Fix: one shared helper for both checks.
2. `src/app/api/browser-config/route.ts:25,28-33`: this route also gives the browser its Sentry DSN (`src/instrumentation-client.ts:31`), and it now waits on a database read.
   - The try/catch handles errors but not hangs, and the pool has no connection timeout (`src/db/client.ts:17-21`).
   - Fix: give the read a short time limit and return null when it runs out.
3. `src/lib/payment-trial.ts:31`: `fetchPaymentTrial` is now called only by its own tests. The banner was its only caller on main.
4. `docs/ops/runbook.md:2088` and the table at `2126-2142`: the "Production preflight" section lists every check and ticket, but nothing for `[109] data contoh`. The script's header comment was updated.
5. Comments that don't match their assertions:
   - `src/domain/data-contoh/data-contoh.test.ts:193` says a contoh Lokasi "can no longer be published again", but nothing checks that.
   - `src/cli/data-contoh-command.test.ts:150` talks about all-in prices above an assertion on the Tersedia count.
6. `src/cli/data-contoh-command.test.ts:271` sets `{ timeout: 600_000 }`. The whole six-file run took 69 s, and the similar seed test uses 120 s (`seed-contoh-publik-command.test.ts:156`). A 10-minute timeout would hide a hang.
7. `src/domain/data-contoh/index.ts:210,336,342` throw ZodErrors on bad input (`.parse`), while `cabut` (`:400`) returns `alasan_wajib`. The Katalog Lama ledger this module follows uses `safeParse` (`src/domain/katalog-lama/index.ts:115`).
8. `AGENTS.md:24`: the module-list entry includes a description. Line 13 says the file "holds only rules", and module notes were moved to `docs/agents/orchestration.md:54`.

**Checked and clean**
- No secrets in any output.
- No unnamed `prune`.
- No workflow or image changes.
- The migration only adds a table and indexes.
- The module reads only its own table, and time comes only from the Clock.
- The client import rule is kept.
- The banner line and the audit labels are in Bahasa Indonesia.
- The preflight is only installed (`deploy/install-host.sh:62`), never run during a deploy, so the best-effort rule doesn't apply.
- The gitleaks allowlist matches by value, so the reused test keys are covered.

9 findings. Worst (Standards): the "never writes Pengaturan Operator on production" AC is tested through a test-only helper, not by checking the result. Hard violations: yes.

Hard: 1, soft: 8

#### Spec

Worktree `/home/ubuntu/makam-t109`; paths below are relative to it. The fixed point `7415fdf7` resolves and equals `origin/main`. `git diff 7415fdf7...6377d194` is non-empty: 35 files, 2 commits. Spec: `.scratch/makam-v1-build/issues/109-data-contoh-beta.md`.

##### Acceptance criteria
- **Registry: MET.** `src/domain/data-contoh/{index,schema}.ts`, plus one migration (`drizzle/0064_far_tombstone.sql`) with a partial unique index on `kode` for active rows. `catat` is idempotent (index.ts:207-251; test "records a fixture code once…") and uses the katalog-lama idioms (`onConflictDoNothing`, `staffWrite`, its own audit action). Listed at AGENTS.md:24.
- **CLI: PARTIAL.**
  - Entry file plus `-command.ts`; `scripts/build-worker.mjs:17` builds `dist/data-contoh.mjs` (bundle test).
  - Subcommands at command:84-93; dry run unless `--tulis` (:251, :303).
  - Each environment needs its own flag, checked before any DB access (:100-105). This matches `import-data-peluncuran-command.ts:481-490`.
  - `seed:admin` required (:253, :310).
  - The reason names the command and the environment (:115-117), but not on every write (H4).
- **tanam: MET** (S2).
  - Reuses `seedOneLokasi`, `susunModul` and `undangPetugas` through hooks (seed-contoh-publik-command.ts:937-1058).
  - Test "plants the five Lokasi Mitra…": 5 listed publicly, all "(Contoh)", 2 with Terencana on.
  - Layanan get Lokasi prices (command:200-225). The platform fee is entered only when none is in force (:150-162).
  - Staff are on `.invalid` addresses (rilis1.ts:33,103).
  - No Pengaturan Operator on production (command:257); only the policy function is tested.
  - Test "planting twice changes nothing".
- **cabut: PARTIAL.**
  - Hides each Lokasi with `tandaiDataContoh` and deactivates staff (index.ts:280-287; test "hides every Lokasi Mitra…").
  - A contoh price in force is listed, nothing is retired, exit 1 (index.ts:403-406; command:306,320; domain and command tests).
  - Running orders are reported (index.ts:302-311). Exit 0 only when nothing is left (index.ts:415-417).
  - The supersede rule can be bypassed through `tanam` (H1).
- **status: MET.** command:136-140; test "…lists what is active per kind".
- **Marking: PARTIAL.** Names are marked (rilis1.ts:85-106). `contohAktif` returns true, false or null (route.ts; 3 route tests). The second line (`barisBanner`) shows only inside the trial banner. The owner has not confirmed the wording (H3); see also S6.
- **Preflight: MET** (S1). makam-preflight:652-671: sandbox gives SKIP (:656), true gives FAIL (:669), false gives PASS (:668), anything else gives SKIP (:670). 4 tests.
- **Tests: MET** (S5).
  - Domain: "planting twice creates every fixture once", "hides every Lokasi Mitra…", "refuses while a contoh price is still in force…".
  - Command: "refuses production without --izinkan-production…", "is a dry run without --tulis…" (for tanam and cabut).
  - e2e: 3 new cases.
- **Amounts: NOT MET** (H2).

##### Money-code checks
- **cabut never retires a price without a real successor:** correct inside `cabut` (it compares the version in force via `inForceAt`, and backdating is refused). It can be bypassed through `tanam`'s cleanup (H1).
- **Nothing seeded becomes a real Pencairan without staff action: MET.** `tanam` creates no Pemesanan, Tagihan or payout item. A Pencairan is a manual transfer by Admin Platform (payouts/index.ts:181). On production, `tanam` requires the sandbox host (command:107).
- **Every write audited with command and environment:** PARTIAL (H4).
- **Production refused without `--izinkan-production`: MET.** command:100-102; tests at command-test:78 and bundle:44.
- **tanam idempotent: MET**, apart from the H1 path.
- **Preflight FAIL when non-sandbox:** MET when the stack answers (S1).
- **Migration expand-only: MET.** One CREATE TABLE and two indexes. The 0064 snapshot differs from 0063 only in `id`/`prevId` and the new table.

##### Findings
**HARD**
- **H1: `tanam` can drop a contoh global price from the registry without the supersede check.**
  - `cabutEntri` lets `tarif_global` fall through to `tandaiDicabut` (index.ts:288), assuming "`cabut` proved it superseded" (:279). But `tanam` reaches it via `cabutPohon` for a cut-short entry (:350) and after a failed build (:367, :375).
  - Scenario: run 1 writes the fee and records it unfinished (command:153-160), then dies before the separate `selesaiPada` update (index.ts:386-389).
  - Run 2 retires that row. The fee fixture then sees a version in force and records nothing (command:152).
  - Result: the Rp 100.000 contoh fee stays in force with no active row. `cabut` exits 0, `contohAktif` is false, and the preflight PASSes on the live host.
  - A crash between `setGlobalTariff` and `catatInduk` ends the same way. No test covers this.
  - Fix: check supersession inside `cabutEntri`. In the cut-short path, complete the row instead of retiring it. Make the fee fixture record its own unrecorded version.
- **H2: Amounts not approved by the owner** (ticket :82-91). The AC requires approval before merge.
- **H3: Banner wording not confirmed by the owner** (ticket :92).
- **H4: Audit-reason narrowing.**
  - These writes carry no reason: agreement, Jam Operasional, Kontak Siaga, Tugas Lapangan, publish, checklist, policies, Terencana (seed-contoh-publik-command.ts:953-1054).
  - The `selesaiPada` update writes no Entri Audit at all.
  - On production these writes are attributed to the real first Admin Platform. The builder flagged this; it needs the owner's acceptance or a reason threaded through.

**SOFT**
- **S1:** When it cannot tell, the preflight SKIPs instead of FAILing on a non-sandbox host (:670), so a go-live run exits 0 without proving the registry empty.
- **S2:** With an empty catalog no Layanan is switched on (decision 6, command:272).
- **S3:** `hargaBerlaku` misses a future-dated contoh version (index.ts:319-320). This matters for ticket 111.
- **S4:** Decision 7's production-sandbox refusal is not in the AC; the owner should confirm it.
- **S5:** The new e2e cases have not been run.
- **S6:** Denah Blok names are seeded without "(Contoh)" (seed-contoh-publik-command.ts:328-399).

Findings: 10. Worst: H1, after an interrupted `tanam` the contoh platform fee can stay in force unrecorded, so `cabut` exits 0 and the preflight passes. Hard violations: yes (must fix before merge; none breaks an AGENTS.md rule).

Hard: 4, soft: 6

### Fix pass 1 (2026-10-04)

Answers to the round 1 review above, item by item. Each fix went test first (a failing test, then the change); where the behaviour already existed the test was shown to fail without it.

**Standards**

- **Hard 1, the production test checked a helper: fixed.** `pengaturanOperatorBolehDiisi` is gone (the guard is one inline line). The case is now "on production, with its flag and the SumoPod sandbox, plants the set but never enters Pengaturan Operator, and names the environment in every write": `stagingEnv()` plus `APP_ENV=production` and the sandbox `SUMOPOD_BASE_URL`, `tanam --tulis --izinkan-production`, then `operatorSettings.current()` is still null and every new Entri Audit has the reason `data-contoh tanam (production, --izinkan-production)`. Mutation check: with the guard turned into `|| true` the test failed (`expected {…} to be null`); restored.
- **Soft 1, preflight string match: fixed.** One helper `payments_are_trial` in `makam-preflight`, asked by `check_sumopod_key` and `check_data_contoh`: the host of `SUMOPOD_BASE_URL` after Compose's quotes and padding are removed, a path or capital letters ignored, a scheme required (a bare host is not a URL, so not a trial, as in `paymentsAreTrial`). `check_data_contoh` now has `check_rilis`'s guard: an unreadable env file is a SKIP "needs the env file (above)", the stack is not asked. Tests: quoted, single-quoted, path and padded/uppercase values still SKIP on both lines; a non-URL value is asked of the stack; no env file.
- **Soft 2, hanging read: fixed.** The route gives the registry read 2 s (`Promise.race`) and answers null when it runs out. Test with fake timers and a read that never answers.
- **Soft 3, `fetchPaymentTrial`: removed.** Its ticket 101 tests keep their names and assertions and ask `fetchBrowserTrial(...).paymentTrial`.
- **Soft 4, runbook: fixed.** "Production preflight" lists ticket 109 and has the `data contoh` row (and says a SKIP there at go-live proves nothing); the Data Contoh section says what a cut-short fee and a future-dated price do.
- **Soft 5, comments: fixed.** Domain: the claim is now a test, "leaves a Lokasi Mitra it has retired unpublishable" (the publish gate answers `data_contoh_tidak_bisa_diterbitkan`). Command: the comment says what the assertion checks (three Petak Tersedia).
- **Soft 6, timeout: fixed.** 600 s became 120 s, like the older seed's test.
- **Soft 7, `.parse`: fixed.** `safeParse` throughout. A blank reason is `{ ok: false, reason: "alasan_wajib" }` from `catat` and `tanam`, as `cabut` already answered. A code, set or id that is not one is the plan's own bug, so a clear `Error("Data Contoh: kode tidak valid: …")`, as the Katalog Lama ledger throws. A `tarif_global` entity that is not `<key>:<version>` is refused at `catat` (it would have broken every later `cabut`).
- **Soft 8, AGENTS.md: fixed.** The module list names `data-contoh` only; the note moved to `docs/agents/orchestration.md` ("Domain module notes").

**Spec**

- **H1, `tanam` could drop a contoh price from the registry: fixed, the three parts the reviewer named.**
  - `cabutEntri` refuses a `tarif_global` row while its version is, or will be, in force, whoever asks (`cabut`, or `tanam` cleaning up a cut-short or failed fixture). The row stays active and the failure is reported.
  - A cut-short `tarif_global` row whose price is in force is finished (counted `sudahAda`), not retired. One whose price a real version has since superseded is retired and rebuilt, as before.
  - The fee fixture records a contoh version a killed run entered but never recorded. It tells it from a real fee by the Audit Log: the Entri Audit at the version's place in the entry order (one is written with each version) has a reason starting `data-contoh tanam`. An Operator's own fee is never adopted (the existing test "does not enter the contoh Biaya Layanan Platform when a version of it is already set"). I chose the Audit Log over matching the amount because a real fee of Rp 100.000 would otherwise be adopted as example data. If the version count and the entry count differ it adopts nothing.
  - Tests: domain "a tanam cut short after the platform fee was entered finishes the fee…" (red before), "retires a cut-short fixture whose price a real version has since superseded…" (guards the other branch), command "records the contoh Biaya Layanan Platform a killed tanam left unrecorded…" (red before).
- **H2, amounts not approved: open, the owner's.** No amount changed in this pass; the list in the Build entry stands.
- **H3, banner wording not confirmed: open, the owner's.** `BARIS_DATA_CONTOH` is unchanged.
- **H4, audit reasons: fixed, without changing Lokasi or Fieldwork.** The Audit Log takes an optional default reason (`createAuditLog({ …, alasanBawaan })`, passed by `composeIdentity` and by `susunModul`'s fourth argument). `data-contoh` composes its modules with the run's reason, so every Entri Audit of a run that has none of its own carries `data-contoh <subcommand> (<environment>, <flag>)`: agreement, Jam Operasional, Kontak Siaga, both Tugas Lapangan, publish, checklist, policies, Terencana, the Denah, and whatever ticket 111's set adds. `web` and `worker` pass none, so they are unchanged. The finishing mark is now audited too (`data_contoh.selesai`, "Data Contoh selesai ditanam"). Tests: the Audit Log's two cases; command "every Entri Audit a tanam writes, in whichever module, carries a reason naming the command and the environment" (staging) and the production case above (red before). The "spec gap" the Build entry reported on this is closed. The writes are still attributed to the stack's first Admin Platform: that is the CLI pattern the AC asks for.
- **S1, SKIP when it cannot tell: no code change.** The AC says FAIL when something contoh is active, and "cannot tell" is not "active". The runbook now says the line has to read PASS at go-live. **For the owner**: if a non-sandbox host that cannot be asked should FAIL instead, say so; it is one line.
- **S2, empty catalog switches on no Layanan: no change.** Decision 6 stands; the owner's call.
- **S3, future-dated contoh version: fixed.** A contoh price counts as live when it is the version in force at the later of now and its own date, so a scheduled contoh version blocks `cabut` until a real version for that date takes over (the hint says so). Test (red before).
- **S4, decision 7 (production refuses `tanam` beside live payments): no change, the owner to confirm.**
- **S5, e2e cases not run: still not run** (they need a stack); the new Vitest cases cover the route and the banner lines.
- **S6, Denah Blok names: fixed.** `sebagaiDataContoh` marks the Blok names "(Contoh)"; test over `LOKASI_RILIS1` (red before: "Blok Utama").

### Build (2026-10-04), fix pass 1

**What changed.** Data Contoh module (`src/domain/data-contoh/index.ts`): the price check inside `cabutEntri`, the cut-short completion, scheduled-version check, `safeParse`, audited finishing. Audit module and `composeIdentity`: the optional default reason. `src/cli/data-contoh-command.ts` and `data-contoh/rilis1.ts`: the fee adoption, the run's default reason, the inline production guard, marked Blok names, the hint. `deploy/bin/makam-preflight`: `payments_are_trial`. `src/app/api/browser-config/route.ts`: the time limit. `src/lib/payment-trial.ts`: the dead wrapper removed. Docs: runbook, AGENTS.md, `docs/agents/orchestration.md`, `src/lib/lokasi-labels.ts` (label for `data_contoh.selesai`). No migration, no new dependency.

**Decisions.**
1. For H4 an explicit default reason on the Audit Log of one run, not an `options.reason` threaded through nine Lokasi and Fieldwork functions (a new function would silently miss it) and not ambient state such as `AsyncLocalStorage` (hidden state in a domain module).
2. The fee fixture adopts by the Audit Log, not by amount (see H1).
3. A price in force is never let go of by the registry: not by `cabut`, not by cleanup.

**Tests** (read from whole logs). `npx vitest run` over `src/domain/data-contoh`, `src/domain/audit`, `src/cli/data-contoh-command.test.ts`, `src/cli/seed-contoh-publik-command.test.ts`, `src/app/api/browser-config`, `src/lib/payment-trial.test.ts`, `tests/tooling/makam-preflight.test.ts`, `data-contoh-bundle.test.ts`, `katalog-lama-runbook.test.ts`, `image-retention.test.ts`, `ticket-workflow.test.ts`: 11 files, 226 tests, exit 0, 169 s, read from the whole log (the Data Contoh domain file alone ran 20 tests, the Audit Log file 10, the preflight file 62). `npm run lint` exit 0 (the same 6 warnings, none in a file this ticket touches), `npm run typecheck` exit 0. No `npm run build`, no full suite, no Playwright.

### Review (2026-10-04, round 2; fixed point 7415fdf7, head a74063ea)

Two review reports, pasted verbatim by the fix pass. Only their heading levels are lowered, so the entry stays inside `## Comments` (`tests/support/ticket-workflow.ts` ends a Comments section at the next `## ` heading).

#### Standards

Re-review of fix pass 1 (58afbe37, a74063ea). The fixed point 7415fdf7 resolves and is an ancestor of origin/main (now c04dd9c9). `git diff 7415fdf7...a74063ea --stat` is non-empty: 38 files.

**Tests were not run.** The brief asks for `npx vitest run`, but this reviewer is limited to read-only git and grep and may not run tests, so no exit code was read. The orchestrator should run these and read the exit code:
- /home/ubuntu/makam-t109/src/cli/data-contoh-command.test.ts
- /home/ubuntu/makam-t109/src/domain/data-contoh/data-contoh.test.ts
- /home/ubuntu/makam-t109/src/domain/audit/audit-log.test.ts
- /home/ubuntu/makam-t109/src/app/api/browser-config/route.test.ts
- /home/ubuntu/makam-t109/src/lib/payment-trial.test.ts
- /home/ubuntu/makam-t109/tests/tooling/makam-preflight.test.ts
- /home/ubuntu/makam-t109/tests/tooling/data-contoh-bundle.test.ts

The builder reports 226 tests, exit 0; that is not verified here.

1. **OK.** `pengaturanOperatorBolehDiisi` is gone; grep finds no reference in src, tests, e2e or scripts. The production case now drives the command and checks the outcome (/home/ubuntu/makam-t109/src/cli/data-contoh-command.test.ts:115-128): `jalan([...SET, "--tulis", "--izinkan-production"], produksi)`, then `expect(await setup.operatorSettings.current()).toBeNull()` (:124). The guard is inline at /home/ubuntu/makam-t109/src/cli/data-contoh-command.ts:277: `if (perintah.appEnv !== "production")`. Deleting it would fill Pengaturan Operator and fail :124.

2. **OK.** `cabutEntri` now refuses a price that is still in force, whoever asks (/home/ubuntu/makam-t109/src/domain/data-contoh/index.ts:327-329): `const berlaku = await masihBerlaku(row); if (berlaku) return { ok: false, …`. Also fixed:
   - A cut-short row whose price is in force is now finished, not retired (index.ts:421-427).
   - The fee fixture records an example fee a killed run entered but never recorded (command :146-154, :166-171).
   - New tests: data-contoh.test.ts:138 and :168, and data-contoh-command.test.ts:291.

   One leftover, listed under soft below.

3. **BELUM.** Ticket /home/ubuntu/makam-t109/.scratch/makam-v1-build/issues/109-data-contoh-beta.md:242 says "H2, amounts not approved: open, the owner's." The AC (:48) requires approval "before merge". origin/main's copy of the ticket records no approval either.

4. **BELUM.** Ticket :243 says "H3, banner wording not confirmed: open, the owner's." `BARIS_DATA_CONTOH` is unchanged (/home/ubuntu/makam-t109/src/lib/payment-trial.ts:35).

5. **OK.** The Audit Log now stamps the run's reason on any entry without one (/home/ubuntu/makam-t109/src/domain/audit/index.ts:436): `reason: entry.reason ?? deps.alasanBawaan ?? null`. Other parts of the fix:
   - Wired at command :372: `susunModul(env, database, options.clock, perintah.alasan)`.
   - Marking a fixture finished now writes its own Entri Audit, `data_contoh.selesai` (index.ts:373-392).
   - Outcome tests at command test :115-128 and :196 check every new entry's reason.
   - Every reason `seedOneLokasi` passes is the run's own `alasan`.

**Soft (leftover from item 2's crash and concurrent-run clauses)**
- /home/ubuntu/makam-t109/src/cli/data-contoh-command.ts:146-154: only `tanam` applies the rule that adopts an unrecorded example fee. `rencanaCabut` and `cabut` (index.ts:395-397) look only at registry rows. Two ways to reach the bad state:
  - A run is killed between `setGlobalTariff` and `catatInduk` (command :172-179), and the next command is `cabut --tulis`, not another `tanam`.
  - Two overlapping runs each enter a version. The loser's `buang` (index.ts:443-447) retires the winner's row, because the loser's own version has superseded it.

  Either way `cabut` exits 0 while the Rp 100.000 example fee is still in force. The rule also sits in the CLI rather than the module. Fix: put the check in `rencanaCabut` so `cabut` refuses too, or at least have the runbook say to rerun `tanam` before `cabut`.

Findings: 3. Worst: items 3 and 4; the owner has not recorded approval of the amounts or of the banner wording. Hard violations: yes (owner actions needed before merge; no AGENTS.md rule broken).

Hard: 2, soft: 1

#### Spec

Worktree `/home/ubuntu/makam-t109`; every path below is relative to it. The fixed point `7415fdf7` resolves. `git diff 7415fdf7...a74063ea` is non-empty: 38 files, 5 commits. Read-only review: no tests run, and the worktree is clean.

##### Re-review items
1. **OK.** The test now checks the outcome: command-test:115-128 runs `tanam --tulis --izinkan-production` (stagingEnv, APP_ENV=production, sandbox URL), then `expect(await setup.operatorSettings.current()).toBeNull()` (:124). `pengaturanOperatorBolehDiisi` no longer exists anywhere, and the guard is inline at command:277.
2. **BELUM (narrowed).**
   - Fixed: `cabutEntri` refuses a `tarif_global` row that is still in force, whoever calls it (index.ts:326-329, "masih berlaku, belum digantikan versi asli").
   - Fixed: a cut-short fee row whose price is in force is finished, not retired (index.ts:421-427).
   - Tests: domain-test:138-166 and :168-190, command-test:291-305.
   - Still open, both named in the item:
     - **Crash between `setGlobalTariff` (command:172) and `catatInduk` (:179).** Only a later `tanam` adopts the fee (command:166-170). `cabut` (command:321-332), `hargaBerlaku` (index.ts:362-370) and `aktif()` (:502-505) see registry rows only. If `cabut --tulis` is the next command, it exits 0 with Rp 100.000 still in force, `contohAktif` is false and the preflight PASSes. The runbook promises recovery "by the next `tanam`" (runbook.md:485) and "Exit 0 only when nothing contoh is left active" (:491). The command test covers only a second `tanam`.
     - **Concurrent runs.** `masihBerlaku` (index.ts:312-319) accepts any later version as the successor, not only a real one. The losing run's `buang` (:443-447) retires whatever row holds the code. So it retires the winning run's fee row, because the loser's own contoh version superseded that row's version.
3. **BELUM.** "H2, amounts not approved: open, the owner's." (ticket :242).
4. **BELUM.** "H3, banner wording not confirmed: open, the owner's." (ticket :243; `BARIS_DATA_CONTOH` at payment-trial.ts:35).
5. **OK.**
   - The reason now reaches every write: `reason: entry.reason ?? deps.alasanBawaan ?? null` (audit/index.ts:436), on the one Audit Log every module is built with (seed-contoh-publik-command.ts:488).
   - The finishing mark is audited as `data_contoh.selesai` (index.ts:373-393).
   - command-test:196-205 (staging) and :115-128 (production) check that every new Entri Audit has the exact reason. Since a reason is now threaded through, the owner does not need to accept the gap.

##### Acceptance criteria
- **Registry: MET.** The module, its schema and migration 0064, with a partial unique index on active `kode`. `catat` is idempotent (domain-test:42). Listed at AGENTS.md:24.
- **CLI: MET.**
  - Bundle: build-worker.mjs:17, plus the bundle test.
  - Dry run unless `--tulis`; each environment needs its own flag, checked before any DB access (command:99-104).
  - `seed:admin` required (:272-273, :330-331); reasons on every write (item 5).
- **tanam: MET.**
  - Five Lokasi go through the publish gate (command-test:319).
  - Layanan get Lokasi prices (:248); the platform fee is entered only when none is set (command:166-171).
  - Staff are on `.invalid` addresses (rilis1.ts:33,103).
  - No Pengaturan Operator on production (item 1); twice changes nothing (command-test:277-289).
- **cabut: PARTIAL** (item 2).
  - Lokasi are hidden and staff deactivated (domain-test:259, command-test:360-376).
  - It refuses while a contoh price is in force (domain-test:302, :323; command-test:333).
  - Open orders are reported (domain-test:366).
  - Exit 0 is wrong only in the item 2 paths.
- **status: MET** (command:136-140, command-test:237).
- **Marking: PARTIAL** (item 4).
  - Names, Blok names included, are marked (rilis1.ts:85-106; command-test:78-85).
  - `contohAktif` is true, false or null, with a 2 s limit (route.ts:26-44; route tests :56-88).
- **Preflight: MET** (makam-preflight:672-694; preflight-test:916-968).
- **Tests: MET.**
  - Domain: :120, :259, :302.
  - Command: :89, :146, :347.
  - e2e: extended but not run (needs a stack).
- **Amounts: NOT MET** (item 3).

##### Money-code checks
- **cabut never lets go of a price without a real successor:** holds for every registry row (index.ts:326-329, :479-482). Not met in the item 2 paths.
- **No real Pencairan without staff action: MET.** `tanam` creates no Pemesanan or Tagihan; Fieldwork only reads Billing; the transfer needs `pencairan.kelola` (payouts/transfer.ts:188).
- **Every write audited with the command and environment: MET** (item 5).
- **Production refused without `--izinkan-production`: MET** (command:99-101; command-test:89-101; bundle test :44-51).
- **tanam idempotent: MET.**
- **Preflight FAILs on a non-sandbox host while contoh data is active: MET** when the stack answers (:691). An unrecorded fee (item 2) reads as PASS.
- **Migration expand-only: MET.** One CREATE TABLE and two indexes. The snapshot adds only that table, and the fix pass did not touch the migration.

##### Findings
**HARD**
- **H1 (item 2 residual).** An unrecorded contoh fee is found only by a later `tanam`, and `buang` can retire another run's fee row. Fix: let `cabut` (dry run and `--tulis`) run `diEnterOlehTanam` on the fee in force and exit 1, or record it first; let `buang` retire only the row its own run recorded.
- **H2 (item 3).** Amounts are not approved by the owner.
- **H3 (item 4).** The banner wording is not confirmed by the owner.

**SOFT**
- None new.

Findings: 3. Worst (Spec): after a `tanam` killed between entering the contoh fee and recording it, `cabut --tulis` exits 0 and the preflight PASSes with Rp 100.000 still in force. Hard violations: yes (must fix before merge; none breaks an AGENTS.md rule).

Hard: 3, soft: 0
