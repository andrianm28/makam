# seed-contoh-publik test failed once with no trace of why

Status: ready-for-agent
Blocked by: —
Spec: AGENTS.md (Tests: read every count off a kept log); orchestration manual ("Flake" is not a root cause)

## What to build

In the merge gate of 2026-10-02 (main 0ff5acb + fix/saat-duka-kirim-masuk + fix/lonceng-menu-group; neither touches the seed) the full suite failed once: `src/cli/seed-contoh-publik-command.test.ts` › "draws the prototype's own Denah for Wakaf Al-Ikhlas and Hijau Asri, then tops each Jenis Makam up in tidy rectangular Bloks", `expect((await seed()).exitCode).toBe(0)` received 1 (line 215). A re-run of that file alone passed 9/9 (167 s). The suite ran while eight builders were also running tests on the same machine. The cause cannot be named: the test keeps only the exit code and drops the command's own output.

Make the failure diagnosable before guessing: when the seed command exits non-zero, the test's failure message must include what the command wrote (its error lines). Then, if it fails again, name the cause from that output and fix it test-first.

## Acceptance criteria

- [ ] A non-zero exit from the seed in this test file shows the command's output in the failure message.
- [ ] The next failure, if any, is root-caused in `## Comments` from that output.

## Comments

- 2026-10-02 — Filed by the orchestrator; one re-run spent (passed).
