# main CI red: the two seed-command tests fail on CI

Status: ready-for-agent
Blocked by: —
Spec: — (CI/test reliability, not product behaviour)

## What to build

On `main`, CI's `Lint, typecheck, Vitest` and `Migration upgrade` jobs fail on exactly two tests, deterministically in CI (both re-runs), while every other test passes (2578/2580):

- `src/cli/seed-contoh-publik-command.test.ts:123` — `AssertionError: expected undefined to deeply equal { effectiveOn: '2027-01-01', …(1) }`. The seed succeeds (`result.exitCode` is 0, five Lokasi, terencanaAktif and photos/facilities assertions all pass) but `setup.tariffs.lokasiPricing(firdausId, clock.now()).jenisMakam.find((card) => card.jenisMakam.name === "Makam Standar")?.hakPakai.scheduledChange` is undefined; the seed sets `hargaBaru: { effectiveOn: "2027-01-01", hargaHakPakai: 9_000_000 }` (`seed-contoh-publik-command.ts:289`, applied near `:958`).
- `src/cli/seed-saat-duka-command.test.ts:31` — `TypeError: Cannot read properties of undefined (reading 'lokasi')`: `(await setup.pemesanan.pilihanSaatDuka())[0]` is undefined after the seed ran.

Neither reproduces locally here (the seed test needs a container runtime, unavailable). The same two jobs also failed on the docs-only `365b900` commit while `3c9ff402` was green, so the cause may be flakiness/ordering as well as drift.

## Acceptance criteria

- [ ] `npm test` (the full suite) passes on CI for these two files, deterministically across at least two runs.
- [ ] The root cause is named in `## Comments` (a drift in the seed/a module it calls, or the flakiness mechanism), and closed by a change, not a loosened assertion.
- [ ] If the failure is proven to be environment-only (not code), say so with the evidence instead of changing the tests.

## Comments

- 2026-10-01 — Filed from the Rilis 1 merge batch CI (runs for `efc72425` and the `c918bbb8` contract fix both fail these two), and pre-existing on `365b900`.
