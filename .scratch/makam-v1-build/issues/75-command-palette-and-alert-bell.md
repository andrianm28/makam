# Command palette (⌘K) and the Peringatan Staf bell

Status: resolved
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

The shell's quick navigation and alerts: ⌘K / Ctrl+K opens a command palette over the current role's menu (and the pages it links), and a bell in the header lists the signed-in staff member's Peringatan Staf, tied to the web push from ticket 21.

## Acceptance criteria

- [x] ⌘K / Ctrl+K and a header search button open the palette; it lists only pages the current role may open, with keyboard navigation; choosing one navigates.
- [x] The bell shows the unread count and the latest Peringatan Staf for the signed-in Akun, each linking to its subject; opening marks them read; an empty state when there are none.
- [x] Role visibility is enforced on the server, not only hidden in the palette (test through the public queries).

## Comments

- 2026-09-26 — Also tidy these from ticket 74's re-review (user decision): one shared `sourceFiles()` helper in `tests/support` for the four source-scanning tests; the palette guard excludes only the `themeColor` lines of `src/app/staf/layout.tsx`, not the whole file; move the staff `viewport` into its own module so the token test need not import the layout; rename the menu flag `exact` to say it marks the Beranda.
- **2026-09-26, build agent.** Picked up mid-way (schema and module functions already written) in the existing worktree, rebased onto `main` past ticket 19 (payment through the PaymentProvider port) and the QRIS cap fix; the migration was regenerated as `0011_parallel_falcon` (0010 had since been taken by `0010_payment_through_provider`). Built the remaining UI test-first where there is behaviour, plus the four tidy-ups.

  What was built:
  - **`notifications_staff_alert`** (`src/domain/notifications/schema.ts`, migration `0011_parallel_falcon`): one row per Peringatan Staf sent, owned by the notifications module — title, body, the staff page of its subject, `sentAt`, `readAt`. Kept regardless of whether the WhatsApp/push send itself later fails, so the bell always reflects what was raised. `Notifications.staffAlerts(by, { limit? })` returns the signed-in Akun's unread count and latest (`STAFF_ALERTS_SHOWN = 10` by default) newest first; `markStaffAlertsRead(by)` marks every one of that Akun's alerts read. Both are guarded by a new `akun.peringatan` action (own Akun, any staff role, same shape as `akun.push`) — never another Akun's. This stays channel-agnostic (title/body/url only) so ticket 82's move from WhatsApp to email delivery won't need to touch it.
  - **The command palette** (`CommandPalette`, `src/app/staf/command-palette.tsx`): a header search button plus a global `⌘K`/`Ctrl+K` listener open a dialog (Base UI `Dialog`, matching the `Sheet` pattern already in `src/components/ui/sheet.tsx`) with a search input and a keyboard-navigable list (arrows, Enter, Escape via the dialog itself). Items come from `staffPalette(role, lokasi)` (`src/lib/staff-navigation.ts`), computed server-side per role in `staffShell()` and handed to the client only as plain `{ label, href }` groups — a role never receives another role's pages, and an Admin Lokasi only ever receives its own Lokasi Mitra (`src/server/staff-shell.test.ts`, "the command palette (role visibility on the server)"). The palette shows the role currently active in the sidebar (`menuRole()`), same scope as the sidebar menu.
  - **The Peringatan Staf bell** (`NotificationBell`, `src/app/staf/notification-bell.tsx`): a header dropdown (reusing `DropdownMenu`) with the unread count as a small badge, the latest alerts (unread ones bold) each linking to its subject, and "Belum ada Peringatan Staf." when empty. Opening it calls `bacaPeringatanStaf()` (`src/app/staf/alert-actions.ts`, a `guarded()` Server Action) and refreshes the route so the count and bold state catch up.
  - **The four tidy-ups**: `tests/support/source-files.ts` is now the one `sourceFiles()` used by `dependency-direction.test.ts`, `no-ticket-numbers.test.ts`, `no-ops-email-verification.test.ts` and `brand-tokens.test.ts`. The viewport moved to `src/app/staf/viewport.ts` (`layout.tsx` re-exports it), so `brand-tokens.test.ts` imports it directly instead of the whole layout (dropping the `vi.mock("server-only")` that import chain needed) and its palette guard now excludes only the lines that hold `color: "#…"` in that one file, not the file as a whole. `navigation.ts`/`.test.ts` moved to `src/lib/staff-navigation.ts` (ticket 74 had left it under `src/app/staf`, which the new dependency-direction guard would otherwise have allowed to import from `src/app`); the `exact` flag is now `isBeranda`.

  Judgement calls:
  - The palette is built on Base UI's `Dialog` plus a hand-rolled filtered list rather than its `Autocomplete`/`Combobox` (also available in this project's `@base-ui/react`): a command palette is a centred modal, not an anchored dropdown, which is what `Autocomplete`'s positioner assumes. The list is a simple case-insensitive substring match over `"<group> <label>"`; fine at this size (a role's built pages plus its Lokasi Mitra).
  - No Playwright smoke test: this ticket's acceptance criteria don't ask for one (unlike ticket 74's), and both new pieces are exercised by `src/server/staff-shell.test.ts` through the public `staffShell()`/`Notifications` queries, per AGENTS.md's testing rules.

  Verification: `npm run lint` clean; `npm run typecheck` clean; `npm run test:shared` 92 files, 971 tests passed; `npm run build` and `npm run build:worker` OK.
