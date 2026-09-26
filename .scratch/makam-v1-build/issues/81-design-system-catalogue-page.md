# Design system catalogue as an Admin Platform page

Status: resolved
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

The live catalogue becomes a real staff page for Admin Platform (not development-only), so anyone adding a feature sees the tokens and components available.

## Acceptance criteria

- [x] Reachable from the Admin Platform menu (Operator group) and ⌘K once ticket 75 exists; Admin Platform only, enforced on the server.
- [x] Shows colour tokens (hex and oklch, read from the token source at request time so it cannot drift), the type scale, every makam composition built so far and every StatusBadge.
- [x] `docs/design-system.md` links to it.

## Comments

- 2026-09-26 — Orchestrator, cloud session 3: built as Katalog Desain (`/staf/admin-platform/desain`, Operator group + ⌘K, `staffMenuActor("admin_platform")`), colour tokens parsed from `globals.css` at request time (`src/lib/design-tokens.ts`). First CI red: the `:root` regex missed indented selectors, fixed in eab549d. Two-axis review clean (one judgement call: duplicated light/dark swatch shape). Merge conflict with ticket 15 in `staff-navigation.test.ts` resolved by keeping both new items. Merged into `main`.
