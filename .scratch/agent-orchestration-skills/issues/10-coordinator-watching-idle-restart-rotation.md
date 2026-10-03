# 10: Coordinator watching, idle mode, restart and rotation

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** `agent-coordinator` watches without waste and survives restarts and rotation: a generic watcher, the hourly backstop, idle mode, a restart checklist, and rotation into a fresh coordinator session near the profile's context limit (owner decisions D3 and D4).

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] A watcher shipped with the skills, driven by the profile, checks `main`'s head, its CI (running or completed) and open pull requests, wakes the coordinator only on a change, and exits on a heartbeat so it can be re-armed.
- [ ] The hourly backstop Routine posts the status while work runs; in idle mode, with nothing running, the Routine is disabled and the watcher not re-armed until work starts again.
- [ ] The restart checklist runs at session start and after a restart: fast-forward the checkout, relaunch the watcher, confirm the Routine exists, check every registered thread.
- [ ] Rotation near the limit writes a HANDOFF, starts the fresh coordinator, re-binds the Routines, and threads' report-backs reach the new coordinator (per 01's findings).
- [ ] Trigger and behaviour evals pass.

## Comments
