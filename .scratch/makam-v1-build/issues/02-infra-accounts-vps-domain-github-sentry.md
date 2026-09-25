# Infrastructure accounts: VPS, domain, GitHub, Sentry

Status: ready-for-human
Spec: Implementation Decisions > Architecture; Further Notes > Pre-launch checklist

## What to build

Set up the accounts and secrets the production deploy (ticket 07) needs. All vendor accounts must be in PT Jaya Korpora Prima's name.

## Acceptance criteria

- [ ] Domain `makam.co.id`: registrant is PT Jaya Korpora Prima (transfer the registrant if not); DNS access available; decide the hostname for v1 while the frozen Laravel beta still runs on `makam.co.id` (cutover is decided near launch, see Further Notes).
- [ ] Jakarta VPS: a deploy user with SSH key, Docker and the compose plugin installed; a directory for the `makam-prod` compose project; confirm free memory/CPU for `web`, `worker` and a dedicated Postgres alongside makam-app nonprod.
- [ ] Reverse proxy / TLS on the VPS for the chosen hostname (existing proxy or a new one), pointing to `web`.
- [ ] GitHub repository with Actions enabled; ghcr package access for the VPS (a read-only token); repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_READ_TOKEN`.
- [ ] Sentry organisation/project (cloud) in PT JKP's name; DSN stored as a secret `SENTRY_DSN`; data scrubbing defaults on.
- [ ] External uptime monitor account (any service outside the VPS) with an alert contact; record which one in this ticket.
- [ ] Production `.env` values written on the VPS (Postgres password, app secret, Better Auth secret); nothing committed.

## Notes

Record the chosen hostname and uptime service under `## Comments` so ticket 07 can use them.
