# Mitra Jasa Pencairan page (ticket 55 AC3)

Status: ready-for-agent
Blocked by: none (found by the UAT runner audit; group B, a gate for level 3; owner approved "ya keduanya", 2026-10-05)
Spec: ticket 55 AC3 (the Mitra Jasa sees their Pencairan), ticket 57 (TPU jobs paid through Pencairan); checklist R3-55.2, R3-57.2

## What to build (MONEY DISPLAY)

`src/app/staf/mitra-jasa/pencairan/page.tsx` is a stub: a heading and an EmptyState that says "Segera hadir". Ticket 55 AC3 and the checklist ask that a Mitra Jasa sees their Pencairan. Each one shows its jobs, with the Layanan, the date and the rate, and no Potongan. Build it from the Payouts and Layanan modules' public reads; the tests already have a `pencairanSaya`-style helper in `tests/support/layanan-tpu.ts`.

## Acceptance criteria

- [ ] **A signed-in Mitra Jasa sees their Pencairan**, newest first. For each: its status and due or paid date, then each job with its Layanan, TPU, date and rate, then the total. There is no Potongan line (Mitra Jasa rates are paid in full).
- [ ] **A Mitra Jasa sees only their own Pencairan.** Other parties' data, family documents and Hak Pakai are never shown.
- [ ] **An empty state** when there is nothing yet.
- [ ] **Tests:** the read on real Postgres (only own items, the amounts equal what Payouts will pay) and a static render.
- [ ] **Money display:** reviewed on the opus tier.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). A gate before level 3 (plan: 'AC3 tiket 55, tampilan Pencairan').

### Build (2026-10-05)

**What changed**

- **Payouts, a new public read `daftarPencairanMitraJasa(by)`** (`src/domain/payouts/pencairan-mitra-jasa.ts`, exposed in `index.ts`). The Mitra Jasa's Pencairan, newest first, each with `status`, `tanggal`, `pekerjaan` (Layanan, TPU, date, rate), `total` and the Bukti Pencairan. An explicit projection: no Potongan, order number, family, Lokasi or Hak Pakai field exists on it, and the staff-only reasons (why Admin Platform held an item, why it was cancelled) are reduced to the status. The authorization is the role (`pencairan.punya_saya`), never the status, so a Ditangguhkan or Berhenti Mitra Jasa reads it (story 182). The flat `pencairanMitraJasa` and its tests are untouched.
- **What one entry is** (see the first decision below): a transfer already made is one entry holding every job it covered, for the Bukti Pencairan's own amount; every Pencairan not yet transferred is its own entry. Amounts are the ones Payouts pays: `jumlahOf` (a rate Admin Platform lowered after a Keluhan shows as lowered), and for a transfer the Bukti's own lines and amount. No sum is computed in the read, so there is no place for a total to drift from the run.
- **TPU on the item**: `pencairan_item.tpu_nama` (migration `0065_regular_cammi.sql`, one nullable column, expand only), `catatItemLayananMitraJasa` takes `tpu`, and the Layanan approval (`setujuiBuktiTpu`) passes the job's TPU. The Layanan name, date and now the TPU are all snapshots written once, so the page reads one module.
- **UI**: `src/app/staf/mitra-jasa/pencairan/page.tsx` (guarded by `staffMenuActor("mitra_jasa")`, empty state "Belum ada Pencairan") and `daftar-pencairan.tsx` (the list). Four statuses joined the shared vocabulary (`Belum Jatuh Tempo`, `Jatuh Tempo`, `Ditahan`, `Dicairkan`; `Dibatalkan` already existed) in `status-badge.tsx`, its test and `docs/design-system.md`. The Mitra Jasa menu item no longer says "Segera hadir."

**Decisions**

1. **One read, from Payouts**, although the ticket says "Payouts and Layanan modules' public reads": the TPU is a snapshot, so no second read or join at request time is needed, and Layanan stays the only writer of what a job's Pencairan says.
2. "Newest first" means newest **record**: an item by when its job's Pencairan was written (the approval), a transfer by when its Bukti Pencairan was issued. Ties break by key, so the order is stable.
3. A held item is shown **Ditahan** (never its reason); a cancelled one **Dibatalkan** with a total of Rp 0 and its rate struck through (never its reason). A Mitra Jasa that never saw them would see a "Jatuh tempo" that Admin Platform's run will not transfer, or a job that vanished.
4. Items recorded before migration 0065 show no TPU line (only the date); no backfill, because the TPU would have to be cut out of a display label.
5. The page says "Tarif Anda dibayar penuh" and never uses the word Potongan, so a test can say the word is nowhere on the page.

**Spec gaps and decisions for the owner**

- **What "each Pencairan" is.** AC 1 reads "for each: its status and due or paid date, then each job ... then the total", while CONTEXT.md makes a Pencairan one job's payout and a Bukti Pencairan one transfer listing them. Decided as above (a transfer = one entry with its jobs; an open Pencairan = its own entry). If the owner wants every due job gathered into one entry the way the run's row is per recipient, that is one grouping step in the read (`daftarPencairanMitraJasa`), nothing else.
- **The date of a Jatuh Tempo entry is the Operator's own deadline** (2 Hari Kerja after it fell due, `jatuhTempoAt`), worded "Dibayar paling lambat ...". It tells the Mitra Jasa a date Admin Platform has set for itself. The owner may prefer the date it fell due, or no date.
- **Ditahan and Dibatalkan are disclosed as a status.** Spec: "the Mitra Jasa version shows only job, Layanan, date and rate" (and story 182 "nothing is hidden from me"). The status itself is asked for by this ticket; whether a hold should be visible to its recipient is the owner's.
- AC 3 of ticket 55 ("both still log in and see history and Pencairan") is now delivered on the Pencairan side and tested for Ditangguhkan and Berhenti (read) and Ditangguhkan (the page); the box on ticket 55 is the orchestrator's to tick.
- Noticed, not changed (outside this ticket): `src/lib/mitra-jasa-labels.ts` words the status `ditangguhkan` as "Ditangguhan" (CONTEXT.md and the shared vocabulary say "Ditangguhkan").
- Merge notes: the migration number `0065` and `drizzle/meta/_journal.json` may need renumbering if `main` moves; `status-badge.tsx`, its test, `docs/design-system.md` and `staff-navigation.ts` are one-hunk edits.

**Tests** (the Payouts, static render, page, vocabulary and menu tests were written first and seen red; the Layanan TPU file was written after the read it exercises and checked by a mutation instead; `MAKAM_TEST_PG=shared npx vitest run <paths>`, exit codes and counts read from whole logs)

- `src/domain/payouts/pencairan-mitra-jasa.test.ts` (10, real Postgres): newest first with Layanan, TPU, date, rate and total; only the allowed fields, no order number or Potongan; Belum jatuh tempo then Jatuh tempo with the run's deadline; the Jatuh tempo totals add up to the run's `neto` and a Bukti Pencairan settles them as one transfer for its amount; a partial transfer; only their own (another Mitra Jasa, Admin Platform and Petugas Lapangan refused); Ditahan without its reason and out of the transfer; Dibatalkan paying nothing; a lowered rate; empty. Mutation checks: reversing the order, using the issued instead of the adjusted amount, and dropping the owner filter each turn it red.
- `src/domain/layanan/pencairan-mitra-jasa.test.ts` (7, real Postgres, the real TPU flow): from approval to Dicairkan with the Bukti Pencairan document saying the same job and amount; the sum per Mitra Jasa equals the run's row and its item ids; newer job first; Ditangguhkan and Berhenti still read it; nothing of the family or the grave; a redo by another Mitra Jasa shows Dibatalkan beside the other's paid-rate Pencairan; empty before approval. Removing the TPU from the Layanan call turns the first red.
- `src/app/staf/mitra-jasa/pencairan/daftar-pencairan.test.ts` (6, static render) and `page.test.ts` (5, the real page signed in with a Kode Masuk on real Postgres: newest first, only their own, empty state, a Ditangguhkan Mitra Jasa, a non-Mitra Jasa and a visitor turned away).
- `status-badge.test.ts` (+1, the four statuses and their tones) and `staff-navigation.test.ts` (+1).
- Final run of the touched and neighbouring paths (`src/domain/payouts`, the Layanan TPU tests, `src/app/staf/mitra-jasa`, `src/lib/staff-navigation`, `src/components/makam`, the two copy guards, the migration guards `destructive-ddl*` and `seed-representative`): **29 files, 312 tests passed, exit 0**. `npm run typecheck` exit 0 (0 errors); `npm run lint` exit 0 (0 errors, 6 warnings, all in files this ticket does not touch). No `npm run build` (the ticket does not need one).

**Not verified**: the page on a phone or in a browser (no screenshot taken); the migration on a database with real rows beyond the repository's migration guards.

### Review (2026-10-05, round 1; fixed point 9da0fb3b, head 921d0fd7)

Both axis reports as the reviewers wrote them (the two report titles are two heading levels deeper than the reviewers' (`##` became `####`), because `ticketComments` ends a Comments section at the next `## ` heading, the same as on ticket 110; the text is otherwise verbatim).

#### Standards

Head `921d0fd7` confirmed. Fixed point `9da0fb3b` resolves and equals both origin/main and the merge-base. The diff is non-empty (21 files) and the worktree is clean.

**Tests not run.** The orchestrator's brief asked me to run the ticket's tests with `npx vitest run`, but the reviewer role forbids it (`.claude/agents/reviewer.md:8`: "never … run a test suite"), so no exit code was read. The orchestrator should run:

`MAKAM_TEST_PG=shared npx vitest run src/domain/payouts/pencairan-mitra-jasa.test.ts src/domain/layanan/pencairan-mitra-jasa.test.ts src/app/staf/mitra-jasa/pencairan src/components/makam/status-badge.test.ts src/lib/staff-navigation.test.ts`

The builder's "312 tests passed, exit 0" (ticket :55) is unchecked. I did not run the migration checker either. By reading it, `drizzle/0065_regular_cammi.sql:1` adds one nullable column (expand only). The snapshot chain is intact: 0065's prevId is 0064's id, and the only change is `tpu_nama`.

**Hard: none.** Rules checked and met:
- Payouts reads only its own tables (`src/domain/payouts/pencairan-mitra-jasa.ts:80-97`).
- The TPU enters through Payouts' public function and is validated with Zod (`src/domain/payouts/item.ts:390`).
- No `new Date()` / `Date.now()`, console or env use added.
- The page and component only display; there is no business rule in them.
- No `"use client"`; the one import from the barrel is a type, in a server component.
- Tests go through public functions on real Postgres, never touch tables, mock no database, assert only outcomes and use CONTEXT.md names.
- The migration was generated after the schema change.
- The copy is in Bahasa Indonesia.
- Ops scripts, bash, workflow pinning, secrets in logs and image retention: not in this diff.

**Soft**
1. `src/app/staf/mitra-jasa/pencairan/daftar-pencairan.tsx:78`: "Menunggu jendela Keluhan …" translates "Keluhan window" word for word. The rest of the app says "masa keluhan" (`src/app/staf/admin-platform/keluhan-tpu/[keluhanId]/keluhan-tpu-forms.tsx:36`, `src/components/layanan/thread-daftar.tsx:48`).
2. `src/app/staf/mitra-jasa/pencairan/page.test.ts:55-64`: `signInAsMitraJasa` is a verbatim copy of `src/app/staf/mitra-jasa/akses.test.ts:45-54`. It belongs in `tests/support/server-sign-in.ts` next to `signInAsAdminLokasi`.
3. `tests/support/layanan-tpu.ts:159`: `pekerjaanDisetujui` sets the shared fake Clock back to 2026-10-01 09:00 on every call. The later calls in `src/domain/layanan/pencairan-mitra-jasa.test.ts:96-97` and `:115` therefore move time backwards past an earlier approval. The tests pass today, but a later assertion that depends on a tick will trip on it.
4. `src/domain/payouts/index.ts:290-291`: the flat `pencairanMitraJasa` read is now used only by tests (`potongan.test.ts`, `tests/support/layanan-tpu.ts:125`) and has no Ditahan status. Two public views of the same Pencairan can drift apart; a follow-up should retire the flat one or derive one from the other.
5. tdd: all tests and code are in one build commit (`1165abd6`), so the history cannot show that tests came first. The builder also says the Layanan TPU test was written after the code, with a mutation check instead (`.scratch/makam-v1-build/issues/122-pencairan-mitra-jasa.md:49`). Noted for the record; no code change needed.
6. Nits: `daftar-pencairan.tsx:23` calls `tanggalPencairan(satu)` twice per card. `src/domain/payouts/pencairan-mitra-jasa.ts:182` nests a ternary three levels deep; a switch like `statusOf` at :168 would read better.

Standards: 6 findings (0 hard, 6 soft); worst: the user-facing "jendela Keluhan" where the app says "masa keluhan" (daftar-pencairan.tsx:78); hard violations: no.

Hard: 0, soft: 6

#### Spec

Fixed point 9da0fb3b resolves (= origin/main). The diff 9da0fb3b...921d0fd7 is non-empty: 21 files.

**AC1 (sees their Pencairan, newest first; status, due/paid date, jobs, total, no Potongan): PARTIAL**
- Newest first: `pencairan-mitra-jasa.ts:148`. Tests: payouts `:82-104`, `:164-179`; layanan `:111-118`; page `:104-105`.
- Status badge: `daftar-pencairan.tsx:22`. Jobs with Layanan, TPU, date and rate: `:29-37`. Total: `:39-42`.
- No Potongan: `page.tsx:23` says "Tarif Anda dibayar penuh"; tests at payouts `:113` and the static render `:91-96`.
- Totals equal what Payouts pays:
  - Open entries use `jumlahOf` (`baca.ts:101-103`), the same amount the run (`run.ts:77-81`) and the transfer (`transfer.ts:274`, `:342`) use.
  - A Dicairkan entry's total is the Bukti's own amount (`:123`), and a Mitra Jasa never carries a Potongan (`transfer.ts:285-287`).
- Dates:
  - Shown: Dicairkan (transfer date), Jatuh Tempo (pay-by deadline; the builder raised this one with the owner) and Dibatalkan (cancel date).
  - Missing: **Belum Jatuh Tempo and Ditahan entries show no date** (HARD-1).
  - Rows written before 0065 show no TPU (SOFT-1).

**AC2 (only their own; nothing of other parties, family or Hak Pakai): MET**
- The query is keyed on `penerimaKind` and the Akun (`:80-97`). `pencairan.punya_saya` requires the `mitra_jasa` role (`authorize.ts:665-668`).
- The projection is explicit (`:157-165`).
- Tests: payouts `:106-114`, `:181-191`; layanan `:134-143`; page `:110-123`.

**AC3 (empty state): MET**
- "Belum ada Pencairan" at `page.tsx:25-30`.
- Tests: page `:125-133`, payouts `:234-239`, layanan `:162-174`.

**AC4 (tests: read on real Postgres, static render): MET**
- `testDatabase()` connects to the run's migrated Postgres (`tests/support/database.ts:7-15`).
- Only own items: payouts `:181-191`.
- Amounts: equal to the run's `neto` (`:129-143`, `:221-232`) and to the Bukti's amount (`:144-161`). Layanan `:91-109` checks the sum and the item ids against the run's row.
- Static render: `daftar-pencairan.test.ts` (6 tests), plus the real page rendered with `renderToStaticMarkup` (page `:50`).

**AC5 (money display reviewed on the opus tier): MET by this review.**

The test counts in the Comments match the files (10/7/6/5).

**Findings**
- **HARD-1**: AC1 asks for "due or paid date" for each entry. `tanggalOf` returns null for Belum Jatuh Tempo and Ditahan (`pencairan-mitra-jasa.ts:181-184`, `daftar-pencairan.tsx:59-72`), and tests pin this (payouts `:91,98,119,202`).
  - The docstring says such an entry has "no date yet". In fact the window closes 72 h after approval (`layanan/keluhan.ts:48`, `:56-58`), and Layanan exposes that date publicly (`jendelaKeluhanTpu`, `layanan/index.ts:748`). That is the read the ticket pointed at and Decision 1 dropped.
  - The owner section of the ticket (`:40-47`) does not mention it. This is an undisclosed narrowing, which `AGENTS.md:68` forbids.
- **SOFT-1**: Decision 4 (no TPU on rows from before 0065) is filed under Decisions (ticket `:37`), not in the owner section. `pekerjaanLabel` already holds the TPU (`bukti-tpu.ts:269`), so a display fallback is cheap.
- **SOFT-2**: The header copy "tidak lagi bisa dibatalkan" (`page.tsx:23`) contradicts the Dibatalkan entries on the page, and Belum Jatuh Tempo ones a redo can still cancel (`item.ts:332-345`).
- **SOFT-3**: `page.test.ts:98` passes on the "Belum Jatuh Tempo" string, so the real page never proves the Jatuh Tempo badge or its date.

Findings: 4 (worst: Belum Jatuh Tempo and Ditahan entries carry no due date, a narrowing not raised with the owner). hard violations: yes

Hard: 1, soft: 3
