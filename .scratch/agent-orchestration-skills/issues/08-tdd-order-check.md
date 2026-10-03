# 08: TDD-order check (D8)

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** A generic check shipped with the skills: every behaviour's `test(red)` commit comes before the code that makes it pass, with a `TDD-exempt:` commit trailer and its reason for genuine exceptions; ticket threads run it when they report done and merge threads before merging, never on every commit (owner decisions D8 and Q9, 2026-10-03).

**Blocked by:** 06, 07.

**Status:** ready-for-agent

- [ ] Run on a branch, it reports each code commit with no preceding red test commit for its behaviour, and accepts a commit carrying `TDD-exempt:` with a reason (for example `diagnosing-bugs`' first reproduction loop, a characterisation test with its mutation proof, or configuration proven by its own check).
- [ ] Ticket threads run it before reporting ready; merge threads run it before merging and stop with its report on a violation; nothing runs it per commit.
- [ ] Tested on branches that pass, fail and carry exemptions.

## Comments
