# 11: Coordinator watching, idle mode, pause all, restart and rotation

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** `agent-coordinator` watches without waste and survives restarts and rotation: a generic watcher, the hourly backstop, idle mode, pause all, a restart checklist, and rotation into a fresh coordinator session near the profile's context limit, restarted from durable state rather than from a conversation summary (owner decisions D3, D4 and Q4, 2026-10-03).

**Blocked by:** 09, 10.

**Status:** ready-for-agent

- [ ] A watcher shipped with the skills, driven by the profile, checks `main`'s head, its latest CI run, the newest finished run (a run that fails while a newer one is queued must still show) and open pull requests, wakes the coordinator only on a change, and exits on a heartbeat so it can be re-armed.
- [ ] The hourly backstop Routine posts the status while work runs; in idle mode, with nothing running, the Routine is disabled and the watcher not re-armed until work starts again; pause all disables the coordinator's Routines and interrupts working threads, and the overview page shows it.
- [ ] The restart checklist runs at session start and after a restart: fast-forward the checkout, relaunch the watcher, confirm the Routine exists, read the registry from the overview page and reconcile every registered thread.
- [ ] Rotation near the profile's limit, at a point with no thread running, starts the successor itself from the overview page, the memory file, the tickets' Comments and the Routine list, with no conversation summary; report-backs reach the successor (re-pointed or forwarded, per 01's findings); the owner gets the new session's link; `/handoff` stays the owner's, for when the owner wants a summary.
- [ ] Trigger and behaviour evals pass.

## Comments
