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
