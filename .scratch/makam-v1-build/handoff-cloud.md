# Handoff: makam v1 orchestration, cloud session 5 (2026-09-27)

Orchestrator for makam.co.id v1 on `andrianm28/makam`. Talk to the owner in **Bahasa Indonesia**. Earlier handoffs: `git log -p -- .scratch/makam-v1-build/handoff-cloud.md`.

## Read first
`AGENTS.md` (Working agreements), `CONTEXT.md`, `.scratch/makam-v1/spec.md` "Release plan", `.scratch/makam-v1-build/issues/00-index.md`.

## Owner decisions (this session)
- **Budget no longer a constraint** ("hiraukan budget, jalankan percepatan"): run up to 4 builders in parallel (sonnet), each in its own worktree.
- **Review = 2 parallel sonnet reviewers** (Standards, Spec) per `.claude/skills/code-review`, then the same builder fixes (resume via SendMessage), then a **haiku** re-review of the fix list.
- **Merge**: owner said "merge" = standing permission to merge a ticket branch into `main` once both axes are clean and CI on the branch head is green. Exception: **ticket 72 (production deploy pipeline) needs the owner's explicit OK before merge.** The auto-mode classifier blocks *scheduled/unattended* pushes to main (send_later → "Production Deploy"); merge only in a turn right after the owner's go.
- **Rilis 1 scope confirmed to include 64, 72, 73, 77, 78, 79, 80** besides the critical path.
- Open question to owner: **64 (backups)** depends on 03 (AWS S3, moved to v2). Backup target for v1 (other storage) or move 64 to v2?

## Queue (order)
Critical path: 17 → 20 → 22 → 23 ∥ 26 → 24 → 25. Then 68 (SMTP; blocked by human ticket 04). Ops/UI in parallel slots: 72 → 73, 80, 78, 79, then 77 (after 17: both touch Admin Platform). 64 pending decision.

## State at handoff (2026-09-27 ~03:10 UTC)
- `main`: tickets 16 and 80 merged and marked resolved (last: 60fec6f + this handoff). CI green on both.
- Ready to merge once branch CI is green (both review axes clean): **78** `ticket-78-admin-lokasi-redesign` @ 62552f9 (CI run 36290035158 was still running; merge through a separate worktree of origin/main, then flip Status to resolved in ticket file + `00-index.md`).
- In review: **17** `ticket-17-antrean` @ a5cfe94. Standards: 0 hard; judgement calls: migration 0016 also carries two SET DEFAULT on inventory columns (ticket-14 drift, safe), and `overdueFrom` + fetch/map shape duplicated across the three Tier 4 row-type files (extract a shared helper). Spec review was still running; open reading to check: "revisit" = Kunjungan Verifikasi on a Lokasi no longer Belum Tayang (new `publishedAt`), not a purpose flag on fieldwork. Next: send Spec findings + the helper extraction to a builder, haiku re-review, merge.
- Builders in flight (check origin for the branch before relaunching; missing branch = relaunch from origin/main):
  - **72** `ticket-72-signed-deploys` (needs owner OK before merge: production pipeline).
  - **79** `ticket-79-field-roles-phones`.
  - **68** `ticket-68-smtp-emailsender` (SMTP adapter tested against a local SMTP container; real creds are human ticket 04).
  - **chore** `chore-cloud-test-env`: skip deps-store read-only test as root, fix the Chromium PDF test's root cause, ESLint-ignore `.claude/worktrees/`. Once merged, the "two env-only failures" note below goes away.
- **86 blocked**: needs a read-only catalog export from the old app's `makam_beta` DB (catalog tables only, no personal/order/payment data) or a session on the VPS. Asked the owner.
- Unblocked once 17 merges: **20** (critical path), **77** (Admin Platform forms). Then 22 → 23 ∥ 26 → 24 → 25; 73 after 72.
- Note: `npm run lint` in the main checkout also lints `.claude/worktrees/*` until the chore lands; builders lint their own files.

## Environment (cloud)
- Docker pulls work; `npm test` ~3.5 min. **Two env-only failures to ignore**: `tests/tooling/deps-store.test.ts` (runs as root) and `src/adapters/live/chromium-pdf-renderer.test.ts` (Chromium makes no PDF). Worth a small ticket to make both skip/pass in cloud.
- Worktree builders symlink `node_modules` from `/home/user/makam` and use `npm run test:shared`.
- dockerd runs without HTTPS_PROXY yet pulls fine; optional hardening of `.claude/hooks/session-start.sh` line 24 discussed, not done.
- Matt skills plugin (`mattpocock-skills:*`) still not visible; vendored `.claude/skills/` in use (ticket 87).

## Builder brief pattern (keeps tokens low)
Point to paths only (AGENTS.md, CONTEXT.md, ticket file, design-system.md, tdd skill); branch from origin/main first; lint + typecheck + tests locally; one commit with session trailers; push branch; no CI waiting, no PR, never push main; report ≤200 words. `TaskStop` agents after their report. After merge: flip Status to `resolved` in the ticket file and `00-index.md`.

## Suggested skills
`code-review` (every branch), `tdd` (builders), `resolving-merge-conflicts` (parallel branches landing on main), `diagnosing-bugs` (red CI), `grilling` / `domain-modeling` only if a builder raises a domain question.
