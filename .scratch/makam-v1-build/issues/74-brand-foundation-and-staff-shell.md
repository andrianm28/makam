# Brand foundation and the staff shell, with the Admin Platform home

Status: ready-for-agent
Blocked by: —
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Decided with the user on 2026-09-26. The first slice of the staff redesign: the brand design system becomes real on `main`, every staff role gets the new shell, and one page (the Admin Platform home) is migrated end to end as the tracer. The prototype is the reference for look and decisions, not code to merge: rebuild test-first, taking only what the slice needs.

## Acceptance criteria

- [ ] Brand tokens app-wide, light and dark (dark for the staff area only; the public pages stay light): Forest primary, Sage secondary (a darker sage for text), Sand only in `highlight` with `accent` a light Sand tint, Ivory page, warm off-white cards (#FCFAF5) with a faint shadow, Charcoal text, muted semantic colours, radius 10–12 px; WCAG AA for every text and badge pair (numbers in the doc).
- [ ] Plus Jakarta Sans for all UI, Geist Mono only for codes, tabular numbers in tables; Lora available for the public site only. The interim logo: the MAKAM.CO.ID wordmark beside the raster mark from the brand guideline, until the vector arrives.
- [ ] Shell for every staff role: collapsible sidebar with per-role menus (Admin Platform groups Kerja harian · Lokasi dan harga · Orang · Operator, Audit Log under Operator); the active item is a light Sage tint with semibold Forest text; header with breadcrumbs, role switcher (for an Akun with several staff roles), light/dark toggle and account menu (Keluar); a sheet sidebar on phones. Existing pages render inside it unchanged apart from tokens.
- [ ] The Admin Platform home uses PageHeader and StatCard with data that already exists; the makam compositions it needs are built here (PageHeader, StatCard, StatusBadge with the full status vocabulary: red only for act-now such as Terlambat, Berhenti grey, Dikonfirmasi green like Lunas, Belum Dibayar amber, EmptyState).
- [ ] `docs/design-system.md` on `main`: brand source, tokens, type scale, voice and guardrails (warm, clear, not judgemental; no hard selling, no uncertain claims, status and limits explained, privacy; "Dibantu, Jelas, Aman"), brand words vs the glossary (Tagihan never Invoice; no "Verified Partner" badge; TPS only in marketing).
- [ ] Copy in `CONTEXT.md` words; no ticket numbers in UI copy (ticket 69's guard stays green).
- [ ] A short Playwright smoke test: an Admin Platform signs in and moves between two menu items; the sidebar collapses; the theme toggles.
