# Infrastructure accounts: VPS, domain, GitHub, GlitchTip

Status: ready-for-human
Spec: Implementation Decisions > Architecture; Further Notes > Pre-launch checklist; ADR 0002 (amendment 2026-09-25)

## What to build

Set up the accounts and secrets the production deploy (ticket 07) needs. All vendor accounts must be in PT Jaya Korpora Prima's name.

Known facts (2026-09-25): the VPS is this host (Jakarta, 103.92.214.243), already running nginx with Certbot. nginx serves `makam.co.id` and `www` to the frozen Laravel app (127.0.0.1:3001 and 127.0.0.1:8083) and `dev.makam.co.id` to 127.0.0.1:8081. Other projects run here too, so v1 is its own compose project `makam-prod` and must not use ports 3001, 8081, 8082 or 8083. v1 is served on `makam.co.id` itself; the switch happens in ticket 07.

## Acceptance criteria

- [ ] Domain `makam.co.id`: registrant is PT Jaya Korpora Prima (transfer the registrant if not); DNS access available. DNS for `makam.co.id` and `www` already points to 103.92.214.243 (no change needed). The v1 hostname is `makam.co.id`.
- [ ] DNS A record `errors.makam.co.id` → 103.92.214.243 added (it does not exist yet).
- [ ] Jakarta VPS (this host): a deploy user with SSH key, Docker and the compose plugin installed; a directory for the `makam-prod` compose project; confirm free memory/CPU for `web`, `worker`, a dedicated Postgres and the GlitchTip project alongside the other projects on this host.
- [ ] Ports chosen for `makam-prod` `web` and for GlitchTip web, bound to 127.0.0.1 and clear of 3001, 8081, 8082 and 8083; recorded under `## Comments`.
- [ ] GlitchTip running as its own compose project (Postgres, Redis, web, worker, each with a memory limit) at `https://errors.makam.co.id`, behind the host's nginx with a Certbot certificate; an organisation and project created; DSN stored as the secret `SENTRY_DSN` (the app uses the Sentry SDK); data scrubbing on. No Sentry cloud account.
- [x] GitHub repository `https://github.com/andrianm28/makam` (private, default branch `main`) with Actions enabled; `gh` on this host is logged in as andrianm28 with the `repo` and `workflow` scopes. Images go to `ghcr.io/andrianm28/makam`.
- [ ] ghcr package access for the VPS (a read-only token); repository secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_READ_TOKEN`.
- [ ] External uptime monitor account (any service outside the VPS) with an alert contact; record which one in this ticket.
- [ ] Production `.env` values written on the VPS (Postgres password, app secret, Better Auth secret); nothing committed.

## Notes

The nginx server block for `makam.co.id` is not changed here; ticket 07 switches it behind a human confirmation gate. Do not touch `dev.makam.co.id`. Record the chosen ports and uptime service under `## Comments` so ticket 07 can use them.

## Amended (2026-09-25)

`dev.makam.co.id` becomes v1 staging in ticket 07 (user decision); this ticket still does not change any nginx block. DNS for `dev.makam.co.id` already points to this host. GitHub owner stays the personal account `andrianm28` for now (transfer to a PT JKP organisation later if wanted).
