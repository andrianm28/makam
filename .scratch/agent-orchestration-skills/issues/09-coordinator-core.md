# 09: Coordinator core

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** `agent-coordinator` gives the coordinator session its core procedures, read from the profile: starting and briefing threads, report-backs with reconciliation, archiving, the shared memory, its own docs, and decisions with the owner in whole-frontier rounds (owner decisions Q2, Q5 and Q7, 2026-10-03).

**Blocked by:** 06, 07.

**Status:** ready-for-agent

- [ ] It starts ticket, merge, research and prototype threads with the source revision and the head SHA always, the model and effort by tier and within the thread cap, and records each one in the registry.
- [ ] It handles report-backs and, on every wake (owner message, report-back, watcher, hourly Routine), reconciles: it checks every working thread's state, its branch head and the one-shot Routines that fired since its last look, so a report-back it missed is still found.
- [ ] It archives a thread whose role ended, starts the next step, sends a fix pass into a role thread only within the profile's context and idle limits, and asks the owner to delete merged branches.
- [ ] It keeps the shared memory file, the alternative to Projects memory: at most about 40 lines (an index), imported into every session through the project's `CLAUDE.md`, written only by the coordinator; threads propose entries in their report-backs.
- [ ] It puts decisions to the owner as one round holding every question open now, numbered with a recommended answer each and announced by a notification, the option tool only collecting the answers; it uses `grilling` for open decisions and `domain-modeling` only for a term or an ADR (an ADR only when hard to reverse, surprising and a real trade-off); a full design interview is the owner's `/grill-with-docs`; new work becomes tickets only through the owner's `/to-tickets`; it never invokes an owner-only skill nor reads one's instructions to carry out its steps.
- [ ] It never pushes to `main`: its docs and bookkeeping go on a docs branch that the next merge thread merges.
- [ ] Trigger, behaviour and conformance evals pass.

## Comments
