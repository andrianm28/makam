# Admin Lokasi area on the design system, with the Lokasi switcher

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Migrate the Admin Lokasi home, Jam Operasional and Audit Log pages, and add the Lokasi switcher in the header for an Admin Lokasi of more than one Lokasi Mitra.

## Acceptance criteria

- [ ] LokasiSwitcher in the header lists only the signed-in Admin Lokasi's own Lokasi Mitra and switches the page's Lokasi; hidden when there is one.
- [ ] Home, Jam Operasional and Audit Log on the design system patterns; the Audit Log keeps the Admin Lokasi view filter.
- [ ] Access unchanged and enforced on the server; existing tests stay green.
