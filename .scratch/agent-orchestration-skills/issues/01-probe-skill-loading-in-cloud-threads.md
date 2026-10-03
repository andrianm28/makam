# 01: Probe: how skills load and expand in cloud threads

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** A short, recorded probe, run as real cloud-session threads started by the coordinator with a throwaway test skill on a scratch branch of makam, that answers the questions the brief format and coordinator rotation depend on. Its answers decide how every later ticket briefs a thread. Ticket 87's builder already answered part of the fourth question (makam-v1-build ticket 87's Comments): cite it and fill the gaps.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Whether a prompt that starts with `/<skill> <arguments>` expands into that skill when it is a `create_session` prompt, and when it is a Routine prompt delivered into an existing session; whether a plain sentence naming the skill makes the thread invoke it.
- [ ] Whether checking out a branch that predates the skill removes it mid-session (the loaded body versus its references and hooks), and what a thread must therefore read before any checkout.
- [ ] Whether a sub-agent defined in the repository can preload skills (`skills:`) and use the Skill tool inside a cloud session, so a builder sub-agent follows `tdd` and `diagnosing-bugs` without being told which file to read.
- [ ] What a cloud session exposes about itself (session id, outcome branch, current branch) that a hook or a report-back can rely on.
- [ ] What happens to a one-shot Routine bound to a session that has since been archived (it fails, it revives the session, or it is dropped), for coordinator rotation; and whether one cloud session can message another with `claude -p … --cloud <session>`.
- [ ] Every answer recorded under `## Comments` with its evidence (session ids, outputs); the throwaway skill and branch removed afterwards (the owner deletes the branch).

## Comments
