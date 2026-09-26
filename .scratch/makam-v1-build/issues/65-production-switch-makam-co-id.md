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

