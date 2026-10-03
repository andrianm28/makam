# 10: Owner overview page

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The coordinator keeps a private Artifact status page for the owner, the alternative to the Projects Overview: every thread with its role, ticket, branch, head and state, and a "Waiting on you" list of open decisions and blocked or failed threads, updated on every wake through the page's own database without touching git. The page holds the registry, so the registry survives a coordinator restart (owner decision Q6, 2026-10-03).

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] The page lists every registered thread with its role, ticket, branch, head SHA, state and since when, and the open decisions; it is private to the owner.
- [ ] The coordinator updates it through the page's database on every wake that changed something, without republishing the page and without a commit.
- [ ] A thread whose state turns blocked or failed, and a decision put to the owner, show under "Waiting on you" by the next wake.
- [ ] After a restart the coordinator reads its registry back from the page; the profile names the page.
- [ ] Behaviour evals pass.

## Comments
