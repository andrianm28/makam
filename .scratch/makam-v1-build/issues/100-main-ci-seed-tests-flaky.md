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
- 2026-10-01 — Builder. Root cause: a clock mismatch between the seed commands and the tests, not a module drift. `createAdapters` gives development and test the `SystemClock` (`src/composition/adapters.ts`), so each seed writes tariff versions with `effectiveOn = wibDateOf(real now)` and `inForceFrom = real now` (`inForceFromFor`, `src/domain/tariffs/versions.ts`). The tests read back through the test-support `FakeClock` pinned at `2026-10-01 09:00` WIB. On 2026-10-01 after 09:00 WIB (09:00 WIB = 02:00 UTC) every seeded version comes into force after that fixed read instant, so `inForceAt` returns null: `lokasiPublicPricing` drops the "Makam Standar" card (`!jm.inForce`) and `saatDukaHarga` refuses with `tarif_belum_ada`, and `pilihanSaatDuka` returns no group. That is why the docs-only `365b900` failed while `3c9ff402` (pushed 01:16 WIB) was green; the window closed at 09:00 WIB and the failure is deterministic forever after. No product module changed shape.
- 2026-10-01 — Builder fix. Gave both seed commands an optional injected `Clock`, the same pattern as `import-katalog-lama-command.ts` (`options.clock` → `createAdapters({ overrides: { clock } })`): `seedContohPublikCommand(..., options)` and `seedSaatDukaCommand(..., options)`. The two tests now pass `new FakeClock(wib("2026-10-01 09:00"))`, the same instant their `publishOnTestDatabase`/`pemesananOnTestDatabase` read back through, so a version entered "today" is in force and the 2027-01-01 change is scheduled. Assertions unchanged.
- 2026-10-01 — Builder verification. Cannot run the seed tests here: Docker/testcontainers is denied and there is no local Postgres (`TEST_DATABASE_URL` unset), so `npx vitest run` stops at `tests/global-setup.ts`'s container start. Verified `npm run lint`, `npm run typecheck` and one `npm run build` (all exit 0; `.next`/`dist` removed). Root cause reproduced without the DB through the pure `inForceFromFor`/`inForceAt`/`nextAfter`: seed entered 12:00 read at 09:00 → `inForce` null; seed clock pinned to 09:00 → `inForce 2026-10-01`, scheduled `2027-01-01`. Next agent: run the two files on a stack with a container runtime to confirm green, then the full suite.
