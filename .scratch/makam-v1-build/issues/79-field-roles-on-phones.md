# Field roles on phones: bottom navigation for Mitra Jasa and Petugas Lapangan

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Phone-first shell for the field roles: a bottom navigation instead of the sidebar, and job cards with one full-width action.

## Acceptance criteria

- [ ] Bottom navigation: Mitra Jasa — Pekerjaan, Pencairan, Peringatan, Akun; Petugas Lapangan — Tugas, Jadwal, Peringatan, Akun; safe-area aware; 44 px touch targets.
- [ ] Items whose pages later tickets build show an honest EmptyState in `CONTEXT.md` words (no ticket numbers, no promises of dates).
- [ ] The Bertugas status and push-permission panel keep working inside the new shell.
