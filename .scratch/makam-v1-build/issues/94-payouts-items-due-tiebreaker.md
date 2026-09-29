# Payouts `itemsDue` orders only by due time, so "oldest item first" can flake

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Payouts

## What to build

`src/domain/payouts/jumlah.test.ts` "oldest item first" failed once on item order during ticket 38's work and passed on re-runs. The re-review found the cause: `itemsDue` orders only by `jatuhTempoAt`, with no tiebreaker, so two items due at the same moment come back in any order. A flaky test is a real defect, not noise: give the order a deterministic tiebreaker (e.g. creation order, then id) and pin it with a test that makes two items tie.

## Acceptance criteria

- [ ] `itemsDue` returns items in a deterministic order when due times tie.
- [ ] A test with two items due at the same moment asserts that order.

## Comments

- 2026-09-29 — Filed at ticket 38's merge.
