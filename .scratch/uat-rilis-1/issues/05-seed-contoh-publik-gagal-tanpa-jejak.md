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
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main, branch at 7019245). Standards: 0 hard; judgement — the result type `{ exitCode; output }` written inline in `expectBerhasil` (possible Data Clump if the command exports one). Spec: AC 1 met (every success check uses the helper; the new test forces a real non-zero exit and asserts the command's own text); AC 2 open by design, so this ticket stays open after the merge. No fix pass.
- 2026-10-02 — **Failure caught with the new message** (orchestrator, batch-2 merge gate, full suite 290/291 files, 2646 passed, 1 failed): test "runs on staging with the named allowance, and every write it makes says so in its reason" → `seed-contoh-publik keluar dengan kode 1: Ditolak: Pemakaman Bukit Sejuk tidak siap (admin lokasi: tunggu_kirim_ulang).` So the seed refuses because the Admin Lokasi invite/Kode Masuk resend cooldown is still running from an earlier test in the same file: timing-dependent (passes when the earlier send is older than the cooldown). AC 2 now has a cause; fix next (diagnosing-bugs, red test first).
- 2026-10-02 — **Correction of the orchestrator's entry above:** the cause was not the Admin Lokasi resend cooldown. The builder found it is the per-IP 60 s limit (`claimIpRequest`, same reason string): `benchmarkingIp()` drew each of the seed's ~6 Kode Masuk requests a random IP from only 1000, all inside one FakeClock window, so a collision (~1.5%/run) was refused. My reading of the reason string was wrong; the builder reproduced it.
