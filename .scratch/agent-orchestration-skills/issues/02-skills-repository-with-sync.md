# 02: Skills repository with one-command sync, pinned

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The `agent-orchestration-skills` repository (created by the owner: public, still empty) gets its skeleton and a sync command, so any project copies the orchestration skills and an explicit list of Matt Pocock's skills, pinned and with their licences, into its project skills in one step; plus a profile template that holds everything project-specific without duplicating what Matt's setup skill already writes (owner decision Q1, 2026-10-03).

**Blocked by:** None (can start immediately; the thread needs push access to the repository).

**Status:** ready-for-agent

- [ ] One sync command, run from a project's root with a version, copies `agent-coordinator` and `agent-thread` (placeholders until tickets 06, 07 and 09) and the listed Matt Pocock skills from upstream pinned at the exact commit of the 1.2.3 release (before the unreleased v1.3 changesets that retire `resolving-merge-conflicts` and rename the glossary file), each with its licence; the list includes `codebase-design` and `setup-matt-pocock-skills`; `resolving-merge-conflicts` ships as a project-local copy with credit.
- [ ] The sync is idempotent, never touches the project's other skills and never changes how the project's glossary file is named.
- [ ] A profile template lists every project-specific field the skills read, each with a one-line meaning: repository and environment, branch naming, pointers to the tracker, triage and domain docs that `/setup-matt-pocock-skills` writes (never a copy of them), the seams `tdd` tests at, gate and CI commands, merge hooks, money paths, model and effort tiers, pull-request policy, owner language, decision protocol, memory file, overview page, thread cap, context limit per role, same-session fix-pass limit, cadences and report-back format.
- [ ] The installation steps name the owner's one-time `/setup-matt-pocock-skills` in each project.
- [ ] Proven by syncing into a scratch repository and into makam on a branch, and seeing the skills listed in a fresh cloud session; the sync has tests.

## Comments

- 2026-10-03, owner decisions (option tool, after this ticket was written): the repository becomes **private** (the owner changes its visibility; no open licence for its own content), so the description's "public" is superseded; its `main` is created by a merge thread with a README-only first commit before this ticket starts. Vendored Matt Pocock skills keep their MIT licence file. Since the repository is private, the sync fetches it with credentials: say how a project's session gets them (for a cloud session, the repository added to its sources).
