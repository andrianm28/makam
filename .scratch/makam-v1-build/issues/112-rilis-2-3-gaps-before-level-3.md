# Rilis 2/3 gaps to close before production opens level 3

Status: ready-for-agent
Blocked by: none
Spec: Release plan; owner decision 2026-10-02 (masa tenggang queue row stays); tickets 42, 44, 45; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

Small gaps found by the 2026-10-04 readiness sweep that must be closed before production opens level 3:

1. **Masa tenggang queue row.** The "Hak Pakai in masa tenggang" queue row disappears when the grace period ends (`src/domain/inventory/masa-berlaku.ts:68`, test `masa-berlaku.test.ts:101-102`). The owner decided on 2026-10-02 that it stays until staff act.
2. **TPU guide page** (`src/app/(site)/pengurusan-tpu/page.tsx`, `src/lib/content-pages.ts`):
   - It still says "Segera hadir" for the IPTM flows that are built.
   - The filing-only form (`/pesan-makam/pengurusan-iptm`) has no public link.
   - "Perpanjang IPTM" must say it applies only to IPTMs filed through the platform.
   - DKI prices shown during the beta are labelled "harga contoh".
3. **Stale header comment** at `src/lib/rilis-peta.ts:9-12`.

## Acceptance criteria

- [ ] The masa tenggang queue row stays after the grace period ends, until staff act, with a test.
- [ ] The TPU guide page links the built flows (gated by the release as today), limits the Perpanjang IPTM promise to platform-filed IPTMs, and labels beta prices "harga contoh". The copy is proposed in Comments for the owner's sign-off.
- [ ] The rilis-peta header matches the current map.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB5). Not money code.
