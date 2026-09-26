# Lokasi Mitra list and detail on the list and detail patterns

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Migrate the Admin Platform's Lokasi Mitra pages and Tarif global onto the design system's list and detail patterns.

## Acceptance criteria

- [ ] DataTable (TanStack Table) built here: search, status filter, StatusBadge, pagination, row actions, uniform empty / loading (skeleton) / error states, and the Nyaman / Rapat density switch shown only on dense tables (Lokasi Mitra list).
- [ ] Lokasi Mitra detail: header with status and actions, tabs Ringkasan, Tarif, Jam Operasional, Admin Lokasi, Audit Log; the publish-gate checklist shown on Ringkasan; Tarif global on the same patterns.
- [ ] ConfirmDialog built here, with a required reason where the domain asks one (e.g. Ditangguhkan).
- [ ] Every existing behaviour and Server Action unchanged; existing tests stay green.
