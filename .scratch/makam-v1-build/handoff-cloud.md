# Handoff: makam v1 orchestration, cloud session 6 (2026-09-27)

Orchestrator for makam.co.id v1 on `andrianm28/makam`. Talk to the owner in **Bahasa Indonesia**. Earlier handoffs: `git log -p -- .scratch/makam-v1-build/handoff-cloud.md`.

This file is the session's memory. If the context is long and degrading, read this file and start fresh — do not carry a degraded window forward (a co-ordinator on this shared host merged 30 PRs in one session, watched its own text corrupt, and nearly broke `main` twice; a `/clear` between tickets is not optional).

## Read first
`AGENTS.md` (Working agreements — now includes every orchestration rule below in durable form), `CONTEXT.md`, `.scratch/makam-v1/spec.md` "Release plan", `.scratch/makam-v1-build/issues/00-index.md`.

## State at handoff
- `main`: **26/41 Rilis 1 tickets resolved** (34 of 87 total). Recent merges: 17, 20, 64, 72, 77, 79, 85, plus 13–16, 18, 19, 21, 60, 61, 63, 66–71, 74–76, 78–83.
- **Ticket 22** (Saat Duka wizard): branch merged in a merge worktree, 1309 tests green; the second verification after pulling `origin/main` was still running. Push → flip `resolved` → remove its worktree. It unblocks 23 and 26.
- **Ticket 36** (Terencana wizard): fix pass running (Standards 3 HARD + Spec 5). Merges **after 22** — both claim drizzle `0017`, and 36 must regenerate its migration as `0019`; ticket 43 has also taken `0019`, so 43 regenerates again on its rebase.
- **Tickets 43, 49, 86** + a research agent: building. 49 and 43 are Rilis 2/3 — they were started because nothing in Rilis 1 was unblocked.
- 64 merged and `resolved`. 72 merged with status **`in-progress`** (code complete; rehearsal and credentials are human-gated).

## Migration numbering: four tickets are queued for the same number
`main` is at `0019_pemesanan_makam`. Three branches each carry their own `0020_*` (36 `curved_dorian_gray`, 43 `foamy_hitman`, 86 `cooing_felicia_hardy`) and ticket 49 still carries a colliding `0019_mature_amphibian`. All of them are additive, so nothing breaks — the merge order decides who gets which number:

**36 → 0020, then 43 → 0021, then 86 → 0022, then 49 → 0023.**

Each one regenerates with `npm run db:generate` from a freshly merged `main`; never hand-edit `_journal.json` and never rename a migration file. Expect the non-first merges to have to redo this step, and verify with `grep -c "idx: N"` (must be 1) plus unique tags.

## Owner decisions (settled — do not re-ask)
- **An Akun has a name**, captured at Kode Masuk. Consequence: the Kode Masuk form gained "Nama Anda"; `identityUser.name` is no longer `""`; for a signed-in Pemesan the wizard's email field is read-only (CONTEXT.md: Verifikasi Email is the only self-service way to change one's own login email).
- **The pre-migrate `pg_dump` stays local**; nothing goes off-host in v1. Ticket 72's AC 19 was rewritten to match.
- **Ticket 72 may be merged** — the one ticket that had the "ask before production" hold.
- **The vendored `.claude/skills/` copies stay** as a fallback, though the plugin covers them (ticket 87 stays open on purpose).
- 64's rescope (beta): nightly encrypted `pg_dump`, 7 days on the host, weekly restore check; pgBackRest/S3/PITR stay in v2.

## Open, and only the owner can close these
1. **Credentials**: `COSIGN_STAGING_PRIVATE_KEY` + `COSIGN_PROD_PRIVATE_KEY` (+ passwords), a fine-grained `MAKAM_GITHUB_TOKEN` (Deployments: write), `GLITCHTIP_AUTH_TOKEN`, and a per-env backup passphrase (`openssl rand -base64 32`, 0600, **keep an offline copy**). Until the cosign keys exist the `sign` job is red on every `main` push — fail-closed on purpose, and `deploy-gate` does not depend on it.
2. **AC 9 rehearsal** for 72 (`makam-prod` promoted through 127.0.0.1:3100 with sandbox keys).
3. **Is 73 blocked?** 72's code is on `main` but 72 is `in-progress`, so the index still lists 73 as blocked.
4. **04, 06, 86** human items before 65; 65 also waits on 60, 64, 68 and 86.
5. **Provider top-up** — every builder currently runs the free model; the paid tiers fail with "Insufficient account funds".

## Host etiquette (shared with the FFI project)
- **One full `npm run test:shared` at a time** across all makam worktrees. Load average was 13 on 8 cores with both projects running four agents. Lint, typecheck and build may overlap.
- Merged tickets' worktrees are removed in the same turn; only live tickets keep one. Each is ~1.1 GB.
- Never `docker system/image/volume/builder prune`. `makam-staging*`, `makam-testpg`, `makam-nonprod-*` are ours; everything else on the host is not.

## Workflow (Matt Pocock skills, per AGENTS.md)
`tdd` per slice in builders → `code-review` two parallel axes (Standards with the smell baseline pasted in, Spec against the ticket), reported verbatim and never re-ranked → **both axes recorded in the ticket's `## Comments` before the fix pass is dispatched** → the same builder session fixes → re-review item by item → merge from a freshly fetched `origin/main` → flip `Status:` + `00-index.md` + a dated comment → remove the worktree. `resolving-merge-conflicts` resolves by intent, never `--abort`. One writer per worktree; a subagent that returns with no report is a failure, not a result.

## Suggested skills
`code-review` (every branch), `tdd` (builders), `resolving-merge-conflicts` (parallel branches landing on main), `diagnosing-bugs` (red CI), `research` (the old-app catalog question), `grilling`/`domain-modeling` only when a domain question appears — and then ask the owner, do not decide it in a brief.
