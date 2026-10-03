# 02: Skills repository with one-command sync

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The `agent-orchestration-skills` repository gets its skeleton and a sync command, so any project copies the orchestration skills and Matt Pocock's skills, at pinned versions and with their licences, into its `.claude/skills/` in one step; plus a profile template that holds everything project-specific.

**Blocked by:** None (can start immediately once the owner has created the repository and given Claude access).

**Status:** ready-for-agent

- [ ] One sync command, run from a project's root with a version, copies `agent-coordinator` and `agent-thread` (placeholders until tickets 06, 07 and 09) and Matt Pocock's skills from upstream at a pinned commit, with each upstream licence; it is idempotent and never touches the project's other skills.
- [ ] A profile template lists every project-specific field the skills read (repository and environment, branch naming, the tracker's conventions, gate and CI commands, merge hooks, money paths and model tiers, owner language, decision protocol, memory file, registry, thread cap, cadences, report-back format), each with a one-line meaning.
- [ ] Proven by syncing into a scratch repository and into makam on a branch, and seeing the skills listed in a fresh cloud session; the sync has tests.

## Comments
