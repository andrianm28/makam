# Handoff: makam v1 orchestration, cloud session 4 (2026-09-26, ~18:40 UTC)

Orchestrator for makam.co.id v1 on `andrianm28/makam`. Talk to the owner in **Bahasa Indonesia**. Session 3's handoff is in git history (`git log -p -- .scratch/makam-v1-build/handoff-cloud.md`).

## Read first
`AGENTS.md` (Working agreements), `CONTEXT.md`, `.scratch/makam-v1/spec.md` "Release plan", `.scratch/makam-v1-build/issues/00-index.md`.

## Owner decisions (session 3)
- "ya, push ke main": the orchestrator pushes merge commits to `main` itself.
- **Budget: about $100 credit left → be frugal.** Critical path only: **16 → 17 → 20 → 22 → 23 → 24 → 25** (target: a family can book Saat Duka on staging). Deferred: 72 (approved but paused for budget), 77–79, 80 (see below), 26–33, 36–38.
- Proposed, not yet answered: one sonnet reviewer with separate `## Standards` / `## Spec` sections for every diff, haiku for re-reviews. Ask once more.
- Network: owner added `registry.npmjs.org`, `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com`, `fonts.googleapis.com`, `fonts.gstatic.com`. In session 3's container npm still answered 403 and `docker pull` 403 (policy likely applies to new containers). **First step now: check `npm ci`, `docker pull postgres:18.6`, then `npm run lint && npm run typecheck && npm test` locally.** If npm is still 403, read the `environment.network` documentation page and tell the owner.
- Matt skills: installed via `claude plugin install mattpocock-skills@mattpocock` in session 3's container only; check whether `mattpocock-skills:*` skills show in this session (ticket 87). Keep vendored `.claude/skills/` until they do.

## State
`main` = a462fce: tickets 13, 76, 60, 14, 15, 81 merged this session (CI of the combined main not yet checked — check it first). Migrations now go to `0015_fieldwork_tugas_lapangan`; drizzle meta was hand-written in session 3 (no drizzle-kit) — once npm works, run `npm run db:generate` and confirm it reports no changes.

Open, not merged:
- `ticket-80-masuk-brand` @ 0273b1a (CI green): only restyles the TOTP field. Review found ticket 80 not done: no logo/Keluar on the TOTP page (docs/design-system.md), headings not on the type scale on Masuk, Akun Saya, /staf/email, TOTP. Deferred (not critical path).
- `ticket-72-signed-deploys`: builder stopped early for budget; branch may hold partial work — check before reuse or delete.

Follow-ups recorded in ticket Comments: 14 (unique alias index, audit role literal, Kavling first-Pemakaman picker), 15 (Selesai not one transaction), 13/76/61 (see their Comments).

## Lessons (token cost)
- Builders without local npm burned 400–700k tokens each polling CI; with npm local, brief builders to run `npm run lint`, `typecheck`, `npm test` before pushing and to hand back without waiting on CI.
- Subagents that hand back while waiting keep re-sending reports: `TaskStop` them after the report arrives.
- Parallel builders on the same area collide on migration numbers; run critical-path tickets sequentially.
