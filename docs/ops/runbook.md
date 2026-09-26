# Ops runbook: staging, GlitchTip, deploys (Jakarta VPS)

Host: the shared Jakarta VPS, 103.92.214.243 (ADR 0002). Other projects run
here too: **never stop, remove or change containers, networks or volumes that
are not `makam-staging`, `makam-prod` or `glitchtip`**, and never run
`docker system prune` or other global cleanup.

## What runs where

| What | Compose project | Listens on | Public URL |
|---|---|---|---|
| v1 staging (`web`, `worker`, `postgres`) | `makam-staging` | `127.0.0.1:3110` (web) | https://dev.makam.co.id (basic auth) |
| GlitchTip (`web`, `worker`, `postgres`, `valkey`) | `glitchtip` | `127.0.0.1:8130` (web) | https://errors.makam.co.id (live since 2026-09-25) |
| v1 production (ticket 65) | `makam-prod` | `127.0.0.1:3100` | https://makam.co.id |

Ports in use by other projects on this host: 3001, 8081, 8082, 8083 (old
Laravel app) and more. Check `sudo ss -ltnp` before picking a new one.

Every service has a memory and CPU limit (`docker stats --no-stream` shows
them). Staging and production both use `docker-compose.prod.yml` (the name is
historical; the file serves every host environment and has no production
defaults), and each has its own Postgres volume (`makam-staging_pgdata`,
`makam-prod_pgdata`). Nothing is shared with the old app. Every image is pinned
to an exact version and digest in the compose files.

## Files and secrets on the host

Everything lives under `/opt/makam-v1/` (owner `ubuntu`, directories 0700,
secret files 0600). None of it is in the repo.

| Path | What |
|---|---|
| `/opt/makam-v1/bin/makam-deploy` | deploy script (from `deploy/bin/`) |
| `/opt/makam-v1/bin/makam-healthcheck` | local watchdog (from `deploy/bin/`) |
| `/opt/makam-v1/staging/compose.yml` | copy of `docker-compose.prod.yml` |
| `/opt/makam-v1/staging/staging.env` | staging secrets and settings (see below) |
| `/opt/makam-v1/staging/deployed.env` | tag and release now running, and the previous tag (written by the deploy script) |
| `/opt/makam-v1/staging/deploy.log` | every deploy step, with migrate output |
| `/opt/makam-v1/staging-basic-auth.txt` | dev.makam.co.id basic auth user and password |
| `/etc/nginx/makam-staging.htpasswd` | its hash (root:www-data 0640) |
| `/opt/makam-v1/nginx-backups/` | verbatim backups of nginx blocks this work replaced |
| `/opt/makam-v1/glitchtip/compose.yml` | copy of `deploy/glitchtip/compose.yml` |
| `/opt/makam-v1/glitchtip/glitchtip.env` | GlitchTip `SECRET_KEY`, `POSTGRES_PASSWORD`, domain, email settings |
| `/opt/makam-v1/glitchtip/admin-credentials.txt` | GlitchTip superuser login |
| `/opt/makam-v1/glitchtip/api-token.txt` | GlitchTip API token (ops scripts) |
| `/opt/makam-v1/glitchtip/dsn-makam-{staging,prod}-{internal,public}.txt` | DSNs per project |
| `/etc/systemd/system/makam-staging-{deploy,health}.{service,timer}` | from `deploy/systemd/` |
| `/etc/nginx/snippets/makam-staging-proxy.conf` | proxy lines for dev.makam.co.id (from `deploy/nginx/`) |

After changing any file under `deploy/` or `docker-compose.prod.yml` on
`main`, run `deploy/install-host.sh` from an up-to-date, clean checkout of
`main` (it refuses any other branch or a dirty tree; `--allow-branch` is for
testing only). It copies the compose files, scripts, units and the nginx proxy
snippet, runs `nginx -t`, and never touches env files, nginx sites, or reloads
nginx.

### `staging.env`

The compose file has **no defaults** for the settings that pick an
environment, so a `docker compose` command without this file fails instead of
silently running as `makam-prod` or `production`. `makam-deploy` also refuses
to run unless the first three match `--env`:

| Variable | Staging value | What |
|---|---|---|
| `MAKAM_PROJECT` | `makam-staging` | compose project name (`name:` in the compose file) |
| `MAKAM_APP_ENV` | `staging` | becomes the containers' `APP_ENV` (live adapters, never fakes) |
| `MAKAM_IMAGE` | `ghcr.io/andrianm28/makam` | the only image `makam-deploy` accepts |
| `MAKAM_ENV_FILE` | `/opt/makam-v1/staging/staging.env` | this file again, as the containers' `env_file` |
| `MAKAM_WEB_PORT` | `3110` | web's port on 127.0.0.1 |
| `POSTGRES_PASSWORD`, `DATABASE_URL` | secret | staging's own Postgres |
| `AUTH_SECRET`, `APP_BASE_URL` | secret, `https://dev.makam.co.id` | sessions and Kode Masuk codes |
| `TOTP_ENCRYPTION_KEY` | secret, `openssl rand -base64 32` (exactly 32 bytes) | encrypts Admin Platform TOTP secrets at rest; **required from ticket 09 on**: without it `migrate`, `web` and `worker` refuse to start |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | secret pair from `npx web-push generate-vapid-keys` (unpadded base64url), one pair per environment | signs web push to staff (ticket 21); **required from ticket 21 on**: without them `migrate`, `web` and `worker` refuse to start |
| `VAPID_SUBJECT` | `mailto:<ops address>` or an https URL, never localhost | the contact push services see |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | GlitchTip internal DSN, `staging` | server-side errors |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.sumopod.com`, `465` (the defaults) | the EmailSender's SumoPod SMTP relay: implicit TLS, certificate verified (ticket 68) |
| `SMTP_USER`, `SMTP_PASSWORD` | secret (v1's own SumoPod SMTP credentials, ticket 04) | relay login; **required from ticket 68 on**: without them (and `EMAIL_FROM`) `migrate`, `web` and `worker` refuse to start |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | `no-reply@makam.co.id`, `Makam.co.id` (the default name) | sender of every email; Message-IDs are on its domain |

`MAKAM_TAG` and `MAKAM_RELEASE` come from `deployed.env`, which the deploy
script writes. `curl -s https://dev.makam.co.id/api/health | jq .environment`
shows the running `APP_ENV` (`staging`) without any secret.

## First Admin Platform (`seed:admin`)

The only seed (spec, Pengaturan Operator): it creates the first Admin Platform
from an email, seeded as its Email Terverifikasi (the Akun's key, ADR 0004),
and a phone number (+62) as its contact, and nothing else. It is refused once
any Admin Platform exists; every later staff member, Admin Platform included,
comes by Undangan Staf from the staff area (`/staf/admin-platform/staf`).

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/seed-admin.mjs --email admin@example.co.id --phone 0812xxxxxxxx
# [seed:admin] Admin Platform pertama dibuat: admin@example.co.id (Email Terverifikasi; telepon +62812xxxxxxxx). ...
# exit 1 "Ditolak: sudah ada Admin Platform ..." when one exists; exit 2 prints the usage.
```

Locally: `npm run seed:admin -- --email admin@example.co.id --phone 0812xxxxxxxx`
(with `DATABASE_URL`), or in a worktree's local stack `npm run stack -- exec web node dist/seed-admin.mjs ...`
(the main checkout's `makam-v1-dev` stack: `docker compose -p makam-v1-dev exec web ...`).

The seeded Admin Platform then logs in at `/masuk` with the Kode Masuk sent to
that email and enrols an authenticator app for TOTP at once. The Kode Masuk
goes through the live EmailSender (the SumoPod SMTP relay, `SMTP_*` above):
when the relay refuses, Masuk says the code could not be sent, and nothing
else happens (run `email-check`, below, to see why). There is no self-service
recovery of a lost authenticator; see "Resetting an Admin Platform's TOTP" below.

When an Akun already has that email as its Email Terverifikasi (someone logged
in with it before), the seed makes that Akun the Admin Platform and records the
phone number on it. The seed records an Entri Audit (actor role `seed_cli`,
action `staf.seed_admin_platform`).

Before launch, the Admin Platform then enters Pengaturan Operator at
`/staf/admin-platform/pengaturan-operator` (the Operator's legal name, address,
phone and email; the CS WhatsApp number, used only for the `wa.me` link of
"Tidak punya email? Minta bantuan CS", and its reply hours; ticket 06). None of
these has a default, in env or in code.

## Resetting an Admin Platform's TOTP (`reset-totp`)

When an Admin Platform loses their authenticator, ops resets it. Confirm who
is asking first (a call to the phone number on record, or another Admin
Platform vouching), then:

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/reset-totp.mjs admin@example.co.id --alasan "HP hilang; dikonfirmasi lewat telepon oleh <nama>"
# [reset-totp] TOTP Admin Platform admin@example.co.id direset dan semua sesinya diakhiri. ...
```

The email is the Admin Platform's Email Terverifikasi. The command clears its
enrolled authenticator and ends every session of the Akun, so the next Kode
Masuk login must enrol a new authenticator. It records an Entri Audit (actor
role `ops_cli`, action `akun.totp_reset`, the reason, before/after
`terdaftar: true` → `false`; never the secret). Exit 0 reset; exit 1 refused
(the email is not an Admin Platform's Email Terverifikasi, the reason is empty,
nothing is enrolled, or the database could not be reached: the message names
only the error code); exit 2 prints the usage. Locally:
`npm run reset-totp -- admin@example.co.id --alasan "..."` (with `DATABASE_URL`).

Never delete from `identity_totp` or `identity_session` by hand: that leaves no
Entri Audit. The Audit Log itself is append-only (the database refuses
`UPDATE` and `DELETE` on `audit_entry`).

## Akun from before ADR 0004 (Pemulihan Akun, `verify-email`)

Migration 0010 (ADR 0004) keys every Akun by its Email Terverifikasi. An Akun
that had one keeps working. An Akun without one (a WhatsApp number only, or an
email that was only typed in, e.g. on an Undangan Staf) keeps all its records
but had its sessions ended and cannot log in: a Kode Masuk to the email typed
on it makes a separate, new Akun. To give it back to its holder:

- **Pemulihan Akun** (the normal path): another Admin Platform, at
  `/staf/admin-platform/pemulihan-akun`, checks the holder's KTP, uploads it,
  and moves the Akun to an email the holder can open (it may be the email
  already on record). The staff roster marks such Akun Staf "Perlu Pemulihan
  Akun". Pemulihan Akun needs the FileStore for the KTP check; until the live
  S3 adapter is configured it refuses with "Email belum dipindah".
- **`verify-email`** (break-glass, Admin Platform only): when the Akun is an
  Admin Platform and no other Admin Platform can do the Pemulihan Akun (the
  only one, or the FileStore is not live yet), ops marks the email on record as
  its Email Terverifikasi from the server. Anyone who can run commands in the
  `web` container is already fully trusted; it is never for a Pemesan or any
  other Akun Staf.

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/verify-email.mjs admin@example.co.id --alasan "Admin Platform lama tanpa Email Terverifikasi; oleh <nama>"
# [verify-email] Email admin@example.co.id kini Email Terverifikasi Admin Platform itu. ...
```

The Admin Platform then logs in at `/masuk` with a Kode Masuk to that email and
still passes TOTP. The command logs no one in and creates no Akun. It records
an Entri Audit: action `akun.email_verifikasi`, actor role `ops_cli`,
before/after `{ email, terverifikasi: false → true }`, with the reason; no code
or secret is in it. Exit 0 when marked; exit 1 when refused: no Admin Platform
has that email on record unverified (it already is an Email Terverifikasi, or
the Akun is no Admin Platform), the reason is empty, another Akun already has
that email as its Email Terverifikasi (the database's unique index decides;
resolve it with a Pemulihan Akun to another email first), or the database could
not be reached (the message names only the error code); exit 2 prints the
usage. Locally: `npm run verify-email -- admin@example.co.id --alasan "..."`
(with `DATABASE_URL`).

Never set `email_verified_at` by hand: that leaves no Entri Audit and skips
the Admin-Platform-only rule.

## CI pipeline (GitHub Actions)

`.github/workflows/ci.yml`, one run per push and PR. On `main` the job graph is:

```
check (lint, typecheck, npm audit, Vitest) → image (build, push sha-<commit>) ─┬→ e2e  ─┐
secrets (gitleaks) ────────────────────────────────────────────────────────────┤         ├→ deploy-gate (tags :latest)
migrations (upgrade from the running release) ─────────────────────────────────┴→ scan ─┘
```

Every job except `deploy-gate` also runs on PRs and branch pushes, except that
there `image` builds without pushing and e2e and scan are skipped. The one
"main only" rule is the `image` job's `release` output. A warm `main` run
takes about 11 to 12 minutes.

- **check**: lint, typecheck, Vitest on a fresh Postgres, and `npm audit
  --omit=dev`, which fails on a critical advisory that has a fix (update the
  package; a critical with no fix is only counted).
- **secrets**: gitleaks over the whole repository history, default rules.
  Accepted findings (development-only keys, test fixtures) are in
  `.gitleaks.toml`, one file per entry, each with its reason. A real leaked
  secret: rotate it first ("Rotating secrets"), then remove it from the code;
  the history keeps it, so the rotation is what counts.
- **migrations**: the upgrade test. The running release (`:latest`, what
  staging runs) migrates an empty Postgres with its own `migrate`, the
  `seed-representative` script fills every table with a few rows, then this
  commit's migrations run on it (Vitest's global setup) and the domain tests
  run on the result. Before that, every migration file the running release
  does not have is checked for destructive DDL (DROP, RENAME, SET NOT NULL, a
  type change, a NOT NULL column without a default): each such statement
  needs a comment line `-- contract: <why nothing running needs it>` directly
  above it, and belongs in a later release than its expand step.
- **e2e** runs on a GitHub-hosted runner, never on this host. It starts the
  pushed `image:sha-<commit>@<digest>` (no rebuild) with
  `docker-compose.prod.yml`, the same file as staging, layered with
  `deploy/ci/compose.e2e.yml` (the image by digest, a network of its own) and
  its own empty Postgres: `run --rm migrate`, then `up -d --wait`, with
  `deploy/ci/e2e.env` (`APP_ENV=development`, so the in-memory fakes stand in
  for email, web push, payments and files). Then `npm run e2e` runs every spec
  in `e2e/` against `http://127.0.0.1:3310`, seeding the e2e Admin Platform
  with `seed-admin` inside the web container. On failure the run keeps the
  `e2e-results` artifact (Playwright traces, screenshots, `stack.log` with the
  web, worker, migrate and Postgres logs) for 14 days: open a trace with
  `npx playwright show-trace <trace.zip>`.
- **scan** runs Trivy (`aquasec/trivy`, pinned by digest) on the same image.
  It fails on any CRITICAL vulnerability that has a fix. The run keeps the
  image's SBOM (`sbom` artifact, CycloneDX, 90 days) and all findings
  (`trivy-findings`: `trivy.sarif` and `critical.txt`, also in the job
  summary, 30 days). Code scanning is not available on this private repo on
  GitHub Free; if it ever is, set the repo variable `CODE_SCANNING=true` and
  the `code-scanning` job (the only one with `security-events: write`)
  uploads the SARIF.
- **Accepting a finding** that cannot be fixed yet (e.g. the base image has
  no fix): add it to `.trivyignore` with the reason in a comment directly
  above and `exp:YYYY-MM-DD` at most 90 days out (`tests/trivyignore.test.ts`
  enforces both), in a reviewed PR. After the date the scan fails again.
  Usually the fix is a newer base image digest (Dependabot) or a dependency
  bump.
- **deploy-gate** needs every other job and re-tags the image `:latest`,
  which the staging timer follows. It runs in its own concurrency group and
  is never cancelled; `main` runs queue instead of cancelling each other,
  while PR and branch runs cancel superseded ones. A deploy (ticket 72)
  `needs: deploy-gate` and takes the exact image from its `ref` output.
- **Pins**: every action is pinned by commit SHA (version in a comment),
  every image by digest (CI's Postgres, Trivy, gitleaks, the node base image,
  the compose files). Dependabot (`.github/dependabot.yml`) proposes updates
  weekly for actions, npm, the Dockerfile and the compose files; they go
  through the same CI and review.
- Every job has least-privilege `permissions` (none by default) and
  `timeout-minutes`.
- Re-run a flaky e2e with "Re-run failed jobs" on the run; it uses the same
  image. Playwright already retries a failed test once in CI.

## Staging deploy

**Design: pull-based.** CI (`.github/workflows/ci.yml`, see "CI pipeline"
above) runs its checks, builds and pushes
`ghcr.io/andrianm28/makam:sha-<commit>`, runs e2e and the image scan on it,
and only then tags it `:latest`, only on `main`. On the host,
`makam-staging-deploy.timer` runs `makam-deploy --env staging` every 2 minutes
as `ubuntu`, which has a `read:packages` ghcr login in `~/.docker/config.json`.
The script:

1. pulls `:latest`, reads its `org.opencontainers.image.revision` label and
   pulls the immutable `:sha-<revision>` (it must be the same image);
2. exits if that tag is already running;
3. runs `docker compose run --rm migrate` with the new image. **If migrate
   fails, it stops here and the old `web`/`worker` keep running**;
4. runs `up -d --wait` (web and worker restart on the new tag; web's
   healthcheck must pass) and writes `deployed.env`;
5. waits up to 180 s for `/api/health` to return 200 (DB ok and a fresh
   worker heartbeat) and exits 2 if it doesn't.

Both units are hardened (`NoNewPrivileges`, `PrivateTmp`,
`ProtectSystem=strict`). The deploy unit can write only `/opt/makam-v1` and
reads the ghcr login from a read-only home; the health unit sees no home at
all. A new file the deploy must write outside `/opt/makam-v1` needs a
`ReadWritePaths=` line in `deploy/systemd/makam-staging-deploy.service`.

The VPS never builds images. It holds no SSH deploy key, and GitHub holds no
secret for the host. The only credential involved is the host's read-only ghcr
token. A new commit on `main` is live on staging about 2 minutes after CI
pushes the image.

```bash
# What happened
tail -n 30 /opt/makam-v1/staging/deploy.log
journalctl -u makam-staging-deploy.service -n 50 --no-pager
cat /opt/makam-v1/staging/deployed.env
systemctl list-timers 'makam-*'

# Deploy now instead of waiting for the timer
/opt/makam-v1/bin/makam-deploy --env staging

# Pause automatic deploys (e.g. while debugging), then resume
sudo systemctl stop makam-staging-deploy.timer
sudo systemctl start makam-staging-deploy.timer

# Any other compose command: always -p and both env files (without them it fails)
cd /opt/makam-v1/staging
docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env ps
docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env logs -f --tail 100 web worker
```

The first deploy on an empty database takes about 90 s to report healthy,
because the worker's first heartbeat has to arrive.

## Rolling back to a previous image tag

Every image CI pushed to ghcr is `sha-<full commit>`. `deployed.env` names the
running tag and `PREVIOUS_TAG`.

```bash
grep -E 'MAKAM_TAG|PREVIOUS_TAG' /opt/makam-v1/staging/deployed.env
sudo systemctl stop makam-staging-deploy.timer        # otherwise it re-deploys :latest within 2 min
/opt/makam-v1/bin/makam-deploy --env staging --tag sha-<previous commit>
# ...fix main (revert and push); once CI has pushed the fix:
sudo systemctl start makam-staging-deploy.timer
```

### Forward-only migrations

Migrations are forward-only: nothing ever runs a "down" migration, and rolling
the code back does not undo one. So **every migration must be
backward-compatible for one release**: the previous image must still run
against the new schema (expand, then contract in a later release; never
rename or drop a column the running code still reads in the same release).

If `migrate` succeeds but `up` (or the health check) then fails, the database
is already on the new schema. Either:

- **roll forward**: fix `main` and let the next image deploy, or
- **redeploy the previous tag** (`makam-deploy --env staging --tag <PREVIOUS_TAG>`),
  which works only because that image tolerates the new schema. Its own
  `migrate` step is a no-op, since those migrations are already applied.

Never restore a database backup to undo a migration on a live environment
without a separate decision: it loses every write since the backup.

## dev.makam.co.id and its rollback

On 2026-09-25 (ticket 07, approved by the user) the old Laravel app's dev block
was replaced. The old block proxied to `127.0.0.1:8081`, with no auth at the
time. The new block (`deploy/nginx/dev.makam.co.id.conf`) proxies to
`makam-staging` web on `127.0.0.1:3110`, keeps the Certbot certificate lines
and the 80 → 443 redirect, and adds HTTP basic auth. These stay open without
auth: `/.well-known/acme-challenge/` (renewals), `= /api/health` (uptime
monitor), and `= /api/webhooks/sumopod` (SumoPod sandbox; the route checks
the Svix signature). Both API exemptions are exact paths: `/api/webhooks/sumopod-x`
still needs auth, and `/.env`-style dotfiles are denied everywhere. The proxy
lines live in `/etc/nginx/snippets/makam-staging-proxy.conf`, which the site
file includes; `install-host.sh` installs it.

The old dev containers (`makam-nonprod-dev-*`) were **not** stopped. They still
answer on 127.0.0.1:8081, so a rollback is instant.

Backup (verbatim, sha256 `a274c42a…eadda3a`):
`/opt/makam-v1/nginx-backups/dev.makam.co.id.conf.20260925T111554Z`

```bash
# Roll back to the old app's dev environment
sudo install -o root -g root -m 0640 \
  /opt/makam-v1/nginx-backups/dev.makam.co.id.conf.20260925T111554Z \
  /etc/nginx/sites-available/dev.makam.co.id.conf
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://dev.makam.co.id/ | head -5            # old app: 200 with an x-correlation-id header

# Re-apply the staging block (from a checkout of this repo)
sudo install -o root -g root -m 0644 deploy/nginx/makam-staging-proxy.conf \
  /etc/nginx/snippets/makam-staging-proxy.conf
sudo install -o root -g root -m 0640 deploy/nginx/dev.makam.co.id.conf \
  /etc/nginx/sites-available/dev.makam.co.id.conf
sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w '%{http_code}\n' https://dev.makam.co.id/   # 401
```

Only ever `reload` nginx after `nginx -t` passes, never `restart`: other
sites share this nginx. `nginx -t` prints a warning, `protocol options
redefined for [::]:443 in .../makam.co.id.conf:58`. It was there before this
change and belongs to the `makam.co.id` block (ticket 65).

This was tested once on 2026-09-25: restore, `nginx -t`, reload, the old app
answered (200, same size and headers as before), then re-applied.

## errors.makam.co.id (GlitchTip behind nginx and TLS)

**Live since 2026-09-25** (DNS added, site enabled, Certbot). Before DNS existed GlitchTip was reachable only on the host
(`http://127.0.0.1:8130`, e.g. `ssh -L 8130:127.0.0.1:8130 ubuntu@103.92.214.243`
and open http://localhost:8130). Server-side events do not need DNS: `web` and
`worker` send them straight to `http://glitchtip-web:8000` over the Docker
network `glitchtip_ingest`.

The site file is ready but not enabled:
`/etc/nginx/sites-available/errors.makam.co.id.conf` (from
`deploy/nginx/errors.makam.co.id.conf`). Once `getent hosts errors.makam.co.id`
returns 103.92.214.243:

```bash
# Refresh it from the repo first (the repo copy has the security headers)
sudo install -o root -g root -m 0640 deploy/nginx/errors.makam.co.id.conf \
  /etc/nginx/sites-available/errors.makam.co.id.conf
sudo ln -s /etc/nginx/sites-available/errors.makam.co.id.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d errors.makam.co.id --non-interactive --agree-tos --redirect
sudo nginx -t && sudo systemctl reload nginx
curl -s https://errors.makam.co.id/_health/            # ok
```

Certbot reuses the host's existing ACME account. After that:

- Browser errors: set the GitHub variable `NEXT_PUBLIC_SENTRY_DSN` to the
  public DSN (`/opt/makam-v1/glitchtip/dsn-makam-staging-public.txt`). The DSN
  is public by design. Next.js inlines it at build time, so the next image
  picks it up. One image serves staging and production, so there is one
  browser DSN: browser events carry their environment from the page's host
  at runtime (`dev.makam.co.id` → `staging`, `makam.co.id`/`www` →
  `production`, anything else → `development`; `browserSentryEnvironment` in
  `src/lib/env.ts`). Filter by environment in GlitchTip.
- Set up SMTP for GlitchTip alerts (`EMAIL_URL` in `glitchtip.env`, via the
  SumoPod SMTP relay once ticket 04's email setup is done), then restart GlitchTip.

## GlitchTip: restart, upgrade, admin

```bash
cd /opt/makam-v1/glitchtip
G="docker compose -p glitchtip -f compose.yml --env-file glitchtip.env"
$G ps
$G logs --tail 100 web worker
$G restart web worker                                 # restart
curl -s http://127.0.0.1:8130/_health/                # ok

# Upgrade (read https://glitchtip.com/blog/ first for a new major version):
#   change the pinned image (version and digest) in deploy/glitchtip/compose.yml
#   on main, run deploy/install-host.sh, then:
$G pull
$G run --rm migrate                                   # migrations, cache table, partitions
$G up -d
```

Log in with `/opt/makam-v1/glitchtip/admin-credentials.txt`. The organisation
is `makam` and the team `makam`. There are two projects: `makam-staging`
(project 1) and `makam-prod` (project 2, for ticket 65). User registration and
organisation creation are off. Events are kept 90 days
(`GLITCHTIP_MAX_EVENT_LIFE_DAYS`). If the `glitchtip_ingest` network is ever
removed (`down`), start GlitchTip before the next app deploy, because the app
compose file expects that network.

## Test error (scrubbing check)

`dist/sentry-check.mjs` (from `src/cli/sentry-check.ts`) sends one test error
through the app's own Sentry options. The event carries a request body, a
cookie and phone numbers on purpose.

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/sentry-check.mjs web
$S exec worker node dist/sentry-check.mjs worker

# What GlitchTip stored: expect "[telepon]" in place of numbers, request data null, no cookie
TOKEN=$(cat /opt/makam-v1/glitchtip/api-token.txt)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8130/api/0/projects/makam/makam-staging/issues/ | jq '.[] | {id,title}'
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8130/api/0/issues/<id>/events/latest/ | jq '.entries'
```

Images built before this runbook have no `dist/sentry-check.mjs`. In that
case, build it (`npm run build:worker`), then `docker cp` it into the
container's `/tmp` and run it from there.

## Test email (SumoPod SMTP, DKIM / SPF / DMARC check)

`dist/email-check.mjs` (from `src/cli/email-check.ts`, `npm run email-check -- <to>`
in development) sends one real email through the live EmailSender with the
container's `SMTP_*` / `EMAIL_FROM` settings. It prints the check code and the
Message-ID (not the address); the subject is `[makam v1] email-check <code>`.
Send it to an Operator mailbox where the raw headers can be read, e.g.
`dmarc@makam.co.id` (Stalwart on this host).

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec worker node dist/email-check.mjs dmarc@makam.co.id
# exit 0: accepted by the relay; 1: "Gagal kirim: ..." (codes only); 78: SMTP settings missing
```

In the received message's headers, expect `DKIM-Signature: ... d=makam.co.id; s=trx_ke`
and `Authentication-Results: ... dkim=pass header.d=makam.co.id ... dmarc=pass`.
SPF passes for SumoPod's own bounce domain (return-path), so DMARC alignment comes
from DKIM. Images built before ticket 68 have no `dist/email-check.mjs`; build it
(`npm run build:worker`) and `docker cp` it into the container's `/tmp`, as for
`sentry-check`.

## Test PDF (PdfRenderer, "Unduh PDF")

The live PdfRenderer prints a Tagihan / Bukti page to PDF with the image's
headless Chromium (Debian `chromium-headless-shell` at `CHROMIUM_PATH`,
`/usr/bin/chromium-headless-shell`), opening the page on the web server itself
(`DOCUMENT_PAGE_ORIGIN`, default `http://127.0.0.1:$PORT`). `dist/pdf-check.mjs`
(from `src/cli/pdf-check.ts`) renders one page the same way and prints the PDF's
size; with no argument it renders the web server's home page.

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/pdf-check.mjs
# exit 0: "OK: ... dirender menjadi PDF <n> byte"; 1: "Gagal: ..." plus the renderer's reason
```

Images built before ticket 18 have no Chromium; rebuild the image.

## Uptime alarm

The monitor watches `https://dev.makam.co.id/api/health`. That path skips
basic auth. It returns 200 only when the DB answers and the worker heartbeat
is fresh; otherwise it returns 503 with `"ok":false`.

**External monitor (needs the user's account).** No free external monitor
could be set up without an account. Steps (UptimeRobot free plan, about 5
minutes):

1. Sign up at https://uptimerobot.com with the ops email and confirm it.
2. *Add New Monitor* → type **HTTP(s)**, name `makam staging /api/health`,
   URL `https://dev.makam.co.id/api/health`, interval 5 minutes.
3. Under *Advanced*, keep "alert when status is not 2xx". Optionally, make it a
   **Keyword** monitor instead: keyword `"ok":true`, alert when *not
   exists*.
4. Alert contacts: the ops email, plus the UptimeRobot mobile app or a
   Telegram integration for push.
5. Save, then test it: stop staging's DB for 6 minutes
   (`docker stop makam-staging-postgres-1`) and expect an alert. Start it
   again (`docker start makam-staging-postgres-1`) and expect the recovery
   notice.

For production (ticket 65), add a second monitor on `https://makam.co.id/api/health`.

**Local watchdog (installed).** `makam-staging-health.timer` runs
`makam-healthcheck https://dev.makam.co.id/api/health` every minute, through
nginx and TLS. Failures go to the journal at priority `err` with tag
`makam-health`, and the unit is marked failed:

```bash
journalctl -t makam-health -p err --since today
systemctl status makam-staging-health.service
```

The watchdog cannot page anyone and goes down with the host. It is not the
alarm.

## Rotating secrets

Each env file is 0600. Edit it in place (`nano /opt/makam-v1/staging/staging.env`).
Never paste values into the repo, a ticket or chat.

| Secret | Rotate |
|---|---|
| Basic auth (dev.makam.co.id) | `P=$(openssl rand -base64 24 \| tr -d '/+=' \| cut -c1-24)`; write `user=makam` / `password=$P` to `/opt/makam-v1/staging-basic-auth.txt`; `printf 'makam:%s\n' "$(openssl passwd -apr1 "$P")" \| sudo tee /etc/nginx/makam-staging.htpasswd >/dev/null`; `sudo nginx -t && sudo systemctl reload nginx` |
| `AUTH_SECRET` (staging) | new `openssl rand -hex 32` in `staging.env`, then `makam-deploy --env staging --force`. All sessions end, and pending Kode Masuk become invalid. |
| `TOTP_ENCRYPTION_KEY` (staging) | Rotate only if it leaked: the old key is needed to read every enrolled secret, and there is no re-encryption step. Put a new `openssl rand -base64 32` in `staging.env`, `makam-deploy --env staging --force`, then run `reset-totp` (above) for every Admin Platform with `--alasan "Rotasi TOTP_ENCRYPTION_KEY"`, so each enrols again at its next login. Until it is reset, an Admin Platform cannot pass TOTP under the new key. |
| `SMTP_PASSWORD` (staging) | create new SMTP credentials in the SumoPod dashboard, put them in `staging.env`, `makam-deploy --env staging --force`, run `email-check` (above), then revoke the old credentials |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (staging) | Rotate only if the private key leaked. Put a new pair in `staging.env`, `makam-deploy --env staging --force`. Every stored Perangkat Push was made for the old public key and stops receiving pushes (push services refuse it, and the device is removed at the next Peringatan Staf); staff press *Aktifkan notifikasi push* again on each device. The email copy of each Peringatan Staf is unaffected. |
| Staging Postgres password | see "Rotating a Postgres password" below |
| GlitchTip `SECRET_KEY` | new `openssl rand -hex 32` in `glitchtip.env`, then `$G up -d web worker`. Logins end. |
| GlitchTip Postgres password | see "Rotating a Postgres password" below |
| DSN (project key) | GlitchTip UI → project → *Client Keys*: create a new key, put the new DSN (host `glitchtip-web:8000`) in `SENTRY_DSN`, `makam-deploy --env staging --force`, then delete the old key |
| GlitchTip API token | GlitchTip UI → *Profile → Auth Tokens*: create a new one into `api-token.txt`, delete the old one |
| ghcr pull token | a new GitHub PAT with only `read:packages`, then `docker login ghcr.io -u andrianm28` as `ubuntu` |

### Rotating a Postgres password

The new password must never be in a command line (visible in `ps` and saved in
shell history). Use psql's `\password`, which prompts for it and sends it
already hashed:

```bash
# Staging (for GlitchTip: glitchtip-postgres-1, -U glitchtip -d glitchtip)
(umask 077; openssl rand -hex 24 > /opt/makam-v1/staging/.new-pg-password)   # created 0600
cat /opt/makam-v1/staging/.new-pg-password                      # copy it (terminal only)
docker exec -it makam-staging-postgres-1 psql -U makam -d makam
#   makam=# \password makam
#   Enter new password for user "makam": <paste>
#   Enter it again: <paste>
#   makam=# \q
```

Then edit `staging.env` in an editor (not with `sed -i 's/old/new/'`, which
puts it in argv): set `POSTGRES_PASSWORD` and the password inside
`DATABASE_URL`. Run `makam-deploy --env staging --force`, check
`/api/health`, and destroy the scratch file:

```bash
shred -u /opt/makam-v1/staging/.new-pg-password
```

For GlitchTip, set `POSTGRES_PASSWORD` in `glitchtip.env`, then `$G up -d`.
`POSTGRES_PASSWORD` only seeds a new data directory, so changing it in the env
file alone never changes an existing database's password.

## Production (ticket 65)

`docker-compose.prod.yml` is ready for `makam-prod`. Create
`/opt/makam-v1/prod/prod.env` like `staging.env`, with `MAKAM_PROJECT=makam-prod`,
`MAKAM_APP_ENV=production`, `MAKAM_ENV_FILE=/opt/makam-v1/prod/prod.env`,
`MAKAM_WEB_PORT=3100`, `APP_BASE_URL=https://makam.co.id`, a new
`POSTGRES_PASSWORD`, `AUTH_SECRET` and `TOTP_ENCRYPTION_KEY`, a VAPID pair with
`VAPID_SUBJECT`, `SENTRY_DSN` from `dsn-makam-prod-internal.txt`, and the
SumoPod SMTP settings (`SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`; required, see
the `staging.env` table). Copy the compose file to
`/opt/makam-v1/prod/compose.yml` and deploy with
`makam-deploy --env prod --tag sha-<commit>`. Production should deploy an
explicit tag rather than follow `:latest` on a timer. Seed the first Admin
Platform with `seed:admin` (above, with `-p makam-prod` and `prod.env`). Then
do the gated nginx switch.

Note (2026-09-25): the errors site hides GlitchTip's own `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy` (`proxy_hide_header`) so each is sent once, with the site-level value. Certbot rewrote the host copy of the site file (443 server, certificate lines, redirect); a pre-change backup is in `/opt/makam-v1/nginx-backups/`.

## Staging is public (2026-09-25)

Basic auth on `dev.makam.co.id` was removed at the user's request: staging is reachable without a password. `X-Robots-Tag: noindex` keeps it out of search engines. `/etc/nginx/makam-staging.htpasswd` and `/opt/makam-v1/staging-basic-auth.txt` are no longer used. Staging never uses fakes and payments there are SumoPod sandbox, but treat anything entered on staging as visible to anyone with the URL.

## Builder worktrees on the host (ticket 83)

Agent worktrees share two makam-owned things on the host (AGENTS.md,
"Worktrees on the shared host"). Neither is used by staging, production or CI.

**Dependency store**, `~/.cache/makam/deps/<platform>-<arch>-node<major>-<lockhash>/`
(`MAKAM_DEPS_STORE` moves it; it must be on the worktrees' filesystem). One
`npm ci` per lockfile, about 1.1 GB each, files read-only. Each entry lists in
`users` the worktree roots (of any clone) that linked from it, and each worktree
names its entry in `node_modules/.makam-deps`. `npm run deps -- --prune` removes
entries none of their users still links from, and crashed installs; entries
without a `users` file are kept (delete those by hand). Removing an entry never
breaks a worktree: its hard links keep the data until the worktree goes.

**Shared test Postgres**, container `makam-testpg` (`postgres:18`,
`127.0.0.1:55432`, user and password `makam`, label
`makam.role=shared-test-postgres`). Data lives in a tmpfs capped at 2 GB, so it
uses RAM, not disk: about 160 MB idle, plus the test databases in use (tens of
MB each). It runs with `--restart unless-stopped`, so it comes back after a
reboot (empty, which is fine: every run recreates its database).

```bash
docker stats --no-stream makam-testpg      # RAM in use
docker stop makam-testpg                   # stays stopped, even across reboots, until the next npm run test:shared
docker rm -f makam-testpg                  # gone; the next npm run test:shared starts a new one
```

Stop or remove it only when no agent is running `npm run test:shared`.
