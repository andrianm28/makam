# No internal ticket numbers in user-facing copy

Status: ready-for-agent
Spec: Public site and routing decisions (copy is for families and staff, not for the build team)

## What to build

User- and staff-facing text must never name internal build tickets. Today the staff menus show "Segera hadir (tiket 17)" and similar (`src/app/staf/staff-role-home.tsx`, `src/app/staf/admin-lokasi/scope.tsx`), and the Pindah Nomor refusal says "(menunggu S3, tiket 60)" (`src/app/staf/admin-platform/pindah-nomor/actions.ts`). Staging is public, so this copy is visible to anyone. Also rename the stale test group in `src/domain/identity/email-login.test.ts` that still says "(staging and production until ticket 68)" — ticket 68 has landed.

## Acceptance criteria

- [ ] Placeholder menu items read "Segera hadir." with no ticket number.
- [ ] The Pindah Nomor storage refusal reads like the Lokasi one: "Penyimpanan berkas belum tersedia di lingkungan ini. Nomor belum dipindah." (no ticket reference).
- [ ] A test guards the rule: no string rendered by `src/app/**` (non-test source) matches `/tiket \d+/i` — e.g. a Vitest that scans the app source files' string literals, or the rendered menus and the refusal message.
- [ ] The email-login test group name no longer refers to ticket 68; behaviour tests unchanged.

## Comments

Implemented test-first. Added `src/app/no-ticket-numbers.test.ts`, a Vitest that walks every non-test `.ts`/`.tsx` file under `src/app`, strips line and block comments (leaving string/template contents intact), and fails listing each `file:line` matching `/\btiket\s+\d+/i`. Confirmed it failed red against the old copy with the 9 expected matches (the six placeholder menu items in `staff-role-home.tsx`, their two duplicates in `admin-lokasi/scope.tsx`, and the Pindah Nomor refusal), then made it pass:

- All six "Segera hadir (tiket N)." placeholders in `src/app/staf/staff-role-home.tsx` and the two duplicates in `src/app/staf/admin-lokasi/scope.tsx` now read "Segera hadir." (tickets 11/12 still own filling these in later; this change touches only the description text).
- The Pindah Nomor `berkas_gagal_disimpan` refusal in `src/app/staf/admin-platform/pindah-nomor/actions.ts` now reads "Penyimpanan berkas belum tersedia di lingkungan ini. Nomor belum dipindah.", matching the equivalent Lokasi Mitra refusal's wording. No existing test asserted the old text (no test file covers this Server Action directly), so nothing else needed updating.
- Renamed the stale `describe("when EmailSender refuses (staging and production until ticket 68)", …)` group in `src/domain/identity/email-login.test.ts` to `describe("when EmailSender refuses", …)`; behaviour unchanged.

Verified: `npm run lint` (exit 0), `npm run typecheck` (exit 0), `npm test` (468/468 passed, exit 0), `npm run build` (exit 0).
- 2026-09-26 — Two-axis review (mattpocock-skills:code-review): Spec clean; Standards found two false negatives in the hand-written comment stripper (a regex literal with escaped slashes swallowed the rest of the line; JSX text split across lines was invisible). Replaced with `tests/support/copy-scan.ts` using the TypeScript parser (string/template literals and JSX text only, whitespace-normalised), unit-tested for both cases, comments ignored and `//` in strings safe; the guard was proven to catch a split JSX `tiket 17` before restoring. Verified: lint 0, typecheck 0, Vitest 473/473.
