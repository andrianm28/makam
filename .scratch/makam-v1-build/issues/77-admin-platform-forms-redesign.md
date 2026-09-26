# Admin Platform forms on the form pattern

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Migrate Pengaturan Operator, Hari Libur Nasional, Pindah Nomor and Staf (Undangan Staf) onto the form pattern.

## Acceptance criteria

- [ ] FormSection built here; forms use react-hook-form with the same Zod schemas the Server Actions use, inline validation, and a Sonner toast with the result.
- [ ] Server-side errors show next to their field or as one clear message in `CONTEXT.md` words.
- [ ] Every existing behaviour, audit entry and Server Action unchanged; existing tests stay green.
