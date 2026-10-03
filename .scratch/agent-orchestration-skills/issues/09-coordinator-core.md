# 09: Coordinator core

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** `agent-coordinator` gives the coordinator session its core procedures, read from the profile: starting and briefing threads, the registry and the shared memory, report-backs and archiving, and decisions with the owner.

**Blocked by:** 06, 07.

**Status:** ready-for-agent

- [ ] It starts ticket, merge, research and prototype threads with the source revision and the head SHA always, the model by tier and within the thread cap, and records each one in the registry.
- [ ] It handles report-backs: verifies them, archives a thread whose role ended, starts the next step; a fix pass into a role thread only within the profile's context and idle limits.
- [ ] It keeps the shared memory file, the alternative to Projects memory: only the coordinator writes it and every thread reads it at start.
- [ ] It puts every decision to the owner by notification, then the option tool, uses `grilling` and `domain-modeling` for decisions, records them in the tracker, and routes new work only through the owner's `/to-tickets`; it never invokes an owner-only skill.
- [ ] It writes to `main` only docs and bookkeeping, and only while no merge thread runs.
- [ ] Trigger, behaviour and conformance evals pass.

## Comments
