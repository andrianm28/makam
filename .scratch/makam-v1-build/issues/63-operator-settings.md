# Pengaturan Operator (Operator settings)

Status: ready-for-agent
Blocked by: 09
Spec: Domain modules > 17. Pengaturan Operator; 1. Identity & Access (first Admin Platform is the only seed); Billing > Documents (header); Public site > Content pages (Hubungi Kami); 15. Notifications (inbound auto-reply); stories 5, 72, 183, 188

## What to build

One Admin Platform–only "Pengaturan Operator" screen for the reference values that no other screen owns: the Operator's legal name, registered address and contact (phone, email), and the CS WhatsApp number with its reply hours (e.g. "dibalas mulai pukul 06:00"). Expose a small read function the other modules call instead of env config: document headers (ticket 18), the CS button and Hubungi Kami (ticket 26), the inbound auto-reply (tickets 20, 62), the OTP no-fallback pointer (ticket 67; was ticket 60 before 2026-09-25) and the night TPU submission text (ticket 44). The other reference values stay on their owning screens: Biaya Layanan Platform (ticket 12), DKI Biaya Pengurusan and the DKI TPU list (ticket 43), DKI Layanan prices and Mitra Jasa rates (ticket 49), the Nazhir list (ticket 58), the holiday list (ticket 11). Content page copy stays in code.

## Acceptance criteria

- [ ] Only Admin Platform can read the edit screen and write these values (authorisation check); every change is audited with before/after.
- [ ] Nothing here is seeded; the values are entered in the dashboard before launch (ticket 06). Test fixtures may set them.
- [ ] Consumers read the values through the module's public function, never from env or constants.
- [ ] Values are kept per change with its time, so ticket 18 can make an issued Tagihan or Bukti keep the header values in force when it was issued.
- [ ] The CS WhatsApp number is validated and normalised like account numbers (ticket 08).
- [ ] Tests: only Admin Platform can write; each write is audited; the read function returns the current values and the values in force at a given instant.

## Comments

- 2026-09-25 — Implemented on branch `worktree-agent-a4681d6b3d970b607` (not merged), test-first (mattpocock-skills:tdd). Glossary: **Pengaturan Operator** added to `CONTEXT.md` (Operations).
- **Migration**: one new file, `drizzle/0003_operator_settings.sql` (table `operator_settings_version` plus an append-only trigger, hand-added after the generated SQL like `0002`'s). **If main gains another `0003_*` first, regenerate it**: delete `drizzle/0003_operator_settings.sql` and its `meta/0003_snapshot.json` / journal entry, rebase, run `npx drizzle-kit generate --name operator_settings`, then paste the trigger block (the last two statements of the old file) back at the end.
- **Module**: `src/domain/operator-settings` (added to the module list in `AGENTS.md`), owns `operator_settings_version`. Wired in `serverRuntime().operatorSettings` as `createOperatorSettings({ db, clock, audit })`. Not yet in the worker's composition (nothing there reads it yet; tickets 20/62 add it when the auto-reply lands).
- **Settings shape** (`OperatorSettingsValues`, exported from `@/domain/operator-settings`; the six value names are `operatorSettingsFields`, their type `OperatorSettingsField`, one value per field `OperatorSettingsEntry`):
  ```ts
  {
    legalName: string;    // "PT Jaya Korpora Prima"
    address: string;      // registered address, free text, may span lines
    phone: string;        // Operator contact phone as typed (landline allowed), trimmed
    email: string;        // Operator contact email, trimmed, lower-cased
    csWhatsApp: string;   // canonical E.164 +62, e.g. "+6281122223333" (normalisePhoneNumber, ticket 08)
    csReplyHours: string; // e.g. "dibalas mulai pukul 06:00"
    inForceFrom: Date;    // Clock instant this version came into force
  }
  ```
- **Reads** (no authorisation: public values, read by server code only):
  - `operatorSettings.current(): Promise<OperatorSettingsValues | null>` — the values in force now.
  - `operatorSettings.inForceAt(instant: Date): Promise<OperatorSettingsValues | null>` — the last change made at or before `instant` (changes at the same Clock instant: the later one wins). For lookup and audit only; see ticket 18 below.
  - Both return **null before the first entry** (nothing is seeded, ticket 06). Every consumer must handle null (e.g. hide the CS button, refuse to issue a document), never fall back to an env var or a constant.
- **Write**: `operatorSettings.change(actor, { legalName, address, phone, email, csWhatsApp, csReplyHours, reason })` — all values at once, as a new version in force from the Clock's now. Refusals: `tidak_berwenang` (not Admin Platform), `perlu_totp` (both via identity's `writeRefusal`), `isian_wajib` + `field` (any of the six values blank, email and CS WhatsApp included), `email_tidak_valid` (non-blank, malformed), `nomor_tidak_valid`, `nomor_bukan_indonesia`. Audited as `pengaturan_operator.ubah` on entity `{ kind: "pengaturan_operator", id: OPERATOR_SETTINGS_ENTITY_ID }` (`"operator"`), `before` = the replaced values (null for the first), `after` = the new ones, optional reason. A per-transaction advisory lock (`operator_settings.change`) serialises changes so each `before` is exact. Versions are append-only (the database refuses UPDATE/DELETE).
- **Authorisation**: new `authorize()` actions `pengaturan_operator.lihat` and `pengaturan_operator.ubah` on `pengaturanOperatorResource()`, Admin Platform (past TOTP) only; the module re-checks `ubah` itself behind `guarded()`.
- **Web**: `/staf/admin-platform/pengaturan-operator` (page, `actions.ts` through `guarded()`, form; menu entry inline in `staff-role-home.tsx` after "Staf"). The form keeps what was typed after a refusal (Server Action test `actions.test.ts`). Runbook: pre-launch step added under "First Admin Platform".
- **E2E**: none for this ticket (it asks for no Playwright test; AGENTS.md). The rules are covered by the domain tests.
- **For ticket 18** (document headers): a Tagihan or Bukti **copies (snapshots) the header values onto its own row at issue**: inside the issuing transaction, read `current()` and copy `legalName`, `address`, `phone`, `email` onto the Tagihan / Bukti row. The page and the PDF render the header from that copy and never re-read Pengaturan Operator. `inForceAt(instant)` is for lookup and audit (what was in force then), not for re-rendering an issued document's header. If `current()` is null, refuse to issue (launch checklist not done) rather than printing an empty header.
- **For ticket 26** (CS button, Hubungi Kami, footer): read `serverRuntime().operatorSettings.current()` in the server component; `wa.me/${csWhatsApp.slice(1)}` for the CS link, `csReplyHours` next to it; Hubungi Kami shows `csWhatsApp` and `address`. When null, hide the CS button and show a neutral "Kontak segera tersedia" rather than a hard-coded number. The footer's "dikelola oleh PT Jaya Korpora Prima" is content copy (spec) and may stay in code, or read `legalName` for consistency.
- **For ticket 67** (OTP no-fallback pointer): `current()?.csWhatsApp` (E.164) and `csReplyHours` for "hubungi CS di …"; call it from the Masuk server component / action, not from the identity module (identity must not depend on operator-settings, which already imports identity's `writeRefusal` and `normalisePhoneNumber`). Handle null by omitting the number.
- **For tickets 20/62 and 44**: the same `current()`; add `createOperatorSettings` to the worker's composition when the auto-reply runs there.
- 2026-09-25 — Code-review fixes (same branch, test-first):
  - Removed `e2e/pengaturan-operator.spec.ts` (not asked for). The one screen-only behaviour it covered, "a refused save hands back what was typed", is now the Server Action test `src/app/staf/admin-platform/pengaturan-operator/actions.test.ts`.
  - Shared e2e helpers in `e2e/support/` (`numbers.ts`, `whatsapp-outbox.ts`, `masuk.ts`, `admin-platform.ts`); `staf.spec.ts` and `masuk.spec.ts` use them. The e2e Admin Platform is one known number (`081100000001`) seeded once per stack and reused when the seed CLI answers "sudah ada Admin Platform"; the CLI's refusal is unchanged. The whole Playwright suite runs in one go on one fresh stack.
  - Ticket 18 hand-off corrected (above and in the module's doc comments): snapshot from `current()` inside the issuing transaction; `inForceAt` is for lookup and audit.
  - New tests: Admin Lokasi, Petugas Lapangan and Mitra Jasa are each refused `change()` with nothing kept or audited; a blank email (and CS WhatsApp) is `isian_wajib`, a non-blank malformed email `email_tidak_valid`. "Who may open the screen" moved to identity's `authorize.test.ts`. `authorize()` has separate `lihat` / `ubah` cases.
  - Refactors: identity exports `writeRefusal(actor, action, resource)` (replaces the unexported `staffWriteRefusal`); the six values come from `operatorSettingsFields` everywhere (types, check, `toValues`, audit snapshot, form values, page, action schema); `OPERATOR_SETTINGS_ENTITY_ID`; lock key `operator_settings.change`; the action reuses `guarded()`'s parsed input.
  - **Verification**: lint 0, typecheck 0, Vitest 26 files / 266 tests (exit 0), `next build` 0, `build:worker` 0, Playwright 17/17 in one run on one fresh `makam-t63` stack (port 3324), then `down -v`. A second seed against that stack reuses the e2e Admin Platform (`fresh: false`). The first `npm test` attempt and the first stack build failed with "No space left on device" (the host disk is shared and was full); both passed on rerun, no code change.
