# Admin Platform forms on the form pattern

Status: resolved
Blocked by: 74, 82
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Migrate Pengaturan Operator, Hari Libur Nasional, Pemulihan Akun (was Pindah Nomor; ticket 82) and Staf (Undangan Staf, addressed to an email) onto the form pattern.

## Acceptance criteria

- [ ] FormSection built here; forms use react-hook-form with the same Zod schemas the Server Actions use, inline validation, and a Sonner toast with the result.
- [ ] Server-side errors show next to their field or as one clear message in `CONTEXT.md` words.
- [ ] Every existing behaviour, audit entry and Server Action unchanged; existing tests stay green.

## Comments

- 2026-09-27 — Merged to main (`5ab4217`). Standards axis: 0 hard violations. Spec axis found one real AC3 regression (forms no longer cleared themselves after a successful submit, because moving to `onSubmit` + manual FormData lost React's reset) plus a mixed `noValidate`/`required` rule; both fixed and re-reviewed 8/8 clean. Dependencies `react-hook-form`, `@hookform/resolvers` and `sonner` are the ones the spec names ("Form (react-hook-form + Zod, the same schemas the Server Actions use), Sonner toasts"), and `main` had no toast at all. Form rule now stated once and guarded by a test: pattern forms carry `noValidate`, never `required`, Zod is the only validator.

- 2026-09-26 — ADR 0004: Pindah Nomor is replaced by Pemulihan Akun and the Undangan Staf form takes an email (phone as contact), both in ticket 82; restyle them after 82 lands. Now blocked by 82.
