# 04: Destructive-DDL check over every later migration, makam

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** The test suite checks every migration after 0018 for destructive DDL that lacks its `-- contract:` line, so a miss like the one that turned main CI 359 red is caught before a push (the analysis's recommendation 15).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A test runs the existing destructive-DDL checker over every migration numbered after 0018 and fails naming the file and the statement.
- [ ] Today's migrations pass; an unmarked destructive statement in a migration fails, shown by a test of the test.

## Comments

### Builder, 2026-10-03

- Added `scripts/migrations/check-all-migrations.ts` (`unmarkedInMigrationsAfter(dir, after)`, reuses `unmarkedDestructiveStatements`) and `tests/destructive-ddl-all-migrations.test.ts`: unmarked statement reported with file and statement; 0018 and earlier skipped; a `-- contract:` marker passes; every `drizzle/` migration after 0018 passes today (failure message names file:line and statement).
- Process: no Skill tool; read `.claude/skills/tdd/SKILL.md` directly. Setup `git checkout -B` was skipped on the orchestrator's instruction (branch already created). Two red/green pairs in git; the last two tests (marker passes, today's migrations pass) were green on first run, committed together as characterisation tests.
- Spec gaps: none.

