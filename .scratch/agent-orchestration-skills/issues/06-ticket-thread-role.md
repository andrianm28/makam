# 06: Ticket thread role (tracer bullet)

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** In `agent-orchestration-skills`, `agent-thread` gains the `ticket` role, the default by the owner's decision, together with the builder, reviewer, re-review and fix-pass references it drives: one cloud thread per ticket builds, reviews, fixes and re-reviews in its own VM and reports back once. This is the first end-to-end path through the skills; the trial on ticket 04 (its trial notes in that ticket's Comments) is the input.

**Blocked by:** 01 (the brief format), 02 (the repository and sync).

**Status:** ready-for-agent

- [ ] A thread briefed with the ticket role, in 01's format, reads its role reference before any checkout, confirms the head it was given, and works only on its branch.
- [ ] It builds with a builder sub-agent that has `tdd` and `diagnosing-bugs` (preloaded, or read by the path the brief names, per 01) and is told to keep the branch it is given, never resetting it to the default branch: one behaviour per red/green pair, a push after every green commit; a test green on its first run is kept only with a mutation proof (break the code, see it red), never committed as a batch; a bug ticket or an unexplained red starts with `diagnosing-bugs`; no literal secret-like string is ever committed.
- [ ] It runs `code-review` itself, two parallel sub-agents, on the model the profile's money paths require (Opus for money code), and writes the review into the ticket before any fix.
- [ ] Its fix pass is a fresh builder sub-agent on the ticket branch, starting from a red test that reproduces each finding; its re-review is a fresh two-axis `code-review` whose Spec axis checks the earlier findings item by item (owner decision Q3); it repeats until no blocking or should-fix finding is left or a decision is needed; a process-only finding about pushed history may be accepted with its reason in the report.
- [ ] It never commits a sub-agent's work in progress to quiet a hook, keeps its own context within the profile's limit (a progress note at the limit), and reports back once: ready to merge with its counts, or the decision needed.
- [ ] It never invokes an owner-only skill nor reads one's instructions to carry out its steps, never opens a pull request and never pushes to `main`.
- [ ] Trigger, behaviour and conformance evals (skill-creator) pass.

## Comments
