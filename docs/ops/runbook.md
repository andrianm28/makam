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
| `/etc/systemd/system/makam-staging-{deploy,health,files-backup}.{service,timer}` | from `deploy/systemd/` |
| `/etc/nginx/snippets/makam-staging-proxy.conf` | proxy lines for dev.makam.co.id (from `deploy/nginx/`) |
| `/opt/makam-v1/<env>/backups/files/files-<UTC timestamp>.tar.gz` | nightly FileStore tar, kept 7 days (`makam-backup-files`) |

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
| `SUMOPOD_API_KEY`, `SUMOPOD_WEBHOOK_SECRET` | secret (SumoPod's **sandbox** project key and Svix secret in staging for the v1 beta; ticket 04) | the live PaymentProvider (QRIS, ticket 61); **required from ticket 61 on**: without them `migrate`, `web` and `worker` refuse to start |
| `SUMOPOD_BASE_URL` | unset (defaults to the sandbox host in staging, the live host in production) | override only if SumoPod ever splits sandbox/live differently than by environment |
| `FILES_ROOT` | not set (defaults to `/data/files`, the `files` volume's mount point) | where the live FileStore (ticket 60) reads and writes; only set it to something else if the volume is ever mounted elsewhere |

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

Migration 0011 (ADR 0004) keys every Akun by its Email Terverifikasi. An Akun
that had one keeps working. An Akun without one (a WhatsApp number only, or an
email that was only typed in, e.g. on an Undangan Staf) keeps all its records
but had its sessions ended and cannot log in: a Kode Masuk to the email typed
on it makes a separate, new Akun.

**When deploying migration 0011 (once per environment).** An Admin Platform
seeded before it without `--email-terverifikasi` has no Email Terverifikasi:
the migration ends its session, and it cannot log in again (a Kode Masuk to
its email would make a new, plain Akun). So, right after the deploy and before
anyone logs in with that email, run `verify-email <its email> --alasan "..."`
(below) for it; then it logs in with a Kode Masuk to that email and passes TOTP
as before. Check who needs it with the staff roster ("Perlu Pemulihan Akun")
or, before the deploy, `select email from identity_user u join identity_staff_role r
on r.account_id = u.id and r.role = 'admin_platform' where u.email_verified_at is null;`.
Staging's EmailSender is the live SumoPod SMTP relay (`SMTP_*` are required
there, `src/lib/env.ts`), so the Kode Masuk arrives by email on staging.

To give any other such Akun back to its holder:

- **Pemulihan Akun** (the normal path): another Admin Platform, at
  `/staf/admin-platform/pemulihan-akun`, checks the holder's KTP, uploads it,
  and moves the Akun to an email the holder can open (it may be the email
  already on record). The staff roster marks such Akun Staf "Perlu Pemulihan
  Akun", linked to the screen with that Akun picked by its id (the only way to
  an Akun with no email on record); an email on record of more than one Akun is
  refused, so pick such an Akun by its id too. The old email gets a notice that
  the Akun was moved (no new email, no code). Pemulihan Akun needs the FileStore for the KTP check; until the live
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

`.github/workflows/ci.yml`, one run per pull request and per push to `main`. A
branch push with no pull request deliberately runs nothing, so one commit is
never checked twice. On `main` the job graph is:

```
check (lint, typecheck, npm audit, Vitest) → image (build, push sha-<commit>) ─┬→ e2e  ─┐
secrets (gitleaks) ────────────────────────────────────────────────────────────┤         ├→ deploy-gate ─→ sign (cosign, then tag :latest)
migrations (upgrade from the running release) ─────────────────────────────────┴→ scan ─┘
```

Every job except `deploy-gate` and `sign` also runs on pull requests, except
that there `image` builds without pushing and e2e and scan are skipped. The one
"main only" rule is the `image` job's `release` output. A warm `main` run takes
about 11 to 12 minutes.

- **check**: lint, typecheck, Vitest on a fresh Postgres, and `npm audit
  --omit=dev`, which fails on a critical advisory that has a fix (update the
  package; a critical with no fix is only counted).
- **secrets**: gitleaks over the whole repository history, default rules.
  Accepted findings are in `.gitleaks.toml`, one file per entry, each naming the
  exact fixture secret(s) of that one file and why it is not a secret. (No entry
  lists `paths`: a gitleaks path allowlist is whole-file and ignores
  `matchCondition`, which is exactly the widening this file exists to prevent.)
  A real leaked secret: rotate it first ("Rotating secrets"), then remove it from
  the code; the history keeps it, so the rotation is what counts.
- **migrations**: the upgrade test. It upgrades from **the digest production is
  actually running**, then staging, and only then the ghcr `latest` tag — read
  from the newest GitHub Deployment that names a digest
  (`scripts/migrations/deployed-release.ts`), because a deploy follows signed
  digests and production lags staging. A host that has never deployed has no
  baseline, which is not an error: the upgrade then starts from an empty
  database. That release migrates the database with its own `migrate`, the
  `seed-representative` script fills **every** table with a few rows (the run
  fails if any table stays empty: an empty table would hide exactly the breakage
  this test exists to catch), then this commit's migrations run on it (Vitest's
  global setup) and the domain tests run on the result. Before that, every
  migration file the running release does not have is checked for destructive
  DDL (DROP, TRUNCATE, RENAME, SET NOT NULL, a type change, a NOT NULL column
  without a default, a new UNIQUE/FOREIGN KEY/CHECK constraint on a table that
  existed before): each such statement needs a comment line
  `-- contract: <why nothing running needs it>` on the line(s) **directly** above
  it, and belongs in a later release than its expand step. A constraint on a
  table the same migration creates is expand, and passes without a marker.
- **e2e** runs on a GitHub-hosted runner, never on this host. It starts the
  pushed `image:sha-<commit>@<digest>` (no rebuild) with
  `docker-compose.prod.yml`, the same file as staging, layered with
  `deploy/ci/compose.e2e.yml` (the image by digest, a network of its own) and
  its own empty Postgres: `run --rm migrate`, then `up -d --wait`, with
  `deploy/ci/e2e.env` (`APP_ENV=development`, so the in-memory fakes stand in
  for email, web push, payments and files). Then `npm run e2e -- --grep-invert
  @smoke` runs the critical paths in `e2e/` against `http://127.0.0.1:3310`,
  seeding the e2e Admin Platform with `seed-admin` inside the web container. On
  failure the run keeps the `e2e-results` artifact (Playwright traces,
  screenshots, `stack.log`) for 14 days: open a trace with `npx playwright
  show-trace <trace.zip>`.
- **scan** runs Trivy (`aquasec/trivy`, pinned by digest) on the same image.
  It fails on any CRITICAL vulnerability that has a fix. The run keeps the
  image's SBOM (`sbom` artifact, CycloneDX, 90 days) and all findings
  (`trivy-findings`: `trivy.sarif` and `critical.txt`, 30 days). Code scanning
  is not available on this private repo on GitHub Free; if it ever is, set the
  repo variable `CODE_SCANNING=true`.
- **deploy-gate** needs every other job. It moves no tags: it only says the image
  passed everything.
- **sign** is the job that makes a deploy possible (ticket 72): it signs the
  digest with the **staging** cosign key and only then moves `:latest`, so the
  host can never pick up an unsigned digest. It runs in its own `sign`
  concurrency group and is never cancelled. `latest` is only a *pointer*: the
  host resolves it to a digest and refuses anything the key did not sign.
- **Accepting a finding** that cannot be fixed yet: add it to `.trivyignore`
  with the reason in a comment directly above and `exp:YYYY-MM-DD` at most 90
  days out (`tests/trivyignore.test.ts` enforces both), in a reviewed PR.
- **Pins**: every action is pinned by commit SHA (version in a comment), every
  image by digest (CI's Postgres, Trivy, gitleaks, the node base image, the
  compose files). Dependabot proposes updates weekly.
- Every job has least-privilege `permissions` and `timeout-minutes`.
- Re-run a flaky e2e with "Re-run failed jobs"; it uses the same image.
- **Concurrency**: GitHub keeps one *pending* run per group, so a new push
  cancels the pending one and a run in the middle is skipped. Off main nothing
  was deployed, so that costs nothing. On main, `deploy-gate` and `sign` are in
  groups of their own with `cancel-in-progress: false`: a cancelled run would
  cancel all its jobs, and a half-signed image is worse than a slow one.
- **Shared steps**: the ghcr login is `.github/actions/ghcr-login` and the
  Chromium for the PdfRenderer test is `.github/actions/chromium`, so each
  exists once. The image name always comes from `GITHUB_REPOSITORY`, never from
  a literal.

## Signing keys (cosign)

Two **separate** key pairs, one per environment. The private halves never leave
GitHub: they are repository secrets and only the workflows below read them. The
public halves live on the host and in no repository.

| Environment | Private key (GitHub secret)          | Password (secret)            | Public key on the host                    | Signs in                       |
| ----------- | ----------------------------------- | ---------------------------- | ---------------------------------------- | ------------------------------ |
| staging     | `COSIGN_STAGING_PRIVATE_KEY`        | `COSIGN_STAGING_PASSWORD`    | `/opt/makam-v1/staging/cosign.pub`       | `ci.yml` job `sign`            |
| production  | `COSIGN_PROD_PRIVATE_KEY`           | `COSIGN_PROD_PASSWORD`       | `/opt/makam-v1/prod/cosign.pub`          | `promote.yml`, `rollback.yml`   |

Creating them (once, on a machine with cosign):

```bash
cosign generate-key-pair                       # writes cosign.key and cosign.pub
# The private half goes into the secret, the public half onto the host:
gh secret set COSIGN_STAGING_PRIVATE_KEY < cosign.key
gh secret set COSIGN_STAGING_PASSWORD          # the password you chose, or empty
```

Installing the public half on the host (it is not in the repo, so
`install-host.sh` never overwrites one that is already there):

```bash
MAKAM_COSIGN_PUB_STAGING=/tmp/cosign.pub deploy/install-host.sh
sudo install -m 0644 /tmp/cosign.pub /opt/makam-v1/prod/cosign.pub   # production
```

Without a public key an environment's deploys are **refused** (exit 78), never
silently run unverified. `makam-deploy --local` skips the check and is refused
for production.

**Rotating a key**: create a new pair, install the new public half on the host
(`install-host.sh` with `MAKAM_COSIGN_PUB_STAGING` / `MAKAM_COSIGN_PUB_PROD`),
put the new private half in the secret, and let the next `main` run re-sign.
Images signed with the old key stop being accepted, so rotate and redeploy in
the same sitting, or accept that already-deployed images are still running (a
running container is not re-checked) until the next deploy. To keep the old key
valid for a while, run `makam-verify-image` with a key file that holds both
public halves (`cosign` accepts a bundle) until every host has the new one.

## Staging deploy

**Design: pull-based, and signed.** CI (`.github/workflows/ci.yml`) runs its
checks, builds and pushes `ghcr.io/andrianm28/makam:sha-<commit>`, runs e2e and
the image scan on it, signs the digest, and only then moves `:latest`. On the
host, `makam-staging-deploy.timer` runs `makam-deploy --env staging` every 2
minutes as `ubuntu`, which has a `read:packages` ghcr login in
`~/.docker/config.json`. The script:

1. pulls `:latest` (or the `--tag` / `--digest` it was given) and **resolves it
   to a digest** — a tag is only a pointer;
2. **verifies the digest's cosign signature** with `/opt/makam-v1/staging/cosign.pub`.
   Unsigned, or signed with another key, exits **77** and nothing is touched;
3. exits if that digest is already running and healthy;
4. creates a GitHub Deployment and reports `in_progress`
   (needs `MAKAM_GITHUB_TOKEN` in `staging.env`, a fine-grained token with only
   "Deployments: write" on this repository; without it every report is a logged
   no-op);
5. runs `docker compose run --rm migrate` with the new image. **If migrate
   fails, it stops here and the old `web`/`worker` keep running**;
6. runs `up -d --wait` (web and worker restart on the verified digest) and
   writes `deployed.env` (`MAKAM_TAG`, `MAKAM_DIGEST`, `MAKAM_DEPLOY_REF`,
   `MAKAM_RELEASE`);
7. waits up to 180 s for `/api/health` to return 200 (DB ok and a fresh worker
   heartbeat) and rolls back to the previous digest if it never does.

Both units are hardened (`NoNewPrivileges`, `PrivateTmp`,
`ProtectSystem=strict`). The deploy unit can write only `/opt/makam-v1` and
reads the ghcr login from a read-only home; the health unit sees no home at
all. A new file the deploy must write outside `/opt/makam-v1` needs a
`ReadWritePaths=` line in `deploy/systemd/makam-staging-deploy.service`.

The VPS never builds images. It holds no SSH deploy key, and GitHub holds no
secret for the host. The only credentials involved are the host's read-only ghcr
token and, optionally, the Deployments token. A new commit on `main` is live on
staging about 2 minutes after CI signs the image.

```bash
# What happened
tail -n 30 /opt/makam-v1/staging/deploy.log
journalctl -u makam-staging-deploy.service -n 50 --no-pager
cat /opt/makam-v1/staging/deployed.env

# Deploy now instead of waiting for the timer
/opt/makam-v1/bin/makam-deploy --env staging

# Why was a digest refused? (77 = unsigned or wrong key, 78 = no cosign key here)
/opt/makam-v1/bin/makam-verify-image --env staging \
  --image ghcr.io/andrianm28/makam --digest "$(sed -n 's/^MAKAM_DIGEST=//p' /opt/makam-v1/staging/deployed.env)"

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

## Reading a deploy in GitHub

Every deploy is a **GitHub Deployment** on the commit, with an `in_progress`,
`success` or `failure` status whose description says what happened and whose
link goes back to the run. So:

- the commit page shows a deployment badge per environment;
- **Deployments** in the repository sidebar lists them newest first, with the
  digest in the payload;
- the migration upgrade test reads those deployments to find out what production
  and staging are really running.

The same facts are on the host in `deploy.log` (one line per step) and
`deployed.env` (what is running). `deploy.log` is the ground truth when GitHub
was unreachable: reporting is best effort and never blocks a deploy.

## The staging smoke gate

`.github/workflows/staging-smoke.yml` runs `e2e/smoke.spec.ts` (health, home,
Masuk) from a hosted runner against the real `https://dev.makam.co.id` every 15
minutes, and on demand. It runs for **the digest staging is actually running**
and records the result as a status on that digest's staging deployment, naming
the digest in the description. Promotion refuses any digest without a passed
smoke test, so after a rollback or a fresh deploy you can either wait 15 minutes
or start the workflow by hand.

## Promoting to production

`.github/workflows/promote.yml` ("Promosikan ke produksi"), owner only, manual
only. It refuses, in this order, unless all of it holds:

1. `github.actor` is the repository owner;
2. the release tag input is the exact tag it expects (`vYYYY.MM.DD-N`, WIB),
   typed again — a mistyped promotion is the one mistake with no undo;
3. the newest staging deployment that names a digest has a `success` status
   (staging is healthy);
4. that digest has a **passed smoke test** recorded against it.

Then it signs the digest with the **production** key and creates the release tag
with generated notes. Only a production-signed digest is acceptable to the
production host; a staging-signed one is refused there, which is the whole point
of two keys.

```bash
# What is running where
gh api 'repos/andrianm28/makam/deployments?environment=production&per_page=1' \
  --jq '.[0] | {ref, digest: .payload.image_digest, statuses: [.statuses_url]}'
gh release list
```

The production host deploys on its own timer or by hand
(`makam-deploy --env prod`), following the digest `:latest` names, and only if
the production key signed it.

### Rolling back

`.github/workflows/rollback.yml`, owner only: give it an earlier release tag and
a reason. It finds the digest that release went out as, re-signs it with the
production key, and records the rollback as a production deployment. It creates
**no** new release: the release list stays the history of what went out.

By hand, the same thing without the workflow:

```bash
# What is running now, and what was before it
grep -E 'MAKAM_TAG|MAKAM_DIGEST|PREVIOUS_TAG' /opt/makam-v1/prod/deployed.env
sudo systemctl stop makam-staging-deploy.timer   # not needed for prod
/opt/makam-v1/bin/makam-deploy --env prod --digest sha256:<the earlier digest>
```

A staging rollback is the same with `--env staging --tag sha-<commit>`; stop the
staging timer first, or it re-follows `:latest` within 2 minutes. Note that
`latest` is not what runs after a by-hand rollback, which is why the migration
upgrade test reads the deployed digest rather than the tag.

### Production safety

`makam-deploy --env prod` adds, in order:

- a `pg_dump` snapshot to `/opt/makam-v1/prod/backups/db/` **before** `migrate`
  (seven newest kept, mode 0600; a dump taken after the migration would be
  worthless). Restoring one is a separate, manual decision — see
  "Forward-only migrations" below;
- a failed `migrate` restarts nothing;
- a failed `up` or `/api/health` **rolls back automatically** to the previous
  digest and exits 2. Migrations are never rolled back: rolling the image back
  only works while the previous image tolerates the new schema.

### Forward-only migrations

Migrations are forward-only: nothing ever runs a "down" migration, and rolling
the code back does not undo one. So **every migration must be
backward-compatible for one release**: the previous image must still run
against the new schema (expand, then contract in a later release; never
rename or drop a column the running code still reads in the same release).

If `migrate` succeeds but `up` (or the health check) then fails, the database
is already on the new schema. `makam-deploy` then rolls the **image** back to the
previous digest by itself (and says so in `deploy.log` and in the GitHub
Deployment status), because that is the safe state. That works only because the
previous image tolerates the new schema; its own `migrate` step is a no-op,
since those migrations are already applied. Afterwards, either:

- **roll forward**: fix `main` and let the next image deploy, or
- **stay on the rolled-back image** and decide about the schema separately.

Never restore a database backup to undo a migration on a live environment
without a separate decision: it loses every write since the backup, and
`makam-deploy` never does it on its own.

## File storage (the private FileStore) and its backup

Ticket 60 (ADR 0002, beta UAT amendment): v1's FileStore (KTP checks,
heirship documents, IPTM scans, photo proof, transfer proofs, agreement
scans) lives on the host's own disk for the beta, not AWS S3 (planned for
v2). It is a private, makam-only Docker volume (`makam-<env>_files`), mounted
into `web` and `worker` at `/data/files` only — never into nginx, never a
bind mount, never served as a static file. The only way a file leaves the
volume is a short-lived signed URL through the app itself
(`/api/files/[...key]`, `src/app/api/files/[...key]/route.ts`), which
re-derives the HMAC-SHA256 signature `DiskFileStore.signedUrl` made
(`src/adapters/live/disk-file-store.ts`) with the same `AUTH_SECRET` and
refuses anything it does not match: a copied, altered or expired link 404s
exactly like one for a file that never existed.

**Backup**: `makam-<env>-files-backup.timer` runs `makam-backup-files --env
<env>` nightly at 03:15 WIB. It reads the volume through a throwaway
container (`docker run --rm -v makam-<env>_files:/data:ro …`, read-only, so
the backup itself cannot touch what it is backing up) and writes
`/opt/makam-v1/<env>/backups/files/files-<UTC timestamp>.tar.gz`, then
deletes its own tar files older than 7 days. This is the files half of the
beta's nightly-backup plan (ticket 64 rescoped for the beta: a nightly
encrypted `pg_dump` kept 7 days, the same window); the two run as separate
units so losing one backup never touches the other.

```bash
# What's backed up, and when
ls -la /opt/makam-v1/staging/backups/files/
journalctl -t makam-files-backup -n 20 --no-pager
systemctl list-timers 'makam-*-files-backup.timer'

# Back up now instead of waiting for the timer
/opt/makam-v1/bin/makam-backup-files --env staging

# Restore: stop the app, empty the volume, untar into it, start the app again
sudo systemctl stop makam-staging-deploy.timer
docker compose -p makam-staging -f /opt/makam-v1/staging/compose.yml --env-file /opt/makam-v1/staging/staging.env --env-file /opt/makam-v1/staging/deployed.env stop web worker
docker run --rm -v makam-staging_files:/data -v /opt/makam-v1/staging/backups/files:/backup alpine:3.22.1 \
  sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar -C /data -xzf /backup/files-<timestamp>.tar.gz'
docker compose -p makam-staging -f /opt/makam-v1/staging/compose.yml --env-file /opt/makam-v1/staging/staging.env --env-file /opt/makam-v1/staging/deployed.env start web worker
sudo systemctl start makam-staging-deploy.timer
```

The beta holds no real personal or payment data (dummy content, SumoPod
sandbox, ticket 86's read-only catalog import), so losing the host loses the
beta's data — an accepted risk for the beta only (ADR 0002).

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

- Browser errors: put the public DSN
  (`/opt/makam-v1/glitchtip/dsn-makam-staging-public.txt`) in the **env file on
  the host** as `NEXT_PUBLIC_SENTRY_DSN`, next to `SENTRY_DSN` (server side).
  The DSN is public by design. It is a **runtime** value: the server reads it and
  serves it to the browser in the page, so one image serves staging and
  production and each reports to its own GlitchTip. It is deliberately **not** a
  build argument any more, so the same digest can go to either environment
  without a rebuild. Browser events also carry their environment from the
  page's host at runtime (`dev.makam.co.id` → `staging`, `makam.co.id`/`www` →
  `production`, anything else → `development`; `browserSentryEnvironment` in
  `src/lib/env.ts`). Filter by environment in GlitchTip. The `@smoke` spec
  checks the value really arrives in the page.
- **Not yet**: uploading browser source maps per image, and creating a GlitchTip
  release per deploy. Both need a GlitchTip **auth token** as a GitHub secret,
  and source maps also need `SENTRY_ORG` / `SENTRY_PROJECT` and a release at
  build time in `next.config.ts`, which is a build-time decision rather than a
  runtime one. Until they exist `next.config.ts` deliberately carries no auth
  token, and GlitchTip shows minified JavaScript with no source map.
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

## Test payment (SumoPod sandbox, webhook resend runbook)

The live PaymentProvider (ticket 61) has no status-lookup endpoint in
SumoPod's public API: the webhook is the only source of truth, and **SumoPod
does not retry a failed delivery automatically** (its guide promises none; a
failed webhook sits in the dashboard's Webhooks tab with a Resend button).
There is no `payment-check` CLI: verify the sandbox wiring end to end from
the dashboard against the running app.

1. In the SumoPod dashboard, switch to **sandbox mode** for the v1 project
   (staging always runs sandbox; ticket 61) and confirm the webhook URL is
   `https://dev.makam.co.id/api/webhooks/pembayaran` (the route the app
   actually serves; ticket 04's checklist names `/api/webhooks/sumopod`,
   which this build does not use — register the real path instead) with its
   Svix secret stored as `SUMOPOD_WEBHOOK_SECRET` above.
2. Click Bayar on a real (`seed-tagihan`-issued) Tagihan on staging to create
   a sandbox payment, then use the dashboard's "Simulate Payment" on that
   payment (or the hosted checkout link itself, choosing QRIS and waiting a
   moment before simulating, per the dashboard's own guidance).
3. Confirm the Tagihan shows Lunas with its Bukti Pembayaran, and record here
   the date this was last verified.
4. Use "Save & Test" in the webhook Settings to send a `payment.test` ping;
   confirm the dashboard shows it delivered (2xx) and that nothing appears in
   `pembayaran_perlu_ditinjau` for it.
5. **If a webhook shows failed in the dashboard** (the app was down, or took
   longer than SumoPod's 10 s budget): open it in the Webhooks tab and click
   **Resend** — there is no other way to redeliver it. Redelivery reuses the
   same `svix-id`, so a payment already processed is a safe no-op
   (`sudah_diproses`); check `payment_webhook_event` (by `provider_payment_id`)
   or the Tagihan's status first if in doubt.
6. Rotating `SUMOPOD_WEBHOOK_SECRET`: SumoPod sends both the old and new
   signature for about 24 h after a roll, so update the env var and restart
   `web` (and `worker`, though it does not verify webhooks) any time in that
   window — a delivery in flight during the restart itself is unaffected
   either way, and one that failed before the roll still resends with
   whichever secret is current.

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
`VAPID_SUBJECT`, `SENTRY_DSN` from `dsn-makam-prod-internal.txt`, the public
`NEXT_PUBLIC_SENTRY_DSN` from `dsn-makam-prod-public.txt` (a runtime value, see
"Browser errors" above), and the SumoPod SMTP settings (`SMTP_USER`,
`SMTP_PASSWORD`, `EMAIL_FROM`; required, see the `staging.env` table). Also
`MAKAM_GITHUB_TOKEN`: a fine-grained token whose only permission is "Deployments:
write" on this repository, so production deploys show up in GitHub. Without it
they still deploy, just invisibly.

Copy the compose file to `/opt/makam-v1/prod/compose.yml`, install the
production cosign public key (`/opt/makam-v1/prod/cosign.pub`, see "Signing
keys"), and enable a `makam-prod-deploy.timer` only when you want production to
follow `:latest` on its own. Until then, deploy an exact digest by hand after a
promotion:

```bash
makam-deploy --env prod --digest sha256:<digest from the promotion>
```

That digest is the one "Promosikan ke produksi" signed with the production
key; a staging-signed digest is refused (exit 77). Seed the first Admin Platform
with `seed:admin` (above, with `-p makam-prod` and `prod.env`). Then do the
gated nginx switch.

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
