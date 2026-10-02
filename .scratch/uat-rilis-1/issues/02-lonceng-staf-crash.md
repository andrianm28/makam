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
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main 0ff5acb, branch at 864426f). Standards: 0 hard; judgement — guard test is file-level (does not prove the Label sits inside the Group), possible duplicated file walker in tests/tooling. Spec: ACs met (not verified at runtime); same weak spot: a file with one grouped menu and one bare Label would pass. Fix pass: make the guard check each `<DropdownMenuLabel` is enclosed by a `<DropdownMenuGroup>`.
