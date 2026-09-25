# Production environment: deploy, backups, uptime alarm, cutover on makam.co.id

Status: ready-for-agent
Blocked by: 01, 02, 03
Spec: Implementation Decisions > Architecture (production, CI, backups, error monitoring, cutover); Further Notes > Cutover, Pre-launch checklist; story 187; ADR 0002 (and its 2026-09-25 amendment)

## What to build

Take the walking skeleton to the Jakarta VPS (this host) as the `makam-prod` compose project. Extend the CI pipeline with a deploy job: pull the image from `ghcr.io/andrianm28/makam`, run Drizzle migrations as a separate step, then `docker compose pull && up -d` for `web` and `worker`. Add daily client-side-encrypted Postgres backups to the S3 Jakarta backups bucket, a scripted restore test, and the external uptime alarm on `/health`. Error events go to the self-hosted GlitchTip at `errors.makam.co.id` (ticket 02).

Then switch `makam.co.id` and `www` from the frozen Laravel app to v1 in the host's nginx. Today nginx proxies `makam.co.id` / `www` to 127.0.0.1:3001 (a bun process) and 127.0.0.1:8083 (a container), with Certbot TLS, and the old app's SumoPod payments are live. The switch waits for a human confirmation gate and has a rollback.

## Acceptance criteria

- [ ] A push to `main` deploys: image pulled from ghcr, `migrate` runs and must succeed before `web`/`worker` restart; no builds on the VPS.
- [ ] `makam-prod` has its own Postgres (never shared with the old app or any other project) and memory/CPU limits on every service; `web` binds to 127.0.0.1 on the port recorded in ticket 02, clear of 3001, 8081, 8082 and 8083.
- [ ] GlitchTip receives an intentional test error from `web` and from `worker`, with no body or phone number in the event.
- [ ] Daily backup (pgBackRest with `repo-cipher-type` or wal-g with libsodium) to `makam-prod-backups` in `ap-southeast-3`, encrypted client-side; WAL/retention settings documented in the repo.
- [ ] A restore script restores the latest backup into a scratch Postgres and runs a row-count check; it has been run once and the result recorded in `## Comments`.
- [ ] **Open question answered before the switch**: must any data from the old app (users, orders, Lokasi, payments) be carried over or archived? The Operator's answer, and any carry-over or archive done, is recorded in `## Comments`. This includes what happens to old-app SumoPod payments still open at the switch (ticket 04).
- [ ] **Human confirmation gate**: the nginx switch runs only after a named human confirms in `## Comments` that v1 is ready to replace the old app and the open question above is answered.
- [ ] **Switch**: the current `makam.co.id` / `www` server block is backed up verbatim, then replaced by one proxying to `makam-prod` `web`, keeping the Certbot certificate; `nginx -t` passes before reload. `dev.makam.co.id` is not touched.
- [ ] **Rollback**: a documented, tested step restores the saved server block and reloads nginx, putting the old app back on `makam.co.id`.
- [ ] After the switch, `/health` is reachable over TLS on `https://makam.co.id` and reports DB and worker heartbeat, and the SumoPod webhook `https://makam.co.id/api/webhooks/sumopod` reaches v1.
- [ ] The external uptime monitor watches `https://makam.co.id/health` and alerts on failure, including when the worker heartbeat is stale.
- [ ] A runbook in the repo (`docs/ops/`) covers deploy, rollback to the previous image tag, the nginx switch and its rollback, restore, rotating secrets, and restarting / upgrading the GlitchTip project.
- [ ] Tests: CI runs the deploy job only on `main`; the restore script is exercised in CI against a local backup of the test database.

## Notes

Until the gate is passed, `makam-prod` runs on its local port with no public hostname (v1 does not use `dev.makam.co.id`); the pipeline, backups and GlitchTip can be finished first and the switch done later.

## Amended (2026-09-25, decided with the user)

- [ ] **Staging at `dev.makam.co.id`** (replaces "no public hostname" above): a `makam-staging` compose project served at `dev.makam.co.id` behind HTTP basic auth, with its own database. The current `dev.makam.co.id` block (proxy to 127.0.0.1:8081, the old app's dev environment) is backed up verbatim and replaced **only after the user confirms** at that moment; rollback restores it. The old dev containers are not stopped or removed by this ticket.
- [ ] Staging uses SumoPod **sandbox** credentials and a sandbox webhook to `https://dev.makam.co.id/api/webhooks/sumopod` (basic auth exempted for that path only).
- [ ] Production gets the **live** SumoPod key, secret and webhook URL only on the switch day.
