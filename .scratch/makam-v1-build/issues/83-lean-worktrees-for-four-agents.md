# Lean worktrees: four builder agents on the shared host

Status: ready-for-agent
Blocked by: —
Spec: Implementation Decisions > Architecture (shared host); ADR 0002; AGENTS.md (Tests, Commands)

## What to build

Decided with the user on 2026-09-26 (plan to speed up v1). The shared host's disk limits us to two builder agents, because each worktree carries its own `node_modules` (~1 GB), `.next`, a per-worktree Docker stack and a test Postgres container. Make a worktree cheap enough that four agents can build and test at once, without touching other projects on the host.

## Acceptance criteria

- [ ] Dependencies are shared between worktrees (e.g. a content-addressed store with hardlinks, or an equivalent the agent justifies); the chosen tool keeps the lockfile, CI and the Dockerfile working, and CI proves it.
- [ ] `npm test`-equivalent can use one shared, long-running local test Postgres with a database per worktree (created and dropped by a helper, named from the worktree), via `TEST_DATABASE_URL`, instead of a container per run; the per-run container stays the default when no shared server is configured, so CI is unchanged.
- [ ] Builders no longer need a per-worktree Docker stack: e2e runs in CI (ticket 71); AGENTS.md says when a local stack is still worth it and requires `down -v` and image removal after.
- [ ] A cleanup command removes a worktree's `.next`, `dist`, `test-results`, its test database and its stack images; AGENTS.md tells agents to run it when a ticket is done.
- [ ] Measured: disk per fresh worktree before and after, recorded in `## Comments`; target ≤ 0.5 GB.
- [ ] Nothing of other projects (containers, images, volumes, worktrees) is touched.
