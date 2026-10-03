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
