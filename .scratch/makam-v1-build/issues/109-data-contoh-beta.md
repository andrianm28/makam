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
