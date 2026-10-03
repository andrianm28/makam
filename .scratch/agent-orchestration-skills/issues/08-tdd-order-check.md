# 08: TDD-order check in ticket and merge threads (D8)

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** A generic check shipped with the skills: every behaviour's `test(red)` commit comes before the code that makes it pass, with a `TDD-exempt:` commit trailer and its reason for genuine exceptions; ticket and merge threads stop on a violation (owner decision D8, 2026-10-03).

**Blocked by:** 06, 07.

**Status:** ready-for-agent

- [ ] Run on a branch, it reports each code commit with no preceding red test commit for its behaviour, and accepts a commit carrying `TDD-exempt:` with a reason.
- [ ] Ticket threads run it before reporting ready; merge threads run it before merging and stop with its report on a violation.
- [ ] Tested on branches that pass, fail and carry exemptions.

## Comments
