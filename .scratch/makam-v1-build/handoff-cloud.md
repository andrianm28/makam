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

## State at handoff
- `main` = 8b3b0e9: ticket 16 merged (722ae7e) and marked resolved; CI green.
- In flight (builders were running when this was written; check branch on origin before relaunching):
  - 17 `ticket-17-antrean` (built in the main checkout `/home/user/makam`, uncommitted when handed off).
  - 72 `ticket-72-signed-deploys` (worktree; fresh start, the old branch never reached origin).
  - 78 `ticket-78-admin-lokasi-redesign` (worktree).
  - 79 `ticket-79-field-roles-phones` (worktree).
  - 80 `ticket-80-masuk-brand` @ 8b83d3c: built, pushed; Standards + Spec reviews were running. Builder found logo/Keluar on TOTP already present via `src/app/staf/layout.tsx` fallback; fixed headings to the type scale.
- If a branch is missing on origin, its work was lost with the container: relaunch the builder from origin/main.

## Environment (cloud)
- Docker pulls work; `npm test` ~3.5 min. **Two env-only failures to ignore**: `tests/tooling/deps-store.test.ts` (runs as root) and `src/adapters/live/chromium-pdf-renderer.test.ts` (Chromium makes no PDF). Worth a small ticket to make both skip/pass in cloud.
- Worktree builders symlink `node_modules` from `/home/user/makam` and use `npm run test:shared`.
- dockerd runs without HTTPS_PROXY yet pulls fine; optional hardening of `.claude/hooks/session-start.sh` line 24 discussed, not done.
- Matt skills plugin (`mattpocock-skills:*`) still not visible; vendored `.claude/skills/` in use (ticket 87).

## Builder brief pattern (keeps tokens low)
Point to paths only (AGENTS.md, CONTEXT.md, ticket file, design-system.md, tdd skill); branch from origin/main first; lint + typecheck + tests locally; one commit with session trailers; push branch; no CI waiting, no PR, never push main; report ≤200 words. `TaskStop` agents after their report. After merge: flip Status to `resolved` in the ticket file and `00-index.md`.

## Suggested skills
`code-review` (every branch), `tdd` (builders), `resolving-merge-conflicts` (parallel branches landing on main), `diagnosing-bugs` (red CI), `grilling` / `domain-modeling` only if a builder raises a domain question.
