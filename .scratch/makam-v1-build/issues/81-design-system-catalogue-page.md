# Design system catalogue as an Admin Platform page

Status: ready-for-agent
Blocked by: 74
Spec: Implementation Decisions > Staff UI and design system; docs/brand/brand-guideline-visual-2026.pdf; prototype branch `worktree-agent-aebfc82ebc2eab39d` (commit 282bcc0: `docs/design-system.md`, `/pratinjau/staf`, gallery https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx)

## What to build

The live catalogue becomes a real staff page for Admin Platform (not development-only), so anyone adding a feature sees the tokens and components available.

## Acceptance criteria

- [ ] Reachable from the Admin Platform menu (Operator group) and ⌘K once ticket 75 exists; Admin Platform only, enforced on the server.
- [ ] Shows colour tokens (hex and oklch, read from the token source at request time so it cannot drift), the type scale, every makam composition built so far and every StatusBadge.
- [ ] `docs/design-system.md` links to it.
