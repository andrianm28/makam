# Opening the staff bell crashes the page

Status: in-progress
Blocked by: —
Spec: spec.md (makam-v1), Notifications — Peringatan Staf (bell); ticket 97 (makam-v1-build)

## What to build

Found in the staging UAT on 2026-10-02. Clicking the bell (Peringatan Staf) in the staff header shows the framework error page; the browser logs Base UI error #31 (MenuGroupContext missing): `src/app/staf/notification-bell.tsx` renders `DropdownMenuLabel` (a Menu.GroupLabel) outside `DropdownMenuGroup`. The bell channel of a Peringatan Staf is therefore unusable for every staff role. Opening it still marks the alerts read.

## Acceptance criteria

- [ ] The bell opens and lists the latest Peringatan Staf, each linking to its subject.
- [ ] A guard fails if a menu label is used outside a menu group again.

## Comments

- 2026-10-02 — Filed from the UAT (orchestrator). Branch `fix/lonceng-menu-group`.
