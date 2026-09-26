# Handoff: makam v1 orchestration moves to Claude Code cloud (2026-09-26)

You are the new orchestrator for makam.co.id v1, running in a Claude Code cloud session on `andrianm28/makam` (`main`). The previous orchestrator ran on the shared VPS; it stops dispatching agents to save the owner's weekly budget and to use cloud credits. Talk to the owner in **Bahasa Indonesia**; they answer grilling rounds with "ya lanjut semua rekomendasi".

## Read first (don't re-derive)

- `AGENTS.md` — architecture rules **and "Working agreements for agents"**: Matt Pocock workflow (skills vendored in `.claude/skills/`), model tiering (always pass `model`: sonnet builders/first reviews, haiku re-reviews/docs, opus only for hard cases; ≤ 4 builders), the owner's **standing merge authorization** (merge clean two-axis reviews without asking; ask for decisions, spec/ADR changes, destructive actions, production), priorities.
- `CONTEXT.md` (glossary), `docs/adr/0001–0004` (0003 superseded by 0004; 0002 has several amendments, the latest "beta UAT").
- `.scratch/makam-v1/spec.md` — esp. "Release plan", "Maps on public pages", "Staff UI and design system", Billing (QRIS only, Rp 10 juta cap, late-payment rule).
- `.scratch/makam-v1-build/issues/00-index.md` — ticket table and dated "Decisions" sections; ticket files carry the detail in `## Comments`.
- `docs/ops/runbook.md`, `docs/design-system.md`.

## Where things stand

- **Goal now:** v1 **beta for UAT live on `makam.co.id` ASAP** (replacing the frozen Laravel app via ticket 65), SumoPod **sandbox**, dummy/stock content, catalog imported from the old app (ticket 86), host-disk FileStore (60), local nightly backups (64). S3, live payments, more gateways → v2.
- **Merged today** (resolved): 18, 19 (+ Rp 10 juta cap), 71, 74, 82 (email is the Akun key, WhatsApp removed), 83 (lean worktrees). `main` = `d7f7e32` at writing; staging (`dev.makam.co.id`) follows `main` through CI → `deploy-gate` → the host's pull timer.
- **Branches waiting for YOU to review (two axes, `code-review` skill) and merge** — none is merged:
  - `ticket-76-lokasi-mitra` (Lokasi Mitra list/detail redesign; built on 763ad2b; rebase onto `main` before merging).
  - Being finished on the VPS and pushed there when done (check `git ls-remote --heads origin`): `ticket-75-palette-bell` (already reviewed clean; rebased with its migration renumbered to 0012 — just verify and merge), `ticket-13-denah`, `ticket-60-filestore`, `ticket-61-sumopod-sandbox`. Migration numbers can collide between branches: whoever merges second regenerates its migration as the next free number (`npm run db:generate`), keeps hand-written data steps and `-- contract:` markers.
- **Throwaway prototypes** (never merge): branches `worktree-agent-aebfc82ebc2eab39d` (staff), and on the VPS only `worktree-agent-ab5e1eadecba063e3` (public site + Terencana Denah picker, commit 23d2d17) and `worktree-agent-ac5f7e6b188a129d1` (Denah editor, 041576e). Galleries: staff https://claude.ai/artifact/BpcTyBmWqYXL2EFCNrt9bx, public https://claude.ai/artifact/SYuh5fzc8TjkWQ5aoecYiF, Denah https://claude.ai/artifact/9rzchqdiMRVuEmdSAQQKoz. All their decisions are recorded on tickets 13, 16, 22, 26, 36.

## Next steps (Rilis 1 critical path)

1. Review/merge the waiting branches above.
2. Critical path to "a family books Saat Duka on staging": 14, 15 → 16 → 17 → 20 → 22 → 23 → 24 → 25; plus 26 (public site from the prototype), 36–38 (Terencana), 27, 28, 29–33 (money), 64, 68, 86, 72 (signed deploys, with its follow-up list), 73, 77–81 (redesign), 85, 87.
3. **Ticket 87 trial**: first cloud builder run proves the SessionStart hook (`npm ci`, Docker for the Postgres 18 test container); record findings in ticket 87 and fix the hook if needed. In the cloud, use `npm ci` + `npm test` (the VPS-only `npm run deps` / `test:shared` / `stack` are for the shared host).
4. Ticket 65 (switch `makam.co.id`) is human-gated and needs host access (nginx, env files): hand the host steps to the owner or the VPS session.

## Things only the VPS / the owner can do

- Host env files (`/opt/makam-v1/*/*.env`): SumoPod **sandbox** keys and webhook secret for ticket 61, anything new from tickets 60/64/68. Never put secrets in the cloud environment or the repo.
- `deploy/install-host.sh`, systemd timers, nginx, the `makam.co.id` switch, reading the old app's database for ticket 86 (it lives on the VPS; a cloud session can't reach it — ticket 86's import must run on the host).
- Owner tasks open: confirm with the Operator that no old-app payment is still open before the switch; the brand designer's SVG logo (use the interim one meanwhile); check the Rp 10 juta cap against real partner prices.

## Rules to keep

- Never print secrets; never send personal data (emails, phones) to outside services.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and the session's `Claude-Session:` URL line (use your own session URL).
- After a merge: set the ticket `Status: resolved`, update `00-index.md`, push, watch CI (`gh run list --workflow CI --branch main`) — the first scan on a cold Trivy cache used to fail (fixed in 9f20437).

## Suggested skills

- `code-review` — every waiting branch before merge (two axes, reported separately).
- `grilling` + `domain-modeling` (or `grill-with-docs`) — any new decision; record in spec/CONTEXT/ADR/tickets.
- `tdd` — put it in every builder's brief.
- `resolving-merge-conflicts` — rebasing 76/13/60/61 onto `main`, migration renumbering.
- `prototype` — only if a new UI question comes up (public site and Denah are decided).
- `research` — vendor/API questions (SumoPod notes are already on ticket 61, backups on 64).
- `to-tickets` and `handoff` are user-invoked.
