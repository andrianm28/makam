# Bun vs Node: where the test time goes, and what to do (2026-10-03)

Asked by the owner: tests are too slow; analyse and plan a Node → Bun move. Measured first. Bun source notes (with URLs) are in `bun-sources.md` next to this file; claims below marked *(src)* come from there.
"Measured" = I read it from a log or timer. "Estimate" = derived from measurements. "Not measured" = say so.

## 1. Where the time goes

### CI (main run 70a8772, run #384, GitHub Actions job records)
| Stage | Time | Note |
|---|---|---|
| Whole run, start → signed | **23 m 17 s** | other recent green main runs: ~20–24 min (start/end stamps of #380–#384) |
| `check` job | 16 m 40 s | `npm ci` 25 s, lint 22 s, typecheck 21 s, **`npm test` 15 m 05 s**, rest ~35 s |
| `migrations` job (parallel to `check`) | 15 m 41 s | runs the domain tests **a second time** (step 11: 15 m 41 s), not on the critical path, doubles CI minutes |
| `image` build | 3 m 30 s | starts only after `check` passes (`needs: check`, ci.yml:170) |
| `e2e` | 2 m 28 s | Playwright itself 70 s; image start 30 s; `npm ci` 22 s; browser deps 17 s |
| `scan` (Trivy) | 1 m 12 s | parallel to e2e, not critical |
| deploy-gate + sign | ~35 s | |

Critical path ≈ check 16.7 + image 3.5 + e2e 2.5 + gate/sign 0.6 ≈ 23 min. **The Vitest suite is ~65 % of the wall clock.**

### Local full run (this sandbox: 4 vCPU, 16 GB, Postgres 18.6 in Docker, `TEST_DATABASE_URL`, i.e. no container start in the run)
- 343 files, 3191 passed / 1 skipped, exit 0. **Wall 1406 s (23.4 min)** by my timer; Vitest "Duration 1396 s (tests 79 %, import 20 %, transform 1 %)". CI's runner did the same in 905 s, so this box is ~1.55× slower; use ratios, not absolutes.
- `vitest.config.mts` sets `fileParallelism: false`: **one file at a time, one worker**, one shared database (`globalSetup`). CPU count therefore doesn't help.
- Sum of per-file times: 1047 s. Wall minus that = ~349 s ≈ **1.0 s per file between files** (new worker/module graph per file). Inferred from the difference, not timed directly.
- Median file 1.6 s, p90 6.3 s. The top 20 files are 39 % of file time.

| Contributor | Seconds (local) | How known |
|---|---|---|
| Per-file overhead (worker spawn, import graph, setup) | ~349 (25 %) | inferred: wall − Σ file times |
| 8 slowest files: seed-contoh-publik-command 86, makam-arsip-app-lama 57, db-backup 34, seed-representative 27, smtp-email-sender 17, shared-test-postgres 16, makam-preflight 14, chromium-pdf-renderer 13 | ~263 (19 % of wall) | measured. They spawn CLIs, Docker, SMTP or Chromium: process-bound, not JS-bound |
| `resetDatabase()` before every test (`truncate` of all 111 tables, `restart identity cascade`; 213 files use it) | **~500 s (≈35 % of wall)** | **estimate**: measured 170–370 ms per truncate (5 tables: 11–22 ms, 20: 60–100 ms, 111: 140–370 ms) × roughly 2,000 tests that reset. The exact number of resets was not counted. Check: pembatalan-terencana.test.ts, 35 tests, 25 s of tests ≈ 35 × 0.25 s = 9 s |
| Domain work + Postgres commits | remainder | not separated |
| Migrations in globalSetup | **0.8 s** (64 migrations on an empty DB) | measured. Not a problem |
| Postgres container start (default `npm test`) | not measured (CI uses a service container, ~13 s "Initialize containers") | |
| Transforms | ~1 % per Vitest's own split | measured |

Top contributors, in order: (1) per-test truncate of every table, (2) per-file worker overhead with no file parallelism, (3) a handful of process-spawning tooling tests, (4) CI running the same suite twice.

## 2. What Bun would change (primary sources: see `bun-sources.md`)

Measured here (Bun 1.3.14, the version installed on this box), file `pembatalan-terencana.test.ts`, same Postgres:
- Node `npx vitest run`: 30.7 s, 34.2 s (2 runs; run-to-run noise ~10 %).
- `bun --bun x vitest run`: **38.7 s** (1 run). It passed 35/35 but printed drizzle/pg error stack frames during the run. **Bun was not faster, it was ~15 % slower on this file.** One sample, one file: indicative only.
- Why: the file is 80–86 % "tests" time = Postgres round trips and truncates; runtime start-up/transform are the small slice (transform 12 %, import 4 %) that Bun can speed up. Same conclusion in the source notes.

From the sources:
- **Next 16.3.7**: its own docs treat Bun as a package manager only; minimum Node 20.9 *(src: node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md)*. Bun's docs support `bun --bun next`; Bun 1.4 notes claim 16.3 builds work *(src)*. A Vercel community thread reports Next 16.3 failing on Bun 1.3.12 and working on 1.3.14 *(src)*: support moves with Bun patch versions.
- **Vitest**: docs say use `bun run test`, not `bun test`; no statement that Bun is a supported runtime *(src)*. `bun test` would mean rewriting `globalSetup`/`inject` and the 42 files using `vi.mock`/fake timers, and Bun's fake timers don't change `Date` the way Vitest's do *(src)*: our fake Clock rule would need re-checking. Not recommended.
- **Libraries**: pg-boss lists Bun as supported *(src)*. `pg`, `@sentry/nextjs`, `@sentry/node`, nodemailer, web-push, Testcontainers on Bun: **UNVERIFIED** (no primary page; not run). Playwright officially lists Node only *(src)*. Drizzle's Bun SQL driver page was pre-release *(src)*, and we use `pg`.
- **Docker/deploy**: all stages are `node:22-bookworm-slim` by digest; `node server.js`, `node dist/worker.mjs`, `node dist/migrate.mjs`; ci.yml:156 runs `node dist/migrate.mjs` inside the previous release image. Worker/migrate bundles are esbuild `platform:node`. A Bun image means a new digest policy, new lockfile (`bun.lock`; `npm ci`, `npm run deps`, `npm audit` gate and Dependabot would all change), and standalone `server.js` on Bun is UNVERIFIED *(src)*.
- **Production risk**: money paths (Billing/Payouts/Refunds) run on `pg` transactions and pg-boss. Running tests on Bun but production on Node weakens what the tests prove; moving production too puts an unverified runtime under payments and Sentry privacy scrubbing.

Verdict: **Bun does not attack any measured top contributor** (truncate, per-file overhead, spawning tests, duplicate suite), and the one measurement I could take went the wrong way.

## 3. Cheaper alternatives (aimed at the measured contributors)

Estimates unless marked measured. "Measured" rows were tried here without touching product code.

| # | Change | Targets | Estimated saving | Evidence |
|---|---|---|---|---|
| A | Reset only tables touched since the last reset (or one `TRUNCATE` of dirty tables; or `DELETE` in FK order) instead of all 111 | per-test truncate | ~300–500 s local; **~4–8 min on CI** (≈500 s × 0.65 CI speed ≈ 5.3 min midpoint) | truncate cost scales with table count: 5 tables ≈ 12 ms vs 111 ≈ 170–370 ms. Not implemented: needs a change in `tests/support/database.ts` (test config, outside this thread's scope) |
| B | Postgres tuned for tests: `fsync=off synchronous_commit=off full_page_writes=off`, data on tmpfs (CI service container: `options`/command args) | commit/truncate I/O | **measured**: 30–34 s → 26 s on one file (−15–25 %); perpanjangan.test.ts 27.8 s → 20.2 s (−27 %), one run each, noisy. Whole-suite ≈ −15–25 % ≈ 2–4 min on CI | 2 files, n=1–2. Safe: test DB only |
| C | Don't run the suite twice: `migrations` job runs "domain tests" again after upgrade-migrating | CI minutes | wall: 0 (parallel); cost: −15.7 min of runner time per main run. Could run only the subset that needs the upgraded schema | read ci.yml / job steps; what that subset is, not determined |
| D | `image` job `needs: check` → build image in parallel with `check` (main only; sign still needs both) | critical path | **−3.5 min wall** (23.3 → ~19.8) | job timings above; trade-off: builds an image for a commit whose tests may fail (cost only) |
| E | Shard the suite in CI (`vitest --shard=i/4`, 4 jobs, one Postgres service each) | whole suite | 15 min → ~4–5 min (+ ~1.5 min per shard for `npm ci`/setup) ≈ **−8 to −9 min wall**; 4× runner minutes. `--shard` is a built-in Vitest option; not run here | arithmetic from 905 s; per-shard setup from the `check` job step times |
| F | Per-worker databases (template database per Vitest worker) and `fileParallelism: true` | single-worker serialisation | with 2–4 workers: up to −40–60 % **if runner has the cores**; ubuntu-latest core count for this repo is not known (4 vCPU public, 2 private: not verified). Not measured | needs `globalSetup` + `testDatabase()` change; risk: tests assuming one DB (pg-boss, advisory locks) |
| G | Make the 8 process-bound tooling files opt-in outside the gate (own CI job or nightly) | spawn/Docker/Chromium files | ~263 s local ≈ **3–4 min CI**, if they run CI-side at the same ratio | spec decision: they would leave the merge gate |
| H | Affected-tests-only at the gate (`vitest --changed origin/main`) | everything | PR gate large; but the owner's gate is the full suite before merge to main (AGENTS.md); `main` CI still runs all | changes the gate semantics: owner decision |
| I | Pool settings: `pool: 'threads'` or `isolate: false` | per-file overhead (~1 s × 343 ≈ 350 s local) | up to ~−4 min CI, not measured. `isolate:false` leaks `vi.mock`/module state between files: high risk for 42 mock-using files | not tried |
| J | CI caching | `npm ci` 25 s, Playwright browsers already cached, image build already uses gha cache | <1 min | read ci.yml |

## 4. Recommendation

Do **not** start with Bun. Order by value per risk:

1. **A + B** (reset only dirty tables, test-tuned Postgres). Biggest measured/estimated hit at the lowest risk; reversible by reverting one file and one CI line. Expected: suite 15 min → ~6–8 min on CI (estimate; B measured, A from truncate timings).
2. **D** (image build in parallel). −3.5 min wall, one line, reversible.
3. **E** (4 shards) if the owner wants under ~10 min total wall and accepts 4× runner minutes; combines with A+B for ~3 min of tests per shard (estimate).
4. **C, G** trims runner time and the gate's scope.
5. **F / I** only if still too slow; they change test isolation and need careful trial.
6. **Bun**, if the owner still wants it: step 0 = a spike only (install with Bun, keep Node as runtime and test runner; try `bun --bun x vitest` on the full suite and compare). From the one file measured it is slower; production move is high risk (Next 16.3 on Bun runtime is not in Next's docs, Sentry/pg/web-push unverified) and has big process churn (lockfile, deps store, audit, image digests, migrate-from-running-release gate). Not recommended until a full-suite spike shows a >20 % gain.

| Option | Effort | Expected saving (CI wall) | Risk | Reversible |
|---|---|---|---|---|
| A+B | ~½–1 day | −7 to −9 min | low | yes |
| D | 10 min | −3.5 min | very low | yes |
| E | ~½ day | −8 to −9 min (alone) | low; 4× minutes | yes |
| F | 1–3 days | −40–60 % tests (unverified) | medium | yes |
| Bun, test-only (Node prod) | 2–5 days | unproven, one sample negative | medium (evidence value of tests) | yes |
| Bun, full move | 1–3 weeks | unproven | high (payments, Sentry, Next support) | hard |

Decisions for the owner:
1. Is the target the merge gate (Vitest only) or the whole 23-min pipeline? (D and E change different parts.)
2. May the gate stay "full suite" with sharding, or may the process-bound tooling tests (G) / affected-only (H) leave it?
3. Is 4× CI minutes acceptable for sharding, and what is the runner size (cores) for this repo?
4. Is a Bun spike (a day, Node stays the production runtime) still wanted after these numbers, or is Node confirmed for v1?
5. Who changes `tests/support/database.ts` and ci.yml: this thread changed no product code, test or CI config.

## Not measured / caveats
- Exact number of tests that call `resetDatabase` and total reset time (estimated).
- Per-file gap (~1 s) is inferred, not timed.
- Whole-suite effect of tuned Postgres, and any Bun full-suite time.
- Bun result is one run of one file; Node two runs.
- CI numbers are from one main run's job records plus run start/end stamps of four others.
- Local box is ~1.55× slower than the CI runner for this suite.
- Everything marked UNVERIFIED in `bun-sources.md`.
