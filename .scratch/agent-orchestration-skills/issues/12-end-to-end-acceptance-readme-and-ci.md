# 12: End-to-end acceptance, README and CI

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** Proof that the skills work as an alternative to Claude Code Projects, the README that lets another project adopt them, and CI for the skills repository.

**Blocked by:** 08, 11.

**Status:** ready-for-agent

- [ ] A fresh scratch repository installs the skills and Matt Pocock's with one sync command, the owner's one-time `/setup-matt-pocock-skills` and a filled profile, starts a coordinator session, and runs one small ticket through a ticket thread and the merge thread with report-backs, without Projects.
- [ ] The same run passes with Routine binding disabled, through reconciliation alone (owner decision Q2).
- [ ] The README covers installation, the profile, the Projects mapping (coordinator, threads, report-back, replies into a thread, overview, instructions, memory, settings) and Projects' documented limits, what the skills add (one writer to `main`, the merge gate, the TDD and review rules, decisions), the mechanics outside the public docs and the reconciliation that backs them, that `agent-coordinator` is a consciously model-invocable `implement-spec`-style orchestrator unlike upstream's skill taxonomy, limits and licence.
- [ ] The skills repository's CI runs every eval and the sync tests.

## Comments
