# Rebuild v1 from scratch on Next.js, self-hosted on the shared Jakarta VPS

v1 is a fresh TypeScript codebase (Next.js App Router, Postgres + Drizzle, pg-boss, Better Auth), not a continuation of the existing Laravel app at `/home/ubuntu/makam-app` (Laravel 13 / Livewire / Filament, ~1,500 commits, dev and beta running), which is frozen as reference. We chose TypeScript because the builder is one engineer working with AI agents and wants the stack those agents write most reliably, with one language across UI, back office and domain logic; the accepted cost is losing Filament's generated admin panels and rebuilding the back office by hand. Production runs on the same Jakarta VPS that hosts makam-app's nonprod and other projects, with a self-managed Postgres, rather than a managed database: it keeps primary data in Indonesia (no UU PDP cross-border transfer) at almost no cost. The accepted risk is one shared machine, mitigated by a separate `makam-prod` compose project with its own Postgres, daily off-host backups to Indonesian object storage with restore tests, and an external uptime alarm. Managed Postgres options with a Jakarta region (GCP Cloud SQL, AWS RDS) remain the move if that risk stops being acceptable.

## Amendment (2026-09-25)

- **Error monitoring is GlitchTip, self-hosted on this host**, not Sentry cloud. The app keeps the Sentry SDK (a DSN swap). GlitchTip runs as its own compose project (Postgres, Redis, web, worker, each with a memory limit) at `errors.makam.co.id`, behind the host's nginx with a Certbot certificate. PII scrubbing rules are unchanged. This also removes error events from the flows of data out of Indonesia. Accepted cost: one more service to run and upgrade on the shared machine.
- **v1 replaces the frozen Laravel app on `makam.co.id` at deploy time.** The host already serves `makam.co.id` and `www` through nginx to the old app, with live SumoPod payments; `makam-prod` gets its own ports (clear of 3001, 8081, 8082 and 8083) and the nginx switch is a gated, reversible step of the production deploy. `dev.makam.co.id` is unaffected.

## Amendment (2026-09-25, ticket 07)

This corrects the last sentence of the amendment above ("`dev.makam.co.id` is unaffected").

- **`dev.makam.co.id` now serves v1 staging** (compose project `makam-staging`) behind HTTP basic auth, replacing the frozen Laravel app's dev environment there, as the user approved on 2026-09-25. The old block (proxy to 127.0.0.1:8081) is backed up verbatim on the host and the old dev containers keep running, so the rollback is an nginx restore and reload (`docs/ops/runbook.md`). Only `/api/health` (uptime monitor) and `/api/webhooks/sumopod` (Svix-signed) skip basic auth.
- **Deploys are pull-based, not pushed by CI.** CI builds and pushes `ghcr.io/andrianm28/makam` (`latest` and `sha-<commit>`, from `main` only, after the checks pass) and never connects to the VPS. On the host, a systemd timer runs `makam-deploy`, which pulls the image with a read-only `read:packages` token, runs `migrate`, and runs `up` only if the migration succeeded. We chose this over CI deploying over SSH because it keeps no deploy key or host secret in GitHub and needs no inbound access to the shared machine. Accepted cost: a deploy lands up to about 2 minutes after the image is pushed, and a failed deploy shows up in the host's journal and `deploy.log` rather than in the CI run. Production (ticket 65) deploys an explicit tag with the same script instead of following the timer.

## Amendment (2026-09-25, later): staging is public

`dev.makam.co.id` serves v1 staging **without** HTTP basic auth (user decision). It stays unindexed via `X-Robots-Tag`.
