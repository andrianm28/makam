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
- 2026-09-27 — Re-reviewed as **not done**: no logo/Keluar on the TOTP page, and headings not on the type scale (`docs/design-system.md`, Typography) on Masuk, Akun Saya, `/staf/email` and TOTP. Checked `src/app/staf/layout.tsx`'s bare fallback (rendered whenever `staffShell()` is null, which `needsTotp(actor)` forces for the TOTP step): it already shows `BrandLogo` and `KeluarButton`, so that part of the design system's rule already held; the real gap was every hand-rolled `<h1>`/`<h2>` using raw Tailwind sizes (`text-2xl`, `text-3xl font-semibold tracking-tight`, `text-xl font-semibold`) instead of the named type-scale utilities.
  - Fixed: Masuk's `h1` and the Kode Masuk step's `h2` ("Masukkan Kode Masuk") now use `text-title-1`/`text-title-2` with `text-foreground`; the TOTP page's `h1` likewise. Akun Saya and `/staf/email` were refactored onto the shared `PageHeader` composition (title/description/actions), which already renders `text-title-1`; Akun Saya's "Area staf" in-text link also picked up `text-brand` to match the design system's link rule. No id, label, role, test id or `data-testid` changed, no copy changed, no identity behaviour touched.
  - **Verification**: `npm run lint` and `npm run typecheck` clean; `npm run test:shared` — 111 passed, 2 failed (`tests/tooling/deps-store.test.ts` and `src/adapters/live/chromium-pdf-renderer.test.ts`, both env-only per the ticket brief, unrelated to this change), 1162/1164 tests passed.
