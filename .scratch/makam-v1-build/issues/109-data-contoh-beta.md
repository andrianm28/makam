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
