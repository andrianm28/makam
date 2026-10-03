# Faster tests: reset only dirty tables, test-tuned Postgres, image build in parallel

Status: in-progress
Blocked by: —
Spec: spec.md, Implementation and Testing Decisions (tests against a real Postgres); owner decisions of 2026-10-03 (option tool), recorded in Comments; research: `research/bun-vs-node-test-speed.md` sections 1, 3 and 4

## What to build

The Vitest suite is about 65 % of a main run's 23 minutes. Three of the research's options (A, B, D) make it faster without changing what a test proves: the reset between tests empties only the tables a test touched, the test Postgres skips durability it does not need, and the image build runs while the tests run.

## Acceptance criteria

- [ ] **A.** `resetDatabase()` (`tests/support/database.ts`) empties only the app tables written to since the last reset, not all of them; the first reset in a run still empties every table, so rows a migration seeded are gone as before. Isolation is proved by a test where a later test sees none of an earlier test's rows, written through more than one module (Identity, Audit Log, Lokasi), and where rows written on another connection and a table created after the first reset are emptied too. No test file changes its assertions.
- [ ] **B.** The Postgres that tests run against skips durability (`fsync`, `synchronous_commit`, `full_page_writes` off) in CI's two test services (`check`, `migrations`) and in the container `npm test` starts locally (`makam-testpg` already had it). Never staging or production: a test reads both compose files and fails if they mention these settings.
- [ ] **D.** In `.github/workflows/ci.yml` the `image` job no longer has `needs: check`. Every deploy and sign path still needs `check`: `deploy-gate` lists `check`, `secrets`, `migrations`, `image`, `e2e` and `scan`; `sign` (signing and moving `latest`) needs `deploy-gate` alone. A test reads the `needs:` graph and fails if `image` waits again, or if `deploy-gate` or `sign` could run without any of those jobs.
- [ ] **Timings.** The full suite is timed locally before and after, from logs kept whole; both are recorded in Comments.
- [ ] No change to what staging, production or the Docker images run.

## Comments

### Owner decisions, 2026-10-03 (option tool)

- Make the tests faster with options A, B and D from the research.
- Keep the merge gate as the full suite.
- Node stays the runtime for v1 (no Bun).
- Sharding (E) is decided later, once A + B + D have been measured.

### Design notes

- A is kept in the test database itself: a statement-level insert trigger on each `public` table records the table in `makam_test_support.dirty` (schema outside `public`, so it is never truncated and never listed). It sees every connection, including a CLI a test spawns. The record has no unique key, so two concurrent transactions inserting into one table never wait on each other. Global setup drops the record at the start of each run, so a database an earlier run used is emptied in full once.
- B in CI cannot pass server flags to a `services:` container, so a step runs `alter system set … = off` and `pg_reload_conf()` (all three are reloadable).
- D trades CI minutes for wall clock: on a commit whose tests fail an image is still built, and on `main` pushed as `sha-<commit>`; nothing deploys it, because `latest` only moves in `sign`.

### Timings (local, 4 vCPU sandbox, Postgres 18.6 in Docker via `TEST_DATABASE_URL`, one run each, logs kept whole)

| | Files | Tests | Wall | Vitest "Duration" |
|---|---|---|---|---|
| Before (merge of `research-bun-analysis`, default Postgres settings) | 343 | 3192 passed, 1 skipped | **1454 s (24.2 min)** | 1446 s (tests 79 %, import 20 %) |
| After (A + B; D is CI-only) | 345 | 3199 passed, 1 skipped | **1103 s (18.4 min)** | 1102 s (tests 72 %, import 27 %) |

−351 s (−24 %) locally; the 2 extra files and 7 extra tests are this ticket's own. Less than the research's estimate (it expected A alone to save 300–500 s): the truncate cost was lower than estimated, and the box was also running one other task for part of the "before" run. D is not measurable locally: by the research's job timings it takes the image build (3.5 min) off the critical path of a main run.
