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
