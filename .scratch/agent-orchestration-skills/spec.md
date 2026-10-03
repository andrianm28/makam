# Agent orchestration skills: a Claude Code Projects alternative on Matt Pocock's workflow

Status: spec, owner decisions of 2026-10-03 (option tool). Tickets come from the owner's `/to-tickets` on this file.
Design input: `docs/agents/orchestration-optimization.md` (771e355); decisions recorded in ticket 87's `## Comments` (makam-v1-build).

## Goal

Generic, reusable skills that let one coordinator session in Claude Code on the web run multi-agent development through cloud-session threads, **as an alternative to Claude Code Projects**, while **orchestrating Matt Pocock's skills workflow and never replacing or bypassing it**. Makam is the first project to use them; any repository can adopt them with one sync command and one profile file.

## Owner decisions this spec carries (2026-10-03)

- **Home and distribution**: a separate repository `andrianm28/agent-orchestration-skills` (the owner creates it and gives Claude access). Projects vendor a pinned version into `.claude/skills/` with a sync script, because cloud sessions load repository skills and not `enabledPlugins`.
- **Shape**: two generic skills, `agent-coordinator` and `agent-thread` (with one reference per role), plus one profile file per project that holds everything project-specific.
- **Matt's skills travel with them**: the sync script also vendors Matt Pocock's skills from upstream at a pinned version, with their LICENSE.
- **Conformance with Matt's workflow** (no exceptions): decisions through `grilling` and `domain-modeling` (`CONTEXT.md`, ADRs); investigations through `research`; UI uncertainty through `prototype`; builds and fixes test-first through `tdd`, hard bugs through `diagnosing-bugs`; every branch reviewed by `code-review` on both axes as two parallel sub-agents (D2, single-agent reviews, was revoked); merges resolve conflicts with `resolving-merge-conflicts`. The owner-only skills (`to-tickets`, `handoff`, `grill-with-docs`) are never invoked by an agent: the coordinator prepares the material and asks the owner to run them. New work becomes tickets only through the owner's `/to-tickets`; a HANDOFF block follows `AGENTS.md` when an agent hands off.
- **Process decisions from the analysis**: D1 CI on `merge/**` is the gate before `main`, the next merge starting at the push (local gate as fallback); D3 the coordinator stays on Opus and rotates into a fresh session with a HANDOFF at about 200k tokens; D4 idle mode (with nothing running, no hourly Routine, no watcher, no status); D5 enforcement in settings (being built in makam as ticket 87 Added, branch `ticket-87-penegakan`); D6 a GitHub ruleset on `main` (owner); D7 a merge thread batches up to three clean branches, at most one migration, money code alone; D8 a blocking `test(red)`-before-code check with a `TDD-exempt:` trailer.
- **Ticket threads** (owner, 2026-10-03: trial on the next ready ticket, then the default): one cloud thread per ticket runs, in its own VM, the build (a builder sub-agent that reads or preloads `tdd`, since local agents have no Skill tool), the review (`code-review` run by the ticket thread itself: two parallel sub-agents, Opus for money code), the fix pass (a fresh builder sub-agent) and the re-review, writes each report into the ticket before acting on it, keeps its own context small (HANDOFF near 200k), and reports back once: ready to merge, or a decision needed. The merge thread stays separate.
- **Operations**: up to five threads at once (owner); decisions by notification, then the option tool; finished threads archived; the owner deletes merged branches.

## The Projects mapping the skills must provide

| Claude Code Projects | Provided by |
|---|---|
| Coordinator conversation | a coordinator cloud session running `agent-coordinator`, rotated by HANDOFF (D3) |
| Threads | `create_session` with a role brief that runs `agent-thread`; one ticket thread per ticket by default (build, review, fix pass, re-review inside), plus the merge thread |
| Native report-back | a one-shot Routine bound to the coordinator's session (undocumented; fallback: watcher and hourly poll) |
| Reply into a running thread | a one-shot Routine bound to that thread's session |
| Overview | the thread registry (and optionally a status page) |
| Project instructions | the project profile plus a short per-role `append_system_prompt` |
| Project memory | a memory file in the repository that every thread reads at start and only the coordinator writes |
| Project settings (models) | the profile's model tiers, enforced by hooks |
| What Projects lacks | one writer to `main`, the merge gate, TDD and review rules, decisions by notification then option tool, cost discipline (watcher on change only, idle mode, rotation) |

## Scope

### A. The skills repository

- `skills/agent-coordinator/`: `SKILL.md` as a router (speaks the owner's language from the profile; never builds, reviews or pushes code) with references for starting and briefing threads, report-backs, watching (main-only watcher, hourly backstop, idle mode), decisions (notification, option tool, `grilling` and `domain-modeling`, the owner's `/to-tickets`), merges and writers to `main` (merge-branch CI gate, batches), archiving, restart and rotation (HANDOFF, re-binding Routines, a report-back target that survives a rotation), the Projects mapping, and the memory file.
- `skills/agent-thread/`: `SKILL.md` plus one reference per role: ticket (the default: dispatches the builder and fix-pass sub-agents, runs `code-review` itself, one report-back), builder (`tdd`, `diagnosing-bugs`, the TDD-order check), reviewer and re-review (`code-review`, two sub-agents, severities, head check), fix pass (same session, head check, red first), merge (`resolving-merge-conflicts`, the profile's merge hooks, the gate, CI), research (`research`), prototype (`prototype`).
- `profile/TEMPLATE.md`: repository and environment, branch naming, the tracker's paths and conventions, gate and CI commands, merge hooks (for example makam's migration renumbering), money paths and model tiers, owner language, decision protocol, memory file, registry, thread cap, cadences, report-back format.
- `scripts/`: `sync.sh` (vendor these skills and Matt's at pinned versions, with licences), a generic watcher that reads the profile, an optional brief generator.
- `evals/` with `skill-creator`: trigger evals (should and should-not prompts per skill), behaviour evals on dry-run briefs, and conformance evals (an agent never invokes an owner-only skill; a builder invokes `tdd`; a reviewer runs `code-review` with two sub-agents).
- `README.md`: installation, the Projects mapping, the undocumented mechanics and their fallbacks, limits, licence.

### B. Makam as the first user

- Vendor with `sync.sh`; write makam's profile; briefs become "run `agent-thread`, role …" with a short `append_system_prompt`; `project-instructions.md` and `orchestration.md` point at the skills (the analysis, B.7 and B.8); the pasted role paragraphs are removed only after one trial ticket runs on the skills.
- D1 and D7 in makam's CI and merge procedure; D8 as `check-tdd-order.ts`; D3 and D4 through the coordinator skill; the analysis's recommendations 8, 11, 13, 14 and 15.

## Constraints (from the analysis, B.1)

- The orchestration skills carry no `disable-model-invocation`: the coordinator writes briefs and Routines write wakes. Whether a leading `/skill` expands in `create_session` and Routine prompts is untested: probe first.
- A checkout to a branch that predates the skills removes them: threads read their role reference before any checkout; reviewer and merge threads work in a `git worktree`.
- Routines fire at most hourly; one-shot `run_once_at` and `persistent_session_id` are undocumented; the GitHub proxy refuses branch deletion.

## Acceptance

- A fresh repository installs the skills and Matt's with one `sync.sh` command and a filled profile, starts a coordinator session, and runs one ticket through builder, review and merge with report-backs, without Projects.
- The trigger, behaviour and conformance evals pass.
- Makam runs its next ticket on the skills; only then are the pasted role paragraphs removed.

## Out of scope

- Claude Code Projects itself: the day-one trial when access arrives stays in `docs/agents/orchestration.md`.

## Comments

- 2026-10-03, validation thread: design validated against Matt Pocock's skills (upstream d81f3a1) and the current Claude Code Projects docs, see `validation.md`. Findings 2 blocking / 12 should-fix / 10 nit, 9 decisions for the owner. Blocking: the sync pin (upstream retires `resolving-merge-conflicts` and renames `CONTEXT.md` to `GLOSSARY.md`; `.claude/settings.json` enables the unpinned plugin) and report-back (Routine session binding undocumented, the hourly fallback shares it). Nothing in the design was changed.
