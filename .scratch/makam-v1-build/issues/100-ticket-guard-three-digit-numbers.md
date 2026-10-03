# The ticket guard reads three-digit ticket numbers

Status: ready-for-agent
Blocked by: —
Spec: AGENTS.md, Working agreements (the index and the review record are machine-checked); the owner's `/to-tickets` of 2026-10-03

## What to build

Ticket numbers have reached 100, but the ticket guard reads only two-digit names: a file named `100-….md` is not counted as a ticket, so the count of ticket files fails, or it would be read as ticket 10. Make the guard read a ticket number of two or more digits, so ticket 100 and every later one is checked like the others: its `Status:` against `00-index.md`, the index's summary sentence and the review marker. Tickets 100 and 101 reach `main` together with this change, which is what makes the tree green again.

## Acceptance criteria

- [ ] A ticket file numbered 100 or above is read under its full number and counted; two-digit names are read exactly as today.
- [ ] Its `Status:` is checked against `00-index.md`, and the index's summary sentence counts it, like any other ticket.
- [ ] Tested through the guard's own helpers: `100-x.md` is ticket 100, never 10; and the guard passes on the tree that holds tickets 100 and 101.

## Comments

### 2026-10-03 builder

The guard (`tests/support/ticket-workflow.ts`) now reads ticket numbers of two or more digits: new `ticketNumber(name)`, `TICKET_FILE_NAME` = `^\d{2,}-...`, index row link `\[(\d+)\]`; `tests/tooling/ticket-workflow.test.ts` reads the tree through `ticketNumber`. The old test that asserted a `100-*.md` file is refused was replaced by one asserting it is counted. One-digit names (`9-x.md`) are still refused. Tests/tooling: 21 files, 274 passed, 1 skipped; lint and typecheck clean. No spec gaps.

### 2026-10-03 review (head 819a4b98, fixed point origin/main)

**Standards: 0 blocking / 0 should-fix / 3 nit.** No hard AGENTS.md violation; one red/green commit pair per behaviour. Nits: (1) `ticketNumber` assumes a dash is present (safe after the `TICKET_FILE_NAME` filter; a doc note on the precondition would help); (2) the "two or more digits" comment and `padStart(2)` are fine, no change; (3) the "index rows" describe block sits between the number tests and the naming tests, minor placement.

**Spec: 0 blocking / 0 should-fix / 1 nit.** AC1–AC3 met; scope clean (tickets 101, other tickets, index rows and summary sentence untouched since fb90a143). Nit: no unit test pins the summary sentence's parenthetical list with a three-digit number; it is covered only by the real-tree check.

No fix pass and no re-review: nothing blocking or should-fix. The nits are left as they are.
