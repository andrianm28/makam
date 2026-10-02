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
- 2026-10-02 — Builder: every `exitCode` check on the seed in `seed-contoh-publik-command.test.ts` now goes through `expectBerhasil(result)`, whose failure message carries the command's `output` (before: `expected 1 to be 0`; after: `seed-contoh-publik keluar dengan kode 1:` plus the command's lines). A new test proves it (red first, then green). AC 1 done; AC 2 stays open until the next failure. File: 10/10 passed, lint and typecheck clean.
- 2026-10-02 — Builder (AC 2 diagnosis, cause NOT found; AC 2 stays open). Tried, each with `expectBerhasil` in place, on branch head 7019245 against the shared test Postgres: (1) the "draws the prototype" test alone, 6 times in a row, all green; (2) the same test with the seed's Clock set to 2026-10-02 12:50 WIB (the CI hour), 2026-10-02 00:00, 2026-10-01 23:59, 2026-10-02 00:30, 2026-12-31 23:50, 2027-01-01 00:05 and 2026-10-02 05:50, all green; (3) the whole file twice under 12 busy-loop processes on 4 cores (host load average above 20), 2/2 green; (4) a throwaway test running seed-admin plus the seed 25 times in one process under 6 busy loops, 25/25 green (file deleted, nothing committed). Read-only checks that rule things out: the Clock reaches every module the seed uses (sessions expire on the injected Clock, not wall time), the command closes its own pool, files run serially (`fileParallelism: false`). Not ruled out: the test's `await seedAdmin()` is unchecked, so a failing seed-admin would show as the seed's "belum ada Admin Platform"; and a `catch` in the seed prints only the error's name and code (`cliFailure`), so a database error (connection limit on the shared Postgres under eight builders, a unique violation) would read as "Gagal: ... (Error 53300)". Both are visible now through `expectBerhasil`. Next step: leave AC 2 open; if it fails again, the message names which. Spec gap for the owner: none.
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main, branch at 7019245). Standards: 0 hard; judgement — the result type `{ exitCode; output }` written inline in `expectBerhasil` (possible Data Clump if the command exports one). Spec: AC 1 met (every success check uses the helper; the new test forces a real non-zero exit and asserts the command's own text); AC 2 open by design, so this ticket stays open after the merge. No fix pass.
