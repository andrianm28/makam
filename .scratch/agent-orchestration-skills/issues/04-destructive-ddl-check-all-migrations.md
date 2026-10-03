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


### Review 1, 2026-10-03 (head 699c5e1, fixed point origin/main 51ffb94; 2 sub-agents, sonnet)

**Standards: 4 findings, worst should-fix, no hard violations.**
- should-fix (process): commit 699c5e1 adds two tests together (marker passes; today's migrations pass), both green on first run, no red step (`tests/destructive-ddl-all-migrations.test.ts:21-31`). Horizontal slice under `tdd`; the builder disclosed it.
- nit: test names not in CONTEXT.md terms (infrastructure; sibling `tests/destructive-ddl.test.ts` has the same style).
- nit: `check-all-migrations.ts` has no CLI/CI entry; the ticket asks only for a test.
- nit: a few lines over 100 characters (prettier is not in package.json; siblings too).

**Spec: 3 nits, 0 blocking, 0 should-fix.** AC1 OK (existing checker reused, 45 migrations 0019–0063 covered, failure names file:line and statement). AC2 OK (today passes; unmarked `DROP COLUMN` fails with file and statement; marked passes). Spec gaps: none.
- nit: `\d{4}` would silently skip a migration numbered 10000+ or a malformed name like `19_x.sql`.
- nit: no negative test for non-`.sql` files (filter is correct).

**Orchestrator decision:** no fix pass and no re-review. The only should-fix is a process finding about commit history that is already pushed; no red test can fix it and rewriting history on a pushed branch is not warranted. The nits are optional. Vitest: 4/4 green. Spec-axis reviewer found nothing blocking.

### Trial notes for ticket 06 (ticket-thread role), 2026-10-03

- **tdd for the builder:** it has no Skill tool; the brief told it to read `.claude/skills/tdd/SKILL.md` and it did. That worked; the brief must name the path.
- **Setup override:** yes. The builder's Setup does `git checkout -B … origin/main`; the brief had to say "skip it, never reset". The role text must carry that sentence every time (builder and fix pass).
- **tdd discipline gap:** the builder batched two characterisation tests green-first. The brief should say: a test that is green on first run needs a mutation (break the code, see it red) or must be dropped, not committed as one batch.
- **Sub-agents:** 3 (1 builder, 2 reviewers); no fix pass or re-review run.
- **Context:** small (~15 tool calls on my side); sub-agent reports were short because the brief capped them at ≤250 words.
- **Rule conflict to settle in ticket 06:** the brief says "fix pass if any should-fix", but a process-only should-fix on pushed history has nothing to fix. The role should let the thread decide "accept with reason" for such findings, and say so in the report.
- **Stop hook:** it complained about uncommitted changes while the builder was mid-work; the thread must not commit a builder's in-progress files.
