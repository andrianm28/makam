# Production switch: makam.co.id from the old app to v1

Status: ready-for-human
Blocked by: 07, 60, 64, 68, 86
Spec: Implementation Decisions > Architecture (production on makam.co.id); Further Notes > Cutover, Pre-launch checklist; ADR 0002 (and its 2026-09-25 amendment)

## What to build

Split from ticket 07 on 2026-09-25. Replace the frozen Laravel app on `makam.co.id` / `www` with v1 (`makam-prod`). Today nginx proxies `makam.co.id` / `www` to 127.0.0.1:3001 (a bun process) and 127.0.0.1:8083 (a container), with Certbot TLS, and the old app's SumoPod payments are live. Human-gated: an agent may prepare and rehearse, but the switch runs only after the gate.

## Acceptance criteria

- [ ] **Open question answered before the switch**: must any data from the old app (users, orders, Lokasi, payments) be carried over or archived? The Operator's answer, and any carry-over or archive done, is recorded in `## Comments`, including what happens to old-app SumoPod payments still open at the switch (ticket 04).
- [ ] **Human confirmation gate**: a named human confirms in `## Comments` that v1 is ready to replace the old app and the question above is answered.
- [ ] `makam-prod` deployed from ghcr with live SumoPod key, secret and webhook URL installed on the switch day only.
- [ ] **Switch**: the current `makam.co.id` / `www` block is backed up verbatim, replaced by one proxying to `makam-prod` `web` (127.0.0.1:3100), keeping the Certbot certificate; `nginx -t` passes before reload.
- [ ] **Rollback**: a documented, tested step restores the saved block and reloads nginx, putting the old app back.
- [ ] After the switch, `https://makam.co.id/api/health` reports DB and worker heartbeat, the SumoPod webhook `https://makam.co.id/api/webhooks/sumopod` reaches v1, and the uptime alarm watches production.

## Comments

- 2026-09-26 — ADR 0004: now also blocked by 68: the live SumoPod SMTP EmailSender is a launch requirement, since email carries every Kode Masuk and family message. The WhatsApp vendor items (ticket 05) are out of v1 and no longer part of the pre-launch checklist.
- 2026-09-26 — User decision: take data from the old app as dummy data for the v1 beta UAT (scope and privacy rules pending, see the index).
- 2026-09-26 — User decision: the v1 **beta for UAT goes live on `makam.co.id` itself** (not a subdomain), with SumoPod sandbox, dummy content and the old app's catalog data (ticket 86). The switch stays human-gated with the tested rollback; the old app's live payments stop at the switch — the Operator must confirm no old-app payment is still open. Blocked by the beta essentials instead of live accounts.
- 2026-09-26 — Old-app cleanup plan approved by the owner (done so far from the VPS session: exposed `mktveri-pg`/`mktveri-redis` removed; the old dev stack, dead workers, `stg-placeholder`, `makam-notify.service` and the `/api/notify` nginx location removed). Checked read-only: the old app's database `makam_beta` holds test data and **no real money** — its only payment session is `sumopod-sandbox`, never paid; users are mostly `example.test` plus team accounts; one unrecognised Gmail account and ~22 order contacts with realistic phone numbers are probably team test entries (owner to confirm). **Stage 3, after ticket 86 and the switch + 14 days of rollback window:** optionally an encrypted dump of users/orders (skip if the owner confirms they are all tests), then remove the `makam-nonprod-*` containers, volumes and the `makam-app` image, `/home/ubuntu/makam-app`, `/opt/makam-notify`, the nginx backup blocks, and archive the `makam-app` GitHub repo.
- 2026-10-03 — **Promote preparation (coordinator; checklist only, nothing run on the VPS or in production).** Production opens Rilis 1 only (`RILIS_TERBUKA=1`, ADR 0006); all Rilis 1–3 code is on `main` and green. What stands between `main` and the switch, in order:
  1. **Owner, accounts and data** — ticket 04 (live SumoPod merchant and the SMTP relay with SPF/DKIM for PT Jaya Korpora Prima), 02 (GlitchTip release token as a GitHub secret, also ticket 72 "Releases"), 03 (the private S3 buckets in Jakarta and their keys on the host), 06 (Operator facts and launch reference data). Rotate the SumoPod sandbox API key and webhook secret (they were pasted into a chat).
  2. **Owner, this ticket's gate** — answer the old-app data question (the old `makam_beta` holds test data and no real money; confirm the unrecognised Gmail account and the ~22 realistic phone numbers are team tests) and confirm no old-app SumoPod payment is open; then a named human writes the confirmation here.
  3. **Owner, staging** — re-UAT on `dev.makam.co.id` against the Rilis 1 menu; the host agent runs the prepared staging SQL for the Perpanjangan UAT; send the staging web log ticket 98 needs (Kirim may show the framework error page when a Kode Masuk cannot be sent: fix it before the switch).
  4. **Rehearsal on the VPS** (ticket 72, open item "Rehearsal"; the host agent or the owner, sandbox keys, no nginx change) — run the promotion once to `makam-prod` on 127.0.0.1:3100; check that an unsigned image is refused and that a forced failing healthcheck rolls back on its own; run `makam-restore-test` against the latest backup; record each result in ticket 72.
  5. **Switch and rollback files** — the repo has no nginx block for `makam.co.id` yet (`deploy/nginx/` holds dev, errors and the staging proxy): an agent can prepare the production block (proxy to 127.0.0.1:3100, keep the Certbot certificate) and a tested rollback step (restore the saved block, `nginx -t`, reload), human-gated, before the switch day.
  6. **Switch day (owner)** — install the live SumoPod key, secret and webhook URL; run `promote.yml` (owner only, the release tag typed again; it refuses a digest staging does not run healthy with a passed smoke test); check `/api/health` on 127.0.0.1:3100; back up the current nginx block, install the new one, `nginx -t`, reload; check `https://makam.co.id/api/health`, the SumoPod webhook reaching v1 and the uptime alarm; the rollback step stays ready for the 14-day window, after which the old-app cleanup (stage 3 above) may run.
  The index row for this ticket listed blockers 04, 07, 64, 68; this ticket's header says 07, 60, 64, 68, 86 (04 dropped when the beta went live on sandbox keys, 2026-09-26): the index is corrected to the header.
