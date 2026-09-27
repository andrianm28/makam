# Field roles on phones: bottom navigation for Mitra Jasa and Petugas Lapangan

Status: resolved
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Phone-first shell for the field roles: a bottom navigation instead of the sidebar, and job cards with one full-width action.

## Acceptance criteria

- [ ] Bottom navigation: Mitra Jasa — Pekerjaan, Pencairan, Peringatan, Akun; Petugas Lapangan — Tugas, Jadwal, Peringatan, Akun; safe-area aware; 44 px touch targets.
- [ ] Items whose pages later tickets build show an honest EmptyState in `CONTEXT.md` words (no ticket numbers, no promises of dates).
- [ ] The Bertugas status and push-permission panel keep working inside the new shell.

## Comments

- 2026-09-27 — Merged to main (d3dee6b). Two-axis review: Standards 0 hard violations (judgement calls only: mark-read logic in `mark-read-on-view.tsx` duplicates `notification-bell.tsx` — candidate for one shared hook; `staff-shell.tsx` now holds shell+header+account-menu+bottom-nav — candidate split; the per-route peringatan pages are justified Middle Men). Spec: no scope creep; the "Bertugas status" AC is unverifiable here because Bertugas itself is ticket 28 (not built yet) — the push-permission panel (`PushPanel`) is untouched by this diff, and the Bertugas part is deferred to 28. Merge conflict with ticket 78 (LokasiSwitcher) resolved keeping both intents.
