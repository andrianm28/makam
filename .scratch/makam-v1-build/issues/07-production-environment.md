# Staging, GlitchTip, deploy pipeline and uptime alarm

Status: ready-for-agent
Blocked by: 01
Spec: Implementation Decisions > Architecture (staging, CI, error monitoring, uptime); ADR 0002 (and its 2026-09-25 amendment); story 187

## What to build

Split on 2026-09-25 (user decision): backups moved to [64](64-backups-s3-jakarta.md) (needs AWS, ticket 03) and the `makam.co.id` switch to [65](65-production-switch-makam-co-id.md). This ticket gives v1 a live staging environment now.

Run v1 as the `makam-staging` compose project on this host (Jakarta), served at `https://dev.makam.co.id` behind HTTP basic auth, pulled from `ghcr.io/andrianm28/makam`. Stand up self-hosted GlitchTip as its own compose project at `https://errors.makam.co.id`. Add a CI deploy job and an external uptime alarm on `/api/health`. Prepare the `makam-prod` compose project so ticket 65 only has to switch nginx.

## Acceptance criteria

- [ ] A push to `main` deploys staging: image pulled from ghcr, `migrate` runs and must succeed before `web`/`worker` restart; no builds on the VPS. The deploy mechanism (CI over SSH, or a pull-based agent on the host) is chosen, documented and secret-safe.
- [ ] `makam-staging` has its own Postgres (never shared with the old app or any other project), memory/CPU limits on every service, and `web` bound to 127.0.0.1 on a free port clear of 3001, 8081, 8082, 8083 and `makam-prod`'s 3100.
- [ ] **dev.makam.co.id takeover** (approved by the user on 2026-09-25): the current `dev.makam.co.id` nginx block (proxy to 127.0.0.1:8081, the old app's dev environment) is backed up verbatim, replaced by one proxying to `makam-staging` `web` with HTTP basic auth (credentials stored outside the repo), keeping the Certbot certificate; `nginx -t` passes before `reload`. The old dev containers are not stopped or removed. `/api/webhooks/sumopod` is exempt from basic auth.
- [ ] **Rollback** for the dev block is documented and tested once (restore, `nginx -t`, reload, then re-apply).
- [ ] **GlitchTip** runs as its own compose project (Postgres, Redis/Valkey, web, worker) with memory limits, behind nginx + Certbot at `errors.makam.co.id` (needs the DNS A record to 103.92.214.243 from ticket 02; if it is missing, everything else is finished and the TLS/nginx step waits). Staging `web` and `worker` send an intentional test error that arrives with no body or phone number.
- [ ] The uptime alarm watches `https://dev.makam.co.id/api/health` (through basic auth or an exempt path) and alerts when the DB is down or the worker heartbeat is stale.
- [ ] Staging runs on in-memory-free wiring (staging never uses fakes); ports without a live adapter yet refuse calls, and `/health` still reports.
- [ ] A runbook in `docs/ops/` covers the staging deploy, rolling back to a previous image tag, the dev block and its rollback, GlitchTip restart/upgrade, and rotating secrets.

## Notes

Other projects run on this host: never stop, remove or modify containers, networks or volumes that are not `makam-staging` or the GlitchTip project. Pulling a private ghcr image needs a token with `read:packages`.
