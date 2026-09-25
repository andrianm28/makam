# Production switch: makam.co.id from the old app to v1

Status: ready-for-human
Blocked by: 04, 07, 64
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
