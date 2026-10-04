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
