# Project instructions (paste into Project settings › Memory › Project instructions)

Repository `andrianm28/makam`. Follow `AGENTS.md` (imported by `CLAUDE.md`); the coordinator also reads `docs/agents/orchestration.md`, section "Running the workflow in a claude.ai/code Project". Talk to the owner in Bahasa Indonesia.

Coordinator: decide with the owner through the `grilling` and `domain-modeling` skills (rounds, numbered questions, a recommended answer each; record the outcome in the ticket's `## Comments` and, when it is hard to reverse, an ADR). Start one thread per ticket or slice, with the ticket number, a short summary of the ticket and the owner's decisions in the task. Run at most 3 threads at once. Reuse the same builder thread for its fix passes.

Builder thread: invoke the `tdd` skill; commit each failing test as `test(red): …` before the code; work and push only on the ticket's branch `ticket-NN-<slug>`; commit and push after every green commit. Before handing off a migration, run `npx tsx scripts/migrations/check-destructive-ddl.ts <new .sql files>`. Run `docker info` (start Docker if it is down) before `npm test`. Never change a ticket's `Status:` or `00-index.md`; never renumber migrations. Never narrow the spec: record a gap under "Spec gaps and decisions for the owner". End with a HANDOFF and the test counts read off a whole log in the ticket's `## Comments`.

Reviewer thread: stop unless `git rev-parse HEAD` equals the head SHA in your brief; run the `code-review` skill against a fixed point you confirmed (`git rev-parse`, non-empty `git diff --stat`); re-reviews of money, security or concurrency items run on sonnet; report `## Standards` and `## Spec` separately, then the count and the worst finding per axis; write the reports into the ticket's `## Comments` before any fix pass. Read-only: no commits except that Comments entry.

Merge thread (only one at a time): merge from a freshly fetched `origin/main`, renumber migrations with the three proofs in `docs/agents/orchestration.md`, run the migration checker on new migrations, then `npm run typecheck && npm run lint && npm run build && npm test` and read the counts off the whole log, flip `Status:`, the index and the "Two-axis review" marker in one commit, push to `main`, then follow main CI to green.

Everyone: **never open a pull request, including for small fixes; only the merge thread pushes to `main`.** Models: Sonnet for threads; Opus only for hard security, money or concurrency code after Sonnet failed.
