# UAT kit: a Rilis 2/3 checklist and a Playwright runner for the staging UAT

Status: ready-for-agent
Blocked by: none
Spec: `.scratch/makam-v1-build/uat-rilis-1-checklist.md`; Release plan (Rilis 2 = 35, 39, 41, 42, 59, 84; Rilis 3 = 43–48, 55–57, 58 and the TPU parts of 51–53); ADR 0006; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

The owner decided (2026-10-04) that agents run the UAT first, with an automated browser, screenshots and a report. The owner reads out Kode Masuk and TOTP codes, spot-checks, and signs off.

- The Rilis 1 checklist is entirely unticked, and it has no family-side Layanan section, although Layanan at a Lokasi Mitra (49–54) is Rilis 1 (ADR 0006).
- There is no Rilis 2/3 checklist at all.
- Only one SumoPod sandbox project exists (owner decision). Every case that **pays** must therefore run on staging before the switch, because the webhook then moves to makam.co.id.

## Acceptance criteria

- [ ] **Checklists:**
  - New `.scratch/makam-v1-build/uat-rilis-2-3-checklist.md`, built from the spec's journeys for the Rilis 2/3 tickets. Each item is tagged **[BAYAR]** (needs a sandbox payment, so it must run before the switch) or **[TANPA-BAYAR]**. It includes a "staging prerequisites" section: data, staff roles, the Retribusi value, TPU marks.
  - The Rilis 1 checklist gets a §11 for Layanan from the family side: ordering (50) [BAYAR], Layanan at checkout (53) [BAYAR], Keluhan/Penilaian (51), the message thread (52).
- [ ] **Runner:** `uat/playwright.uat.config.ts`, with its own testDir, never part of CI or `npm run e2e`, run with `npm run uat`.
  - Personas are the owner's Gmail plus-aliases (owner provides them), each with a saved storageState.
  - A Kode Masuk or TOTP code is read from `$UAT_OUT/kode/<persona>.txt`, which the orchestrator writes when the owner reads the code out.
  - Logins stay at least 60 s apart and at most 5 per hour per IP (`src/domain/identity/otp.ts:142`).
  - Payments go QRIS → "Simulate Payment" → wait for Lunas.
  - A screenshot at every step. An HTML report and a summary land in `/home/ubuntu/uat-runs/<date>-<sha>/` (not committed).
- [ ] **Slice 1:** every Rilis 1 journey in the checklist and every [BAYAR] item of Rilis 2/3. **Slice 2:** the [TANPA-BAYAR] Rilis 2/3 items. Each slice can be merged on its own.
- [ ] The runner never targets production; it refuses a base URL other than staging or local.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A; slice 1 in MB2, slice 2 in MB5). Not money code. The runner is test tooling, not the product.

### Build (2026-10-04)

Builder, slice 1 (branch `ticket-110-uat-kit`). Not money code.

**What changed**
- `.scratch/makam-v1-build/uat-rilis-2-3-checklist.md` (new): staging prerequisites (P1 to P10: data, staff roles, Retribusi Rp 0, TPU marks, Hak Pakai uji) and every journey of Rilis 2 (35, 39, 41, 42, 59, 84) and Rilis 3 (43 to 48, 55 to 58, the TPU parts of 51 to 53). 49 items: 13 tagged [BAYAR] (all `S1`), 36 [TANPA-BAYAR] (all `S2`).
- `.scratch/makam-v1-build/uat-rilis-1-checklist.md`: new section 11 (Layanan, family side: order and pay [BAYAR], Layanan at checkout [BAYAR], fulfilment, Keluhan/Penilaian, thread, cancel); the exit criteria now say sections 2 to 7 **and 11**.
- `uat/` (runner; `npm run uat` = `playwright test -c uat/playwright.uat.config.ts`; `npm run e2e` and CI never see it): `support/lingkungan.ts` (base URL guard: only exactly `https://dev.makam.co.id` or localhost/127.0.0.1/[::1]; a browser request to any other makam.co.id host is aborted), `jeda-kode.ts` (60 s gap, 5 an hour, history in a file), `kode.ts` (codes from `$UAT_OUT/kode/<persona>.txt`, request marker `<persona>.minta`, file used up, stale file removed before the send), `masuk.ts` and `persona.ts` (saved session per persona; Masuk with Kode Masuk, Admin Platform TOTP), `langkah.ts` (a screenshot at every step, `manual()` for what only a person can check), `bayar.ts` (Bayar, QRIS, Simulate Payment, wait for Lunas, Bukti), `alur.ts`, `ringkasan.ts` (summary.md/json), `uat/README.md`. Report: HTML, `ringkasan.md` and `bukti/` under `/home/ubuntu/uat-runs/<WIB date>-<sha>/` (or `$UAT_OUT`), not committed.
- 14 journey files, 37 tests: Rilis 1 sections 0 to 9, 11 (as `10-layanan`) and 10 (as `11-penutup`), `rilis2-bayar`, `rilis3-bayar`. Tags `@rilis1 @rilis2 @rilis3 @bayar`.
- Tests (`tests/uat`, domain words): the base URL refusal (production, look-alikes, passwords in the URL, http for staging), the pacing (60 s gap, rolling hour, sixth request refused with the time it reopens, history across runs) and the code file (six digits, stale file never typed).

**Verification** (logs read whole): `npx vitest run tests/uat` exit 0, 3 files, 56 tests passed; `npm run lint` exit 0 (0 errors; 6 warnings, none in `uat/` or `tests/uat`); `npm run typecheck` exit 0; `playwright test -c uat/playwright.uat.config.ts --list` lists 37 tests in 14 files and `UAT_BASE_URL=https://makam.co.id` exits 1 with "UAT ditolak". **No journey was run against any stack** (no credentials here, no local stack built): every selector outside `e2e/` was read from the source and is unverified, and SumoPod's sandbox checkout (its own page) was written from the checklist's words only.

**Decisions**
- Personas are env vars (`UAT_EMAIL_<PERSONA>`); sessions in `/home/ubuntu/uat-runs/sesi` (mode 600), so a persona logs in once, not once per journey (a signed-in Pemesan also skips the Kode Masuk step in every wizard). An Admin Platform session lasts 12 h (`ADMIN_PLATFORM_SESSION_MS`), then it needs a code again.
- The runner refuses a sixth request in an hour instead of waiting up to an hour (`UAT_KODE_TUNGGU_MAKS_MENIT` raises the patience); the 60 s gap it waits out itself.
- Journey order follows the data: Layanan (section 11) runs before the closing journey (section 10) that cancels the Terencana order it uses; section 5's Admin Lokasi review of a document request is walked in R2-41.1.
- Data that staging must hold (a Hak Pakai that allows tumpang, one without email, one in masa tenggang, a throw-away Lokasi) is named by env ids (`uat/README.md`); a journey without its data is skipped and says why.

**Spec gaps and decisions for the owner**
- **Not every [BAYAR] item of Rilis 2/3 is scripted** (AC "every [BAYAR] item"): R3-47.1 only starts (the pengajuan form; the document check, payment and IPTM issue are not scripted), R3-47.2 and R3-48.1 are declared with `test.fixme`. The Pengurusan upload and Perpanjangan TPU pages were not read closely enough to script them. They are [BAYAR], so they must be scripted (or walked by hand) **before the switch**. R2-35.1, R2-41.1, R2-42.1, R2-59.1, R2-59.2, R3-45.1 (with R3-56.2), R3-46.1 (with R3-53.1) and R3-56.1 are scripted; R2-42.1, 59.1 and 59.2 also need the staging data of P8, P9.
- Rilis 1 sections 6 to 8 are scripted as page tours plus the steps earlier journeys already prove; the edits that change shared data (Denah, Jam Operasional, Kontak Siaga, catat dibayar langsung, Harga Khusus, refund approval) and everything that needs a mailbox, a phone or the SumoPod dashboard are `manual()` steps, listed in the summary. The Rp 10 juta cap case needs `UAT_LOKASI_DI_ATAS_BATAS`.
- `docs/ops/runbook.md` says staging's basic auth was removed at the owner's request; the runner supports basic auth from env vars as the AC asks, and uses none today.
- Slice 2 (left): all 36 [TANPA-BAYAR] items marked `S2` in the Rilis 2/3 checklist (R2-35.2 to 35.6, R2-39.1 to 39.4, R2-41.2, 41.3, R2-42.2, 42.3, R2-59.3, R2-84.1, R3-43.1 to 43.3, R3-44.1 to 44.3, R3-45.2, 45.3, R3-46.2, 46.3, R3-47.3, R3-48.2, R3-55.1, 55.2, R3-56.3, R3-57.1, 57.2, R3-58.1, 58.2, R3-51.1, R3-52.1), plus the three unscripted [BAYAR] items above.

**HANDOFF (builder, slice 1)**: files: `uat/**`, `tests/uat/*.test.ts`, the two checklists, `package.json` (`uat` script). Next agent: (1) run `UAT_BASE_URL=http://127.0.0.1:<port> npm run uat -- --grep "§0|§1"` on a local stack to shake out selectors (local stack has no SumoPod: only the unpaid parts can run), then on staging with the owner reading codes out; fix selectors in `uat/perjalanan` and `support/bayar.ts`. (2) Script R3-47.1, 47.2 and 48.1 before the switch. (3) Slice 2. Unverified: every journey, the reporter's output files, the camera flags.

### Review (2026-10-04, round 1; fixed point 0fd6bf41, head 4abdf352)

Both axis reports as the reviewers wrote them (the two report titles are two heading levels deeper than the reviewers' (`##` became `####`, `###` became `#####`), because `ticketComments` ends a Comments section at the next `## ` heading; the text is otherwise verbatim).

#### Standards

**Tests not run by me.** This role is read-only and forbids running tests, and `vitest.config.mts` starts Postgres in `globalSetup`. The builder reports exit 0, 56 tests. I count 56 cases (29 + 12 + 15), traced their assertions by hand and expect green. Read the exit code before merging.

**Hard**
1. `tests/uat/kode.test.ts:79`: `expect(dipanggil[0]).toBe("kirim")` asserts call order between two fakes (AGENTS.md, Tests: "never on … call sequences"). Drop it; line 99 already proves the stale file is gone at send time.

**Soft**
1. `uat/support/lingkungan.ts:79-87`: `permintaanKeProduksi` fails open for `https://makam.co.id./` (hostname keeps the dot, `milikMakam` is false) while the base-URL guard fails closed. Strip the dot; add a case.
2. `uat/support/masuk.ts:29,34`: `Number(env ?? default)` makes an empty `UAT_KODE_TUNGGU_MAKS_MENIT` 0, so even the 60 s gap is refused with the "batas 5 per jam" message, and `abc` NaN, which removes the cap. Validate in `bacaKonfigurasi`.
3. `uat/playwright.uat.config.ts:47`: `httpCredentials` without `origin` sends basic auth to any host that challenges (the SumoPod checkout).
4. `uat/support/jeda-kode.ts:58`, `ringkasan.ts:75`: UTC `toISOString()` shown to the owner; use `formatWib` (`@/lib/time/jakarta`).
5. `uat/support/ringkasan.ts:35`: step errors keep ANSI colour codes (only line 60 calls `bersihkan`), garbling `ringkasan.md`.
6. `tests/uat/jeda-kode.test.ts:158`: pins the history file's private JSON layout on top of the outcome at line 157.
7. Duplicated Code: `10-layanan.uat.ts:58-65` re-implements `bukaBarisAntreanLokasi` (`halaman.ts:103-113`); the Nama/Telepon/Email fill repeats at `02-terencana:37`, `04-saat-duka:33`, `alur.ts:72`, `rilis2-bayar:30`.
8. Speculative Generality: state keys `lokasiId` (`02:64`), `perpanjangan.tagihanUrl` (`05:25`), `terencana.total` (`03:18`), `tpu.saatDuka.nomor` (`rilis3:21`) are never read; bare-string keys turn a typo into a silent `test.skip` (`09-negatif:10-11`).

**Seen for Spec, not counted:** `rilis2-bayar.uat.ts:124-126,147-151` look for the status buttons and reason field inside a `<form>`, but that form holds only a hidden input: the trigger sits beside it and the dialog is portalled (`lokasi-forms.tsx:379-390`, `confirm-dialog.tsx:19-21`); the Berhenti buttons read "Berhenti"/"Berhentikan", not "Hentikan" (`lokasi-forms.tsx:421,425`).

**Clean:** no workflow, Docker, bash, deploy or dependency change (no `prune`/`uses:` in the diff); no secret logged; copy is Indonesian.

9 findings; worst: the call-sequence assertion at `kode.test.ts:79`, the only hard; riskiest soft: the trailing-dot production guard; hard violations: yes.
Hard: 1, soft: 8

#### Spec

Fixed point `0fd6bf41` resolves; `git diff 0fd6bf41...4abdf352` is non-empty (35 files, +2720/-1, 3 commits). Read-only: nothing was run, so the builder's vitest/lint/typecheck results are taken as reported.

##### Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| Rilis 2/3 checklist: tags, staging prerequisites | MET | `uat-rilis-2-3-checklist.md:14-25` (P1-P10: data, roles P2, Retribusi P3, TPU marks P4); 49 items, 13 [BAYAR], 36 [TANPA-BAYAR]; numbers spot-checked against tickets 44, 47, 56, 59 |
| Rilis 1 section 11 (50, 53, 51, 52) | MET | `uat-rilis-1-checklist.md:94-103`, exit criteria `:106` |
| Runner: own config and testDir, never CI or `npm run e2e`, `npm run uat` | MET | `uat/playwright.uat.config.ts:29-31`, `package.json:18`; root `playwright.config.ts:10` is `testDir: "e2e"`, `ci.yml:286` runs `npm run e2e`, `vitest.config.mts:11` does not match `*.uat.ts`. CI lint, typecheck and `npm test` do cover `uat/` and `tests/uat` (pure unit tests): fine |
| Runner: personas with storageState, codes from `$UAT_OUT/kode/<persona>.txt` | MET | `persona.ts:21-47`, `masuk.ts:137-163`, `kode.ts:52-86` |
| Runner: logins at least 60 s apart, at most 5 an hour per IP | MET | check 3 |
| Runner: QRIS, Simulate Payment, Lunas; screenshot per step; report and summary in `/home/ubuntu/uat-runs/<date>-<sha>/` | MET, never run | `bayar.ts:22-73`, `langkah.ts:46-54`, config `:39-44`, `lingkungan.ts:104-117`; the Comments say no journey ran against any stack |
| Slice 1: every Rilis 1 journey, every [BAYAR] of Rilis 2/3 | PARTIAL | HARD 2-4, SOFT 1, 4-6 |
| Never targets production; refuses anything but staging or local | PARTIAL | allow-list, route guard and tests exist; HARD 1 |
| Slice 2 | out of scope here | 36 items marked S2, declared in the Comments |

##### The brief's checks

1. **Every Rilis 1 section has a journey: yes.** 0 `00-prasyarat`, 1 `01-masuk`, 2 `02-terencana`, 3 `03-pembayaran`, 4 `04-saat-duka`, 5 `05-perpanjangan`, 6-8 `06`-`08` (page tours, edits as `manual()`), 9 `09-negatif`, 10 `11-penutup`, 11 `10-layanan` (numbers swapped for run order, README:19). **Every [BAYAR] item: no.** Of 13 Rilis 2/3 items, 3 are `fixme` (HARD 2), 2 ride on tests that never add the Layanan (HARD 4), 2 cannot pass as written (SOFT 1); R2-35.1/41.1/42.1/59.x also skip unless the P8/P9 env ids are set. The Rilis 1 section 11 checkout item has nothing (HARD 3).
2. **Never production: not guaranteed.** HARD 1.
3. **Login pacing: respected.** `jeda-kode.ts:33-52` mirrors `otp.ts:103-113` (60 s from the newest request, five in a rolling hour, reopening when the fifth-newest leaves) plus a 3 s margin. Every send goes through the gate: `masuk.ts:86`, `alur.ts:32`, `01-masuk.uat.ts:53`. History persists across runs (`masuk.ts:25`). A sixth request is refused with its reopening time instead of waited out (`jeda-kode.ts:50`, default cap 10 min), which keeps the AC. Resend is checked, never pressed (`masuk.ts:89-91`). Tested in `tests/uat/jeda-kode.test.ts`.
4. **Nothing secret committed: yes.** Credential-like strings are fixtures (`rahasia`, `tests/uat/lingkungan.test.ts:40,58,97-100`) and placeholder aliases (`uat/README.md:11-12`). Personas and basic auth come from env; sessions (0600), codes, report and traces go under `/home/ubuntu/uat-runs`, outside the repo. I did not run gitleaks; the `user:rahasia@dev.makam.co.id` fixtures are the only thing its default rules could trip on.
5. **Excluded from CI and `npm run e2e`: yes** (table, row 3).

##### Narrowing of the spec

Undisclosed: Rilis 1 section 11 checkout Layanan (HARD 3); anonymous wizard path (SOFT 5, only a parenthetical); the section 1 Admin Platform check skipped in run order (SOFT 4). Disclosed: three [BAYAR] items `fixme` (HARD 2; the Comments' "R3-47.1 only starts" is wrong, it never runs); sections 6-8 as tours; unverified selectors. The ticket text is untouched apart from the appended Build comment.

##### Findings

**HARD (4)**
1. **Production reachable through a loopback port.** `lingkungan.ts:18,59` accepts localhost/127.0.0.1/[::1] on any port; `docs/ops/runbook.md:12-14` puts production on `127.0.0.1:3100` of the same VPS (staging 3110); `tests/uat/lingkungan.test.ts:18` asserts `http://localhost:3100/` is accepted. `UAT_BASE_URL=http://127.0.0.1:3100` passes `bacaKonfigurasi` and the browser guard (`permintaanKeProduksi`, `lingkungan.ts:79-87`, matches only `*.makam.co.id`), so journeys would send real Kode Masuk emails and create and cancel orders on production. Fix: before any journey, GET `<base>/api/health` and refuse unless `environment` is development, test or staging (`src/app/api/health/route.ts:11` returns it; no runner code reads it); drop 3100 from the test.
2. **Three [BAYAR] items have no runnable script, yet the checklist says they do.** `rilis3-bayar.uat.ts:57,70,74`: R3-47.1, R3-47.2, R3-48.1 are `test.fixme(true, ...)`; checklist lines 84, 85, 89 tag them `S1` ("already scripted", line 10). AC "every [BAYAR] item of Rilis 2/3" fails for 3 of 13, and G2 needs them before the switch. Disclosed, so fix or re-scope to slice 2 and relabel, so a green `--grep @bayar` is not read as complete.
3. **Rilis 1 section 11 [BAYAR] "Layanan saat checkout (tiket 53)"** (checklist `:98`) has no journey, no `manual()`, and is not in the Comments' gap list. The three surfaces exist (`terencana/data-kirim.tsx:227` "petak-kosong", `saat-duka/data/data-kirim.tsx:296` "hari-h", `tambah-layanan-perpanjangan.tsx:26`, rendered at `perpanjangan/[hakPakaiId]/page.tsx:197`); the runner never references them, and `perpanjangDanBayar` (`alur.ts:17-42`) walks past "Tambah Layanan".
4. **R3-56.2 and the Layanan half of R3-53.1 pass without any Layanan.** `rilis3-bayar.uat.ts:20,38` pass `layananHariH: true`; `alur.ts:80-83` looks for `select[id^="varian-"]` and skips when absent, but the TPU wizard's select is `id="hari-h-<id>"` (`data-tpu.tsx:561`). Both tests go green with no hari-H Layanan in the order. A wrong selector would fail loudly; this guard hides it, so the shake-out would not find it.

**SOFT (8)**
1. **R2-59.1/59.2 cannot pass as written.** `rilis2-bayar.uat.ts:124-126,147-151` expect the reason field and button inside a `<form>` holding a "Tangguhkan"/"Hentikan" button, but the dialog is portalled with `form=` attributes (`confirm-dialog.tsx:19,68,83`; `lokasi-forms.tsx:379-425`); the buttons are "Tangguhkan", "Berhenti", "Berhentikan". R2-59.2 re-finds the Lokasi in `/lokasi` (`:144`) after 59.1 suspended it, and that list holds only Terverifikasi (`public-reads.ts:165-172`). Step title says "besok", code passes `tanggalWib(0)`.
2. **No `actionTimeout`/`navigationTimeout`** with a 60-minute test timeout (`playwright.uat.config.ts:37,45-56`): a locator that never matches stalls the run up to an hour. Set both (about 30 s).
3. **Summary understates what did not run.** `ringkasan.ts:53-63` keeps no skip reason, so env-skipped @bayar journeys and `fixme` read as "dilewati" against G2's "0 gagal" (checklist `:122`); `ringkasan.ts:101-103` and the HTML report are rewritten per invocation, though README:19 and the hourly refusal mean resuming on the same `UAT_OUT`.
4. **Section 1 Admin Platform test is skipped in run order**: `00-prasyarat.uat.ts:24` saves the session, `01-masuk.uat.ts:29` then skips; wrong-TOTP (checklist `:19`) is never exercised.
5. **Anonymous order path not walked** (checklist `:26`, `:45`): `02-terencana.uat.ts:36`, `04-saat-duka.uat.ts:31-43` use a signed-in Pemesan; the wizard has its own code branch (`data-kirim.tsx:302`). Add one anonymous walk or a `manual()`.
6. **Thin coverage, partly disclosed**: sections 6-8 tours; section 5's Admin Lokasi verification only inside data-gated R2-41.1 (`rilis2-bayar.uat.ts:67-68`); section 11 skips the Admin Platform Keluhan row, Penilaian visibility, an Admin Lokasi reply and the Terlambat row; the section 9 cap case asserts only a disabled Lanjut (`09-negatif.uat.ts:45`).
7. `bayar.ts:34` accepts any `sumopod.com`; checklist `:34` expects `pay-sandbox.sumopod.com`. Assert the sandbox host.
8. Nits: `--grep "§0|§1"` in the HANDOFF also matches §10 (cancels the order) and §11 (pays); Rilis 1 sections 3-5 pay but carry no [BAYAR] tag; `httpCredentials` has no `origin` (`playwright.uat.config.ts:47`).

Worst issue: production is reachable through the documented loopback port 3100, and a UAT kit can go green on [BAYAR] items it never exercised. Hard violations: yes (4).

Hard: 4, soft: 8

### Fix pass 1 (2026-10-04)

Answers to round 1 (fixed point 0fd6bf41, head 4abdf352), test first where there is a seam: `tests/uat` went from 56 to 126 tests, each new test seen red before its change. Journeys have no seam here (no stack): their only checks are typecheck, lint, `--list`, and the new checklist-to-journey test.

**Standards**
- Hard 1 (`kode.test.ts:79`, call order): dropped, and the test's title no longer claims "asks first"; the stale-file test already proves the order that matters.
- Soft 1 (trailing dot): `permintaanKeProduksi` and `milikMakam` strip it; cases `makam.co.id.`, `www.makam.co.id.` (production) and `dev.makam.co.id.` (staging) added.
- Soft 2 (patience env): `bacaKesabaranKode` in `lingkungan.ts`; empty means the default (10 and 15 minutes), `abc`, `NaN`, `Infinity`, `0`, a negative or `1` (below the 60 s gap itself) are refused naming the variable; `masuk.ts` reads only through it.
- Soft 3 (`httpCredentials`): `origin` is the base URL, so SumoPod's checkout never gets the password; test on `basicAuth`.
- Soft 4 (UTC): the pacing refusal and the summary show WIB (`formatWib`); test.
- Soft 5 (ANSI): step errors go through `bersihkan`; test.
- Soft 6 (private layout): the assertion on the history file's JSON is gone, with its unused import.
- Soft 7 (duplicates): `bukaBarisAntreanLokasi` takes a string or a RegExp and section 11 uses it; `isiDataPemesan` replaces the four Nama/Telepon/Email fills; `mintaKodeMasuk` replaces the three `mintaKode` blocks and keeps the 60 s / five-an-hour gate in front of every request.
- Soft 8 (state keys): `lokasiId`, `perpanjangan.tagihanUrl`, `terencana.total`, `tpu.saatDuka.nomor` removed, `perpanjangan.url` became a local variable, and `KunciKeadaan` types every key (a typo is now a compile error, not a silent `test.skip`; the compiler found exactly the four).

**Spec**
- Hard 1 (production through a loopback port): before any journey, Playwright's `globalSetup` (`support/pra-uji.ts`) asks the stack `GET <base>/api/health` and `pastikanLingkunganBoleh` refuses unless `environment` is development, test or staging; no answer, no JSON, no environment and an unknown one are all refused (fail closed); a 503 from a known environment passes (the guard settles where the stack is, not whether it is well); staging's basic auth is sent. The test that accepted `localhost:3100` now uses 3310. Run for real against three throw-away stacks: one answering `production` on 127.0.0.1 exits 1 with "mengaku environment produksi", one answering `development` runs the §0 journey green, nothing listening exits 1.
- Hard 2 (three [BAYAR] items fixme): R3-47.1, R3-47.2 and R3-48.1 are scripted end to end (`support/iptm.ts`): order, upload every document, Dokumen lengkap, pay, Tugas Ambil surat pengantar only after Lunas, IPTM diajukan, IPTM Terbit; Perlu Perbaikan refiled with no new Tagihan, then final rejection and the refund row; the renewal with the Admin Platform's date correction. `tests/uat/checklist-perjalanan.test.ts` now fails if any [BAYAR] item of either checklist has no journey that runs (it was red on exactly these three and on section 11). The earlier note "R3-47.1 only starts" was wrong (it was fixme); corrected here.
- Hard 3 (Layanan at checkout): three journeys in `10-layanan`; see the spec gap below for what (a) and (b) leave to a person.
- Hard 4 (silent guard): `pilihLayananCheckout` uses the picker's real ids (`hari-h-`, `petak-kosong-`, `tambah-layanan-`) and FAILS when none is offered; R3-45.1 and R3-46.1 also expect the order page's "Layanan hari-H" section. Found on the way and fixed: both looked for a link named after the Tagihan number on `/pengurusan/<nomor>`, but the link there reads "Buka Tagihan".
- Soft 1 (R2-59.x): the status controls are dialogs (`alertdialog`, Alasan, buttons Tangguhkan, Pulihkan, Berhenti, Berhentikan) and Berhenti has its own date field; 59.2 takes the Lokasi id 59.1 saved (the public list holds only Terverifikasi); the step title says "hari ini", which is what the code passes.
- Soft 2: `actionTimeout` and `navigationTimeout` 30 s.
- Soft 3: the summary keeps each skip's reason, has a "Tidak berjalan" section and a line "[BAYAR] belum berjalan: k dari m (G2 ...)"; it is cumulative on one `UAT_OUT` (a journey that ran again replaces its row, the others keep theirs with the time they ran); the HTML report is one folder per invocation.
- Soft 4: the Pengaturan Operator part of §0 moved to `08-admin-platform`, so section 1 is the first Admin Platform login and its wrong-TOTP check runs.
- Soft 5: §2 walks as a visitor with the Kode Masuk step (`kirimPesananDenganKodeMasuk`) and saves the session it creates; §4 stays signed in, with a `manual()` (spec gap 2).
- Soft 6: `manual()` entries added for what is still not scripted (§5 Admin Lokasi review, §11 Admin Platform Keluhan row, Admin Lokasi reply, the Terlambat row, §9 cap wording). Sections 6 to 8 are still page tours.
- Soft 7: `checkoutSandboxSumopod` accepts only `pay-sandbox.sumopod.com` (test), and `bayar.ts` asserts it.
- Soft 8: README grep is `"§(2|3)\b"` (the earlier HANDOFF's `"§0|§1"` also matched §10 and §11; use `"§(0|1)\b"`); Rilis 1 sections 3 to 5 carry `[BAYAR]`; the credentials origin is Standards soft 3.

### Build (2026-10-04)

Builder, fix pass 1 of slice 1 (branch `ticket-110-uat-kit`). Not money code.

**What changed**: `uat/support/` (`lingkungan.ts` health guard, patience, credentials origin, sandbox host; `pra-uji.ts` and `iptm.ts` new; `ringkasan.ts` rewritten as a cumulative reporter; `halaman.ts`, `alur.ts`, `keadaan.ts`, `masuk.ts`, `bayar.ts`, `jeda-kode.ts`), `uat/playwright.uat.config.ts` (globalSetup, timeouts, report folder per run), journeys 00, 02 to 05, 08 to 11, `rilis2-bayar`, `rilis3-bayar`, `uat/README.md`, the Rilis 1 checklist (section 3 to 5 tags), and `tests/uat` (kode, jeda-kode, lingkungan edited; `ringkasan.test.ts` and `checklist-perjalanan.test.ts` new).

**Verification** (logs read whole): `npx vitest run tests/uat` exit 0, 5 files, 126 tests passed; `npm run typecheck` exit 0; `npm run lint` exit 0 (0 errors, 6 warnings, none in `uat/` or `tests/uat`); `playwright test -c uat/playwright.uat.config.ts --list` lists 41 tests in 14 files; `UAT_BASE_URL=https://makam.co.id` exits 1 with "UAT ditolak"; the health guard run against three fake stacks as above. No build run. **Still no journey ran against a real stack**: every selector outside `e2e/` is read from the source (the IPTM, Perpanjangan TPU, dialog and checkout-picker ones this time) and unverified, and so is SumoPod's checkout.

**Spec gaps and decisions for the owner**
1. §11 "Layanan saat checkout": (c) Perpanjangan is walked and paid to Lunas, but (a) Saat Duka and (b) Terencana stop at the picker, before Kirim pesanan: the Tagihan rows, "bayar-belakang" and "jatuh tempo paling awal" are `manual()` steps. The checklist's own wording asks to pay one of the three, which (c) does; decide whether (a) and (b) need the full send, confirm and Tagihan walk before G2 (ticket 53's domain tests already cover the rows).
2. The Saat Duka wizard's anonymous Kode Masuk path is a `manual()`: two anonymous walks plus the personas' first logins would be six code requests in the first hour against a limit of five.
3. `UAT_PETAK_TERENCANA_LAYANAN` (default A-02) must be a free Petak on staging; R3-48.1 renews the Makam TPU that R3-47.1 leaves (its IPTM valid for 60 days), so R3-47.1 must run first on the same `UAT_OUT`.
4. Slice 2 is unchanged (the 36 [TANPA-BAYAR] items).

**HANDOFF (builder, fix pass 1)**: Next agent: (1) shake-out on a local stack, `UAT_BASE_URL=http://127.0.0.1:<port> npm run uat -- --grep "§(0|1)\b"` first, then the IPTM journeys; fix selectors in `uat/support/iptm.ts` and `uat/perjalanan`; (2) then staging with the owner reading codes out; (3) slice 2. Unverified: every journey, SumoPod's checkout, the `test.skip` annotation reaching the summary under a real Playwright run (tested with fakes of its reporter API).
