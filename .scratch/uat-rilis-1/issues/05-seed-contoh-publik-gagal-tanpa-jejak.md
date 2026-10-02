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
- 2026-10-02 — Builder (AC 2 met, cause named). The refusal `tunggu_kirim_ulang` was NOT the Admin Lokasi's per-email resend cooldown and not state shared between tests (`resetDatabase` runs before each test; the seed's Clock is the injected FakeClock, fixed at 2026-10-01 09:00 per `seed()` call). It is the per-IP 60 s rule (`claimIpRequest`, same reason string): `benchmarkingIp()` in `src/cli/dev-seed-support.ts` drew a random IP from only 1000 (198.18.1-4.1-250) for each of the seed's ~6 Kode Masuk requests, and under a fixed Clock all of them sit in one 60 s window, so a birthday collision (~1.5% per run) is refused. Intermittent, independent of load, hence the "passes on re-run". Product behaviour (idempotent re-run asks for no Kode Masuk) was already right; the cooldown is untouched. Fix: IPs are handed out in turn from a random start, never drawn at random, so one run never repeats an IP. Red first: `src/cli/dev-seed-support.test.ts` (200 requests, 181 distinct before; commit `test(red)`), green after. Whole `seed-contoh-publik-command.test.ts` 5 runs in a row: 10/10 each. Lint and typecheck clean. Spec gaps for the owner: none.
