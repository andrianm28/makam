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
| `AUTH_SECRET`, `APP_BASE_URL` | secret, `https://dev.makam.co.id` | sessions and OTP |
| `TOTP_ENCRYPTION_KEY` | secret, `openssl rand -base64 32` (exactly 32 bytes) | encrypts Admin Platform TOTP secrets at rest; **required from ticket 09 on**: without it `migrate`, `web` and `worker` refuse to start |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | GlitchTip internal DSN, `staging` | server-side errors |
| `SMTP_HOST`, `SMTP_PORT` | `smtp.sumopod.com`, `465` (the defaults) | the EmailSender's SumoPod SMTP relay: implicit TLS, certificate verified (ticket 68) |
| `SMTP_USER`, `SMTP_PASSWORD` | secret (v1's own SumoPod SMTP credentials, ticket 04) | relay login; **required from ticket 68 on**: without them (and `EMAIL_FROM`) `migrate`, `web` and `worker` refuse to start |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | `no-reply@makam.co.id`, `Makam.co.id` (the default name) | sender of every email; Message-IDs are on its domain |

`MAKAM_TAG` and `MAKAM_RELEASE` come from `deployed.env`, which the deploy
script writes. `curl -s https://dev.makam.co.id/api/health | jq .environment`
shows the running `APP_ENV` (`staging`) without any secret.

## First Admin Platform (`seed:admin`)

The only seed (spec, Pengaturan Operator): it creates the first Admin Platform
from a WhatsApp number (+62) and an email, and nothing else. It is refused once
any Admin Platform exists; every later staff member, Admin Platform included,
comes by Undangan Staf from the staff area (`/staf/admin-platform/staf`).

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/seed-admin.mjs 0812xxxxxxxx admin@example.co.id
# [seed:admin] Admin Platform pertama dibuat: +62812xxxxxxxx (admin@example.co.id). ...
# exit 1 "Ditolak: sudah ada Admin Platform ..." when one exists; exit 2 prints the usage.
```

Locally: `npm run seed:admin -- 0812xxxxxxxx admin@example.co.id` (with
`DATABASE_URL`), or `docker compose -p makam-v1-dev exec web node dist/seed-admin.mjs ...`.

The seeded Admin Platform then logs in at `/masuk` with the WhatsApp OTP
(staging needs the live WhatsApp adapter, ticket 62, before any OTP arrives)
and enrols an authenticator app for TOTP at once. There is no self-service
recovery of a lost authenticator; see "Resetting an Admin Platform's TOTP" below.

Before launch, the Admin Platform then enters Pengaturan Operator at
`/staf/admin-platform/pengaturan-operator` (the Operator's legal name, address,
phone and email; the CS WhatsApp number and its reply hours; ticket 06). None of
these has a default, in env or in code.

## Resetting an Admin Platform's TOTP (`reset-totp`)

When an Admin Platform loses their authenticator, ops resets it. Confirm who
is asking first (a call to the number on record, or another Admin Platform
vouching), then:

```bash
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S exec web node dist/reset-totp.mjs 0812xxxxxxxx --alasan "HP hilang; dikonfirmasi lewat telepon oleh <nama>"
# [reset-totp] TOTP Admin Platform +62812xxxxxxxx direset dan semua sesinya diakhiri. ...
```

It clears that Admin Platform's enrolled authenticator and ends every session
of the Akun, so the next login by OTP must enrol a new authenticator. It
records an Entri Audit (actor role `ops_cli`, action `akun.totp_reset`, the
reason, before/after `terdaftar: true` → `false`; never the secret). Exit 0
reset; exit 1 refused (the number is not an Admin Platform, the reason is
empty, nothing is enrolled, or the database could not be reached: the message
names only the error code); exit 2 prints the usage. Locally:
`npm run reset-totp -- 0812xxxxxxxx --alasan "..."` (with `DATABASE_URL`).

Never delete from `identity_totp` or `identity_session` by hand: that leaves no
Entri Audit. The Audit Log itself is append-only (the database refuses
`UPDATE` and `DELETE` on `audit_entry`).

## Staging deploy

**Design: pull-based.** CI (`.github/workflows/ci.yml`) runs lint, typecheck
and Vitest, then builds the image and pushes `ghcr.io/andrianm28/makam:latest`
and `:sha-<commit>`, only on `main` and only when the checks pass. On the host,
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
| `AUTH_SECRET` (staging) | new `openssl rand -hex 32` in `staging.env`, then `makam-deploy --env staging --force`. All sessions end, and pending OTPs become invalid. |
| `TOTP_ENCRYPTION_KEY` (staging) | Rotate only if it leaked: the old key is needed to read every enrolled secret, and there is no re-encryption step. Put a new `openssl rand -base64 32` in `staging.env`, `makam-deploy --env staging --force`, then run `reset-totp` (above) for every Admin Platform with `--alasan "Rotasi TOTP_ENCRYPTION_KEY"`, so each enrols again at its next login. Until it is reset, an Admin Platform cannot pass TOTP under the new key. |
| `SMTP_PASSWORD` (staging) | create new SMTP credentials in the SumoPod dashboard, put them in `staging.env`, `makam-deploy --env staging --force`, run `email-check` (above), then revoke the old credentials |
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
`POSTGRES_PASSWORD`, `AUTH_SECRET` and `TOTP_ENCRYPTION_KEY`, `SENTRY_DSN` from
`dsn-makam-prod-internal.txt`, and the SumoPod SMTP settings (`SMTP_USER`,
`SMTP_PASSWORD`, `EMAIL_FROM`; required, see the `staging.env` table). Copy the compose file to
`/opt/makam-v1/prod/compose.yml` and deploy with
`makam-deploy --env prod --tag sha-<commit>`. Production should deploy an
explicit tag rather than follow `:latest` on a timer. Seed the first Admin
Platform with `seed:admin` (above, with `-p makam-prod` and `prod.env`). Then
do the gated nginx switch.

Note (2026-09-25): the errors site hides GlitchTip's own `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy` (`proxy_hide_header`) so each is sent once, with the site-level value. Certbot rewrote the host copy of the site file (443 server, certificate lines, redirect); a pre-change backup is in `/opt/makam-v1/nginx-backups/`.

## Staging is public (2026-09-25)

Basic auth on `dev.makam.co.id` was removed at the user's request: staging is reachable without a password. `X-Robots-Tag: noindex` keeps it out of search engines. `/etc/nginx/makam-staging.htpasswd` and `/opt/makam-v1/staging-basic-auth.txt` are no longer used. Staging never uses fakes and payments there are SumoPod sandbox, but treat anything entered on staging as visible to anyone with the URL.
