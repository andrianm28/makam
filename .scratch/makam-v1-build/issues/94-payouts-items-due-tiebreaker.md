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
- 2026-09-30 — Builder: `itemsDue` (and `pencairanJatuhTempo`, which reads the same items) now order by `jatuhTempoAt`, `dibuatPada`, `nomorPemesanan`, `tagihanPosisi`, `id`. Also given an `id` tiebreak because a result depends on their order: `potonganBerjalan` (the oldest-first Potongan a run nets, partial netting reaches the first line), the `urut` sort in `transfer.ts` (same order, kept in step), `itemsBelumJatuhTempo`, and the display lists (`potonganOfLokasi`, `potonganPerluOffline`, Lokasi and Mitra Jasa item lists). Already deterministic: `kurangiPencairanPesanan` (`tagihanPosisi`, `id`), transfer locks (`id`); order-independent (sums only): `kurangiPencairanSebisanya`, `terapkanPenguranganTertunda`, the trigger's `dibayarPada` scans (each order is independent). New test in `jumlah.test.ts` pins Hak Pakai before Biaya Pemakaman after repeated rewrites of the Hak Pakai row. Honest limit: on Postgres 16 I could not make it fail before the fix (two tied rows came back Hak Pakai first with heap order both ways), so it pins the order rather than proving the old flake. Tests ran on a local Postgres 16 (no Docker in this session); `tests/tooling/db-backup.test.ts` needs Docker and could not run.
