# 06: Ticket thread role (tracer bullet)

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** In `agent-orchestration-skills`, `agent-thread` gains the `ticket` role, the default by the owner's decision: one cloud thread per ticket builds, reviews, fixes and re-reviews in its own VM and reports back once. This is the first end-to-end path through the skills.

**Blocked by:** 01 (the brief format), 02 (the repository and sync).

**Status:** ready-for-agent

- [ ] A thread briefed with the ticket role, in 01's format, reads its role reference before any checkout, confirms the head it was given, and works only on its branch.
- [ ] It builds with a builder sub-agent that follows `tdd` (preloaded or read, per 01): one behaviour per red/green pair, a push after every green commit.
- [ ] It runs `code-review` itself, two parallel sub-agents, on the model the profile's money paths require (Opus for money code), and writes the review into the ticket before any fix.
- [ ] It runs the fix pass with a fresh builder sub-agent and a fresh `code-review` as the re-review, until no blocking or should-fix finding is left or a decision is needed.
- [ ] It keeps its own context small (a HANDOFF near the profile's limit) and reports back once: ready to merge with its counts, or the decision needed.
- [ ] It never invokes an owner-only skill, never opens a pull request and never pushes to `main`.
- [ ] Trigger, behaviour and conformance evals (skill-creator) pass.

## Comments
