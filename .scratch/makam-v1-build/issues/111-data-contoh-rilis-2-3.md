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
