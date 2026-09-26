# Lean worktrees: four builder agents on the shared host

Status: ready-for-agent
Blocked by: —
Spec: Implementation Decisions > Architecture (shared host); ADR 0002; AGENTS.md (Tests, Commands)

## What to build

Decided with the user on 2026-09-26 (plan to speed up v1). The shared host's disk limits us to two builder agents, because each worktree carries its own `node_modules` (~1 GB), `.next`, a per-worktree Docker stack and a test Postgres container. Make a worktree cheap enough that four agents can build and test at once, without touching other projects on the host.

## Acceptance criteria

- [x] Dependencies are shared between worktrees (e.g. a content-addressed store with hardlinks, or an equivalent the agent justifies); the chosen tool keeps the lockfile, CI and the Dockerfile working, and CI proves it.
- [x] `npm test`-equivalent can use one shared, long-running local test Postgres with a database per worktree (created and dropped by a helper, named from the worktree), via `TEST_DATABASE_URL`, instead of a container per run; the per-run container stays the default when no shared server is configured, so CI is unchanged.
- [x] Builders no longer need a per-worktree Docker stack: e2e runs in CI (ticket 71); AGENTS.md says when a local stack is still worth it and requires `down -v` and image removal after.
- [x] A cleanup command removes a worktree's `.next`, `dist`, `test-results`, its test database and its stack images; AGENTS.md tells agents to run it when a ticket is done.
- [x] Measured: disk per fresh worktree before and after, recorded in `## Comments`; target ≤ 0.5 GB.
- [x] Nothing of other projects (containers, images, volumes, worktrees) is touched.

## Comments

**2026-09-26, implementation (branch `worktree-agent-aba76c5f698c9cee9`).**

Measured on the shared host (ext4, Node 22.23.2, npm 10.9.8), `du -sm`:

| Fresh worktree | Before (`npm ci`) | After (`npm run deps`) |
|---|---|---|
| Source checkout | 7 MB | 7 MB |
| `node_modules` | 1 082 MB (1 m 38 s) | 23 MB of its own (4 s); file data shared |
| Test Postgres | a new `postgres:18` container per `npm test` | none of its own: a database on `makam-testpg` (tmpfs, ~160 MB RAM, 20 kB disk) |
| **Total** | **~1.09 GB** | **~30 MB** (target ≤ 0.5 GB) |

While a ticket is being built: `.next` 631 MB and `dist` 58 MB after `npm run build` / `build:worker`, freed by `npm run clean`; a local stack adds its `makam-v1:<project>` image (~1.3 GB), now only when a ticket needs one. One-off host costs: the dependency store, 1 083 MB per lockfile (`npm run deps -- --prune` drops unused entries), and the `makam-testpg` container on the `postgres:18` image the host already had. Four worktrees mid-build: ~4 × (30 + 690) MB ≈ 2.9 GB plus the 1.1 GB store, against ~4 × 1.8 GB (+ stacks) before.

Verification: lint and typecheck clean; `npm run test:shared` 85 files / 873 tests passed (3 m 18 s); `npm test` (default per-run container) 85 files / 873 tests passed (4 m 04 s); `npm run build` and `npm run build:worker` pass; after the tests and builds no file in the store had changed (`find -newer`). `npm run clean` checked against a real compose project started from the worktree (container, volume, network and a `makam-v1:<project>` tag removed; the shared `postgres:18` image kept) and a real test database on `makam-testpg`.

Judgement calls:

- **npm kept, no pnpm.** pnpm is not on the host and would bring a new lockfile, CI steps and a Dockerfile rewrite colliding with ticket 71's CI work. `npm run deps` (`scripts/deps.mjs`, plain Node, no dependencies) runs `npm ci` once per lockfile into `~/.cache/makam/deps/<platform>-<arch>-node<major>-<lockhash>/` and mirrors that tree into the worktree: own directories, hard-linked files, identical symlinks. Same lockfile and npm; CI and the Dockerfile are untouched. CI proves it by running `npm ci` on the unchanged lockfile and the new tooling tests (`tests/tooling/`: store key, hard-link mirror, database recreate/drop against its service Postgres). A symlinked shared `node_modules` was not used: a real directory avoids Turbopack/Node resolving packages outside the project root.
- **Hard-link safety.** A hard link shares the file, so an in-place write in one worktree would show in all. npm replaces package files rather than editing them, but rewrites `node_modules/.package-lock.json` in place, so that one file is copied, not linked. Removing a store entry never breaks a worktree (its links keep the data).
- **Shared test Postgres is opt-in** (`MAKAM_TEST_PG=shared`, i.e. `npm run test:shared`), so `npm test` and CI (`TEST_DATABASE_URL`) behave as before. The Vitest global setup starts `makam-testpg` if missing (127.0.0.1:55432, tmpfs data, fsync off, `--restart unless-stopped`), recreates `makam_test_<worktree>` (so a branch switch never meets a stale schema), migrates it, and drops it after the run. It resolves to a database URL the same way `TEST_DATABASE_URL` does rather than asking agents to export one; `TEST_DATABASE_URL` still wins when set, and `MAKAM_TEST_PG_URL` points the helper at another server. The worktree name is the directory name; long names are truncated with a hash to fit Postgres's 63 bytes.
- **Cleanup** finds stacks by the compose `working_dir` label as well as the documented `makam-<worktree>` project name; it removes containers, volumes, networks and only the `makam-v1:<project>` tag (never `--rmi all`, which would untag the shared `postgres:18`), and skips deployed projects (`makam-staging`, `makam-prod`, `makam-nonprod-*`, `glitchtip`). `node_modules` stays (~23 MB).
- Not verified: four agents running `test:shared` at the same moment. Each worktree has its own database name (the tooling probe database too), and a race to first start `makam-testpg` is handled (a name conflict means another worktree started it).

**2026-09-26, review fixes (Standards review; rebased onto origin/main 9f20437).** Supersedes the cleanup and naming details above.

- **Cleanup can no longer hit a shared stack.** `npm run clean` now plans from the host's inventory (`planStackCleanup` in `scripts/lib/worktree.ts`, tested): it removes only containers whose compose `working_dir` is this worktree's root, the volumes and networks of projects proven that way, and `makam-v1:*` tags whose image carries this worktree's `makam.worktree` build label or whose project is proven. It never touches `makam-v1-dev`, the deployed projects, or any project that also has containers from another directory (those are reported as "left alone"). The derived project name is no longer added unconditionally.
- **One name, one function.** `npm run stack -- <compose args>` (`scripts/stack.mts`) runs `docker-compose.yml` as `stackProjectName(root)` and sets `MAKAM_WORKTREE`, which `docker-compose.yml` now puts on the built image as the `makam.worktree` label (the only compose change; CI does not use this file, and an empty label is harmless for the main checkout). `name: makam-v1-dev` stays: the main checkout, `playwright.config.ts` and the e2e seed helper document that flow; the working_dir guard covers it. AGENTS.md (Commands table) and the runbook now use `npm run stack`.
- **Collision-proof names.** Database and project names append 8 hex of a hash of the worktree's absolute path (`makam_test_<dir>_<hash>`, `makam-<dir>-<hash>`), so `drop ... with (force)` can only ever reach this worktree's database; separate length caps for Postgres identifiers (63) and compose projects (50).
- **Store hardening.** Entries are installed by `npm ci` at their final path (the old `.tmp-<pid>` build left that path in ssh2's node-gyp `Makefile`/`config.gypi`), under a `<key>.lock` holding `<host>:<pid>`, with a `.complete` marker; all store files are then made read-only (`chmod a-w`), so an in-place write from any worktree fails with EACCES instead of changing every worktree (tested). npm's hidden lockfile is copied and writable. Each worktree records its entry in `node_modules/.makam-deps`, each entry records its users (worktree roots, any clone) in `users`; `--prune` removes entries none of whose users still links from them (so each worktree's own Node major counts, not the pruning process's), crashed installs and dead locks, and keeps entries with no `users` record. AGENTS.md says to treat `node_modules` as read-only and to use `npm ci` for a package that needs `npm rebuild`/node-gyp.
- **`makam-testpg`**: "no such object" is the only docker error that starts it; a daemon error fails the run. Runbook documents its RAM (tmpfs, 2 GB cap, ~160 MB idle), `--restart unless-stopped`, and how to stop or remove it. The docker CLI helper lives once in `scripts/lib/docker.ts`.

Re-verified after the rebase: lint and typecheck clean; `npm run test:shared` 87 files / 908 tests passed; `npm test` (default container) 87 files / 908 tests passed; `npm run build` and `build:worker` pass (with the read-only store). `npm run clean` run against a real `npm run stack -- up --build -d` stack of this worktree (removed 4 containers, 1 volume, 1 network, its `makam-v1:` image) while a throwaway `makam-v1-dev` project (postgres service, plus a `makam-v1:makam-v1-dev` tag) and another throwaway compose project were running from a scratch directory: both were left intact, then removed by hand. Fresh-worktree cost unchanged: 23 MB `node_modules` + 7 MB source.
