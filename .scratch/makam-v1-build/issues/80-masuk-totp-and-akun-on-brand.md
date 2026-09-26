# Masuk, TOTP and Akun Saya on the brand

Status: ready-for-agent
Blocked by: 74, 82
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Bring the login and account pages onto the brand: Masuk (email only, ticket 82), the Kode Masuk step, TOTP enrolment and entry, Verifikasi email and Akun Saya.

## Acceptance criteria

- [ ] Light only (public-facing), brand tokens and components, phone-first, one decision per screen.
- [ ] Copy warm and clear per the brand voice, in `CONTEXT.md` words (Kode Masuk, not OTP alone; Email Terverifikasi).
- [ ] Every identity behaviour, limit and message unchanged; existing tests and e2e stay green.

## Comments

- 2026-09-26 — ADR 0004: Masuk is email only (no WhatsApp form, no "Masuk dengan email" switch, no fallback slot) and shows "Tidak punya email? Minta bantuan CS"; restyle after ticket 82. Now blocked by 82.
