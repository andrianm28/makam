# Deploys through GitHub Actions: self-hosted runner, staging auto-deploy, production promotion

Status: ready-for-agent
Blocked by: 71
Spec: Implementation Decisions > Architecture (CI/CD, production); ADR 0002 (amendment of 2026-09-26); docs/ops/runbook.md

## What to build

Decided with the user on 2026-09-26. Replace the pull-based staging timer with deploy jobs in GitHub Actions that run on a self-hosted runner on this host, and add the production promotion. The runner only connects outbound; GitHub holds no host secret; environment secrets stay in `/opt/makam-v1/<env>/<env>.env`. Deploy jobs call the existing `deploy/bin/makam-deploy`.

## Acceptance criteria

- [ ] **Runner**: a GitHub Actions self-hosted runner for `andrianm28/makam` on the host, running as its own unprivileged user (no sudo; docker access only as the deploy needs), as a hardened systemd service, labelled so only deploy jobs select it; installed by `deploy/install-host.sh` or a documented step; never used for build or test.
- [ ] **Staging**: after ticket 71's e2e and scan pass on `main`, a deploy job on the runner deploys that exact `sha-<commit>` to `makam-staging` (GitHub Environment `staging`) and records a GitHub Deployment with the URL; the `makam-staging-deploy.timer` is retired (the health timer stays).
- [ ] **Production promotion**: a `workflow_dispatch` (or release) workflow promotes the **digest currently deployed and healthy on staging** to `makam-prod` behind the GitHub Environment `production` with the user as required reviewer; no rebuild; it creates the tag `vYYYY.MM.DD-N` with generated release notes.
- [ ] **Production safety in `makam-deploy --env prod`**: a `pg_dump` snapshot before `migrate` (kept locally with rotation; pushed off-host once ticket 64 exists); `migrate` fails → nothing restarted; failed `up` or `/api/health` → automatic rollback to the previous tag, and the job fails. Migrations are never rolled back automatically. AGENTS.md states the expand/contract rule for migrations.
- [ ] **One digest for both environments**: nothing environment-specific is baked at build time; the browser GlitchTip DSN (`NEXT_PUBLIC_SENTRY_DSN`) becomes a runtime value served to the browser, with a test that the staging and prod containers of one image report to their own DSN.
- [ ] **Releases**: each deploy creates a GlitchTip release for the commit; a failed deploy notifies through GitHub's own notifications.
- [ ] **Rehearsal**: `makam-prod` is deployed once through the promotion on 127.0.0.1:3100 with sandbox keys and no nginx change; a forced failing healthcheck shows the automatic rollback. Live SumoPod keys, the nginx switch and going live stay in ticket 65, and production is not live before ticket 64.
- [ ] Runbook: the new deploy flow, how to approve a production promotion, how to roll back by hand, how to pause deploys, and where logs are (GitHub run + `deploy.log`).
