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
