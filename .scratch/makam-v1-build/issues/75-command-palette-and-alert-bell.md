# Command palette (⌘K) and the Peringatan Staf bell

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

The shell's quick navigation and alerts: ⌘K / Ctrl+K opens a command palette over the current role's menu (and the pages it links), and a bell in the header lists the signed-in staff member's Peringatan Staf, tied to the web push from ticket 21.

## Acceptance criteria

- [ ] ⌘K / Ctrl+K and a header search button open the palette; it lists only pages the current role may open, with keyboard navigation; choosing one navigates.
- [ ] The bell shows the unread count and the latest Peringatan Staf for the signed-in Akun, each linking to its subject; opening marks them read; an empty state when there are none.
- [ ] Role visibility is enforced on the server, not only hidden in the palette (test through the public queries).

## Comments

- 2026-09-26 — Also tidy these from ticket 74's re-review (user decision): one shared `sourceFiles()` helper in `tests/support` for the four source-scanning tests; the palette guard excludes only the `themeColor` lines of `src/app/staf/layout.tsx`, not the whole file; move the staff `viewport` into its own module so the token test need not import the layout; rename the menu flag `exact` to say it marks the Beranda.
