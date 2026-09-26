# Masuk, TOTP and Akun Saya on the brand

Status: ready-for-agent
Blocked by: 74, 82
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

Bring the login and account pages onto the brand: Masuk (email only, ticket 82), the Kode Masuk step, TOTP enrolment and entry, Verifikasi email and Akun Saya.

## Acceptance criteria

- [x] Light only (public-facing), brand tokens and components, phone-first, one decision per screen.
- [x] Copy warm and clear per the brand voice, in `CONTEXT.md` words (Kode Masuk, not OTP alone; Email Terverifikasi).
- [x] Every identity behaviour, limit and message unchanged; existing tests and e2e stay green.

## Comments

- 2026-09-26 — ADR 0004: Masuk is email only (no WhatsApp form, no "Masuk dengan email" switch, no fallback slot) and shows "Tidak punya email? Minta bantuan CS"; restyle after ticket 82. Now blocked by 82.
- 2026-09-26 (later) — **Built** on `main` afd355e (branch `ticket-80-masuk-brand`), after ticket 82 landed. Ticket 82's own build already carried out this ticket's restyle in the same pass (its Comments list Masuk, `KodeMasukForm`, Akun Saya, `/staf/email` and the CS-help link on brand tokens and components, in `CONTEXT.md` words, light-only via `forcedThemeFor()`). Reading every page in scope (`src/app/masuk/`, `src/components/kode-masuk/`, `src/app/staf/totp/`, `src/app/akun/`, `src/app/staf/email/`) found them already using `Card`/`Button`/`Input`, brand tokens (no raw hex or Tailwind palette colours) and glossary copy, with `no-ticket-numbers.test.ts` covering `src/app` and `src/components`.
  - **One gap found and fixed**: `src/app/staf/totp/totp-form.tsx` still had a hand-rolled `<input>` with an inline Tailwind class instead of the shared `Input` component (the pattern every other code field in scope uses), and its "Buka di aplikasi authenticator" link wasn't `text-brand` like other in-text links. Both restyled to match `KodeMasukForm`/`EmailSection`; no id, label, role or test id touched (`e2e/support/masuk.ts` still finds "Kode authenticator" by label and the button by name).
  - No behaviour, limit or message changed anywhere; this was restyle-only. No new dependencies.
  - **Verification**: this cloud container cannot reach the npm registry, so no local lint/typecheck/test/e2e; CI on push is the test loop (see the Status line for the run).
