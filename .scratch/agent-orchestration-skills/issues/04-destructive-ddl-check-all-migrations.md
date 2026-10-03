# 04: Destructive-DDL check over every later migration, makam

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The test suite checks every migration after 0018 for destructive DDL that lacks its `-- contract:` line, so a miss like the one that turned main CI 359 red is caught before a push (the analysis's recommendation 15).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A test runs the existing destructive-DDL checker over every migration numbered after 0018 and fails naming the file and the statement.
- [ ] Today's migrations pass; an unmarked destructive statement in a migration fails, shown by a test of the test.

## Comments
