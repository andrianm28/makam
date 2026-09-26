# Lokasi Mitra list and detail on the list and detail patterns

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Migrate the Admin Platform's Lokasi Mitra pages and Tarif global onto the design system's list and detail patterns.

## Acceptance criteria

- [x] DataTable (TanStack Table) built here: search, status filter, StatusBadge, pagination, row actions, uniform empty / loading (skeleton) / error states, and the Nyaman / Rapat density switch shown only on dense tables (Lokasi Mitra list).
- [x] Lokasi Mitra detail: header with status and actions, tabs Ringkasan, Tarif, Jam Operasional, Admin Lokasi, Audit Log; the publish-gate checklist shown on Ringkasan; Tarif global on the same patterns.
- [x] ConfirmDialog built here, with a required reason where the domain asks one (e.g. Ditangguhkan).
- [x] Every existing behaviour and Server Action unchanged; existing tests stay green.

## Comments

- 2026-09-26, build agent. Continued from a WIP worktree that already had `searchLokasiMitra` (search, status filter, pagination, tested) and `publishGate()` (pure, tested) in `src/domain/lokasi`; kept both and built the UI on top, test-first where there was new domain logic and against the existing suite everywhere else.

  What was built:
  - **`DataTable`** (`src/components/makam/data-table.tsx`, rebuilt from the prototype, not merged): TanStack Table v9 (`tableFeatures`), search, one status filter (shadcn `select`, added here), a row-action menu, the Nyaman / Rapat density switch, and the empty / "no matches" states. A new `manual` mode drives search, filter and pagination from the caller instead of the table's own client-side row models, for a server-side query — used by the Lokasi Mitra list against `searchLokasiMitra`, URL-driven (`?q=&status=&page=`) via `router.push`. `DataTableSkeleton` (same file) is its `loading.tsx` shape.
  - **`ConfirmDialog`** (`src/components/makam/confirm-dialog.tsx`, wraps shadcn `alert-dialog`, added here): title, description, an optional required-reason textarea, default or destructive confirm. The confirm button and reason field carry the outer `<form>`'s `id` (Base UI portals the dialog's content), so it submits the existing Server Action unchanged. Wired to the one existing action that already took a reason for something irreversible: Lepas Admin Lokasi.
  - **`PageTabs`** (`src/components/makam/page-tabs.tsx`, added here): the Detail pattern's tabs, each its own URL.
  - **Lokasi Mitra list** (`src/app/staf/admin-platform/lokasi/page.tsx` + `lokasi-table.tsx`): `PageHeader`, the create form unchanged, then `DataTable` in `manual` mode against `searchLokasiMitra`. `loading.tsx` / `error.tsx` added for the uniform skeleton / error states.
  - **Lokasi Mitra detail**: a new `[lokasiId]/layout.tsx` (`PageHeader` with `StatusBadge`, a disabled "Ubah status" action — Ditangguhkan/Terverifikasi are tickets 59/16, not built yet — and `PageTabs`) wraps five tab routes: `page.tsx` (Ringkasan: the publish-gate checklist computed from each owning module's own queries — agreement, `tariffs.asStaff().tariffsChecked()`, `jamOperasional`, `kontakSiaga`; Kunjungan Verifikasi has no recording mechanism anywhere yet, so it never shows met — then the existing Profil/Perjanjian/Rekening/Dokumen/Kebijakan sections, unchanged), `tarif/page.tsx` (existing content, header removed in favour of the layout's), `jam-operasional/page.tsx` (new tab reusing Admin Lokasi's own `JamOperasionalForm`/`KontakSiagaForm` and their Server Actions unchanged), `admin-lokasi/page.tsx` (the Admin Lokasi section moved here, `RemoveAdminLokasiForm` now a `ConfirmDialog`), `audit-log/page.tsx` (existing content, header removed).
  - **Tarif global** (`src/app/staf/admin-platform/tarif/page.tsx`): `PageHeader` in place of the raw heading and back-link; forms and history unchanged.
  - **Audit Log table** (`src/app/staf/lokasi/audit-log-table.tsx`, shared with Admin Lokasi's own Audit Log page): now a `DataTable` (client mode: search, pagination), so both roles get it; entries and columns unchanged.
  - `subPages` in `src/app/staf/navigation.ts` gained `admin-lokasi: "Admin Lokasi"` for the new tab's breadcrumb.

  Judgement calls:
  - `searchLokasiMitra`'s server-driven search/filter/pagination is used (URL query params, not client-side filtering of a fetched-all list) since the WIP domain work was already built and tested, and it is the more correct pattern for a list that can grow; the prototype's own `DataTable` filtered a fully-loaded array, which the `DataTable` component still supports (no `manual` prop) for a small, bounded list.
  - Kunjungan Verifikasi and the Ditangguhkan/Terverifikasi transitions have no domain support yet (tickets 16, 59): the Ringkasan checklist shows Kunjungan Verifikasi as never met (honest: nothing records it), and the header's status action is disabled ("Segera hadir"), per the guardrail against uncertain claims — no fabricated button that would not do anything.
  - Jam Operasional and Kontak Siaga's forms and Server Actions already existed under Admin Lokasi's own route (an earlier ticket); the new Admin Platform tab imports them directly rather than duplicating the zod parsing, since `guarded()` already authorises "the Admin Lokasi (or Admin Platform)" for both.

  Verification: `npm run lint` and `npm run typecheck` clean; `npm run test:shared` 89 files, 916 tests passed (unchanged domain test count plus the WIP's `lokasi-list.test.ts` and `publish-gate.test.ts`); `npm run build` and `npm run build:worker` OK. No Playwright change: the existing `e2e/staf.spec.ts` smoke test only asserts the "Lokasi Mitra" `h1` and the URL, both unchanged; not re-run here (not requested, no local stack).
