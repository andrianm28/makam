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
| `/opt/makam-v1/bin/makam-diskcheck` | the 85 % root-disk warning, run by the health timer (from `deploy/bin/`) |
| `/opt/makam-v1/bin/makam-prune-images` | keeps at most 3 `ghcr.io/andrianm28/makam` versions per environment (from `deploy/bin/`) |
| `/opt/makam-v1/bin/makam-glitchtip-release` | creates the GlitchTip release for the deployed commit (from `deploy/bin/`) |
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
| `/etc/systemd/system/makam-staging-{deploy,health,files-backup,db-backup,restore-test}.{service,timer}` | from `deploy/systemd/` |
| `/etc/nginx/snippets/makam-staging-proxy.conf` | proxy lines for dev.makam.co.id (from `deploy/nginx/`) |
| `/opt/makam-v1/<env>/backups/files/files-<UTC timestamp>.tar.gz` | nightly FileStore tar, kept 7 days (`makam-backup-files`) |
| `/opt/makam-v1/<env>/backups/db/makam-<UTC timestamp>.dump.enc` | nightly encrypted `pg_dump`, kept 7 days (`makam-backup-db`) |
| `/opt/makam-v1/<env>/backups/db/makam-<UTC timestamp>.counts.enc` | the row counts of that night, what a restore is checked against |
| `/opt/makam-v1/<env>/backup-passphrase` | 0600, `openssl rand -base64 32`; encrypts the database Dump. **Keep an offline copy** (below) |

After changing any file under `deploy/` or `docker-compose.prod.yml` on
`main`, run `deploy/install-host.sh` from an up-to-date, clean checkout of
`main` (it refuses any other branch or a dirty tree; `--allow-branch` is for
testing only). It copies the compose files, scripts, units and the nginx proxy
snippet, runs `nginx -t`, and never touches env files, nginx sites, or reloads
nginx.

**Run it as `ubuntu`, not with `sudo`.** The script escalates itself only for
the writes that need root (`/etc/nginx/snippets/`, `/etc/systemd/system/` and
the `systemctl` calls), and everything under `/opt/makam-v1` has to end up owned
by `ubuntu`, because the deploy units run as `User=ubuntu` and `makam-deploy`
refuses without a readable `compose.yml`. Nothing in the script writes under
`$ROOT` with sudo, the cosign public keys included.

A `sudo` run instead leaves `$ROOT` root-owned, which a later run as `ubuntu`
cannot write to and the units cannot read. **The script now refuses that run**
before it installs anything (`refusing: this script must not run as root`), and
also refuses a `$ROOT` that exists but is not writable by you — the same
failure, one run late. It refuses rather than repairs on purpose: `sudo chown -R
ubuntu:ubuntu /opt/makam-v1` is the owner's call, and it is the remedy it names
in the message. That chown does **not** repair `.git/index`, which a root run
also breaks and which it does not target.

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
| `NEXT_PUBLIC_SENTRY_DSN` | the public DSN of `/opt/makam-v1/glitchtip/dsn-makam-staging-public.txt` | browser errors; a runtime value the browser fetches from `/api/browser-config`, never a build argument |
| `MAKAM_GITHUB_TOKEN` | fine-grained token, "Deployments: write" only | the GitHub Deployment statuses of a deploy |
| `MAKAM_GLITCHTIP_TOKEN` | GlitchTip auth token, `project:releases` write | the per-deploy GlitchTip release; without it the release is a logged no-op |
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

## Importing the old app's cemetery catalog (`import:katalog-lama`)

ADR 0002's beta UAT amendment says the beta's cemetery catalog comes from the
old app rather than from dummy content, and never its people.
`import:katalog-lama` brings a catalog across: Lokasi Mitra with their profile,
facilities and pin, their Jenis Makam, and their tariffs. It takes any catalog
export in the format below, so it does not care which catalog that is — but
know that **the old app's own catalog is entirely example data** (research
2026-09-27, §1.5, and the "Data contoh" line of its own report), so where the
beta's real Lokasi come from is the owner's decision, not this tool's. It is
**development and test only** — it refuses on staging and on production, is not
in the runtime image, and never opens the old app's database: a
`KATALOG_LAMA_DATABASE_URL` in the environment is refused, not used, so no
credential for `makam_beta` is ever needed or stored.

### 1. The owner exports the catalog, read-only

The old app's owner runs **one** query on the old app's database and hands over
the file. Name the catalog columns one by one — never `select *`, which is how
a personal column would get into the file. The query below is written against
the old app's real schema (`cemeteries`, `cemetery_packages`, `launch_cities`;
research 2026-09-27, `.scratch/makam-v1-build/research/old-app-catalog-and-cutover-data.md`),
with three deliberate choices, and one rule over all of them: **a field that
states a fact is only ever a source column, never a constant.** A dash in
`pengelola` or a fixed pair of facilities would be a fact nobody claimed, read
by a family on a cemetery's page.

- `city` in the old app is a **code** (`launch_cities.code`), while v1's `city`
  is the text a person reads, so the label is joined in (and the raw code stands
  in when no city row matches, which is a fact too);
- `operator_name` is nullable there and v1's `pengelolaName` is not: a null
  stays null and the import **refuses** that Lokasi (`pengelola_kosong`) rather
  than inventing a name for it;
- `facilities` is a json array of free-text labels and v1's is a closed list, so
  the query exports the labels verbatim and **the import** maps the ones it
  recognises ("Area parkir" → `parkir`) and reports every other one by name,
  rather than the owner hand-editing SQL.
- `cemeteries.price_min` / `price_max` (the only price the old app has) and
  `cemetery_packages.price_min` / `price_max` are exported as
  `hargaIndikatif`: a clearly labelled range with its source, reported as a
  question for the owner and **never** entered as a Tarif.

```bash
# On the old app's own machine, with its own database credentials. Writes nothing.
psql "$KATALOG_LAMA_URL_LAMA" -v ON_ERROR_STOP=1 -At > katalog-lama.json <<'SQL'
select jsonb_pretty(jsonb_build_object(
  'format', 'makam.katalog-lama/v1',
  'dieksporPada', current_date,
  'lokasi', (
    select coalesce(jsonb_agg(baris), '[]'::jsonb) from (
      select jsonb_build_object(
        'kode', c.slug,                          -- the source's own code: the import is idempotent on it
        'nama', c.name,
        -- Null stays null: v1 needs someone who runs the cemetery, and a placeholder
        -- there would be a name a family reads. The import refuses a Lokasi with none.
        'pengelola', c.operator_name,
        'alamat', c.address,
        'kota', coalesce(kota.label, c.city),    -- the source stores a code; the label is its text
        'titik', case when c.latitude is null or c.longitude is null then null
                      else jsonb_build_object('lat', c.latitude::float8, 'lng', c.longitude::float8) end,
        'googleMapsUrl', c.google_maps_url,      -- a pin is read from this when there is no lat/lng
        -- The source's own labels, verbatim: they are free text there, so the import maps
        -- the ones it recognises and reports the rest rather than guessing a facility.
        'fasilitas', c.facilities,
        'catatanFasilitas', '',                  -- the source keeps no note; an empty note claims nothing
        'statusTerbit', c.publication_status,    -- draft | published | unpublished
        -- What the source estimates a grave here costs: a range, never a price anything
        -- is charged at. The import reports it and asks; it never becomes a Tarif.
        'hargaIndikatif', case when c.price_min is null and c.price_max is null then null
                             else jsonb_build_object('min', c.price_min::bigint, 'max', c.price_max::bigint,
                                                     'sumber', c.price_source,
                                                     'berlakuMulai', c.price_effective_at::date) end,
        'biayaPemakaman', null,                  -- the source has no per-cemetery burial fee
        'jenisMakam', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'kode', p.id::text,
                   'nama', p.name,
                   'deskripsi', coalesce(p.description, ''),
                   -- An indicative range is NOT a Harga Hak Pakai: no term, never charged at.
                   'hargaIndikatif', case when p.price_min is null and p.price_max is null then null
                                         else jsonb_build_object('min', p.price_min::bigint, 'max', p.price_max::bigint,
                                                                 'sumber', p.price_source,
                                                                 'berlakuMulai', p.price_effective_at::date) end,
                   'hargaHakPakai', null, 'masaHak', null, 'hargaPerpanjangan', null)
                 order by p.sort_order)
          from cemetery_packages p
          where p.cemetery_id = c.id and p.is_active)
        , '[]'::jsonb)
      ) as baris
      from cemeteries c
      left join launch_cities kota on kota.code = c.city
      order by c.slug
    ) as lokasi
  )
));
SQL
```

A price is whole rupiah (`3500000`, never `"3.500.000"` or `3500000.50`); a
tenure is `{"jenis":"selamanya"}` or `{"jenis":"tahun","tahun":10}`; a fixed
term needs its `hargaPerpanjangan`; `hargaIndikatif` is a range, never a price.
Free text may not carry a phone number, an email or a pasted document: the
import refuses the whole export and names the field (`nilai_pii_dilarang`).
`src/cli/katalog-lama/fixtures/katalog-lama-contoh.json` is a complete example
of the format (synthetic names), and a field the format has no place for is
refused rather than imported silently.

A test holds this query to that contract
(`tests/tooling/katalog-lama-runbook.test.ts`): every field the contract has,
the query exports, and a fact field may not be a constant — so the two cannot
drift apart, and a hand-written `"["parkir","musala"]"` fails the build.

### 2. Dry run, then write

```bash
# Development, test, or staging with the named allowance. A dry run unless --tulis.
npm run import:katalog-lama -- --sumber ~/katalog-lama.json
# [import-katalog-lama] Mode dry-run: tidak ada yang ditulis.
# Lokasi: 3 dibaca, 3 akan diimpor, 1 ditolak.
# Di luar cap QRIS Rp 10.000.000, tetap diimpor tapi tidak ditampilkan (1):
#   - TPU-BT-01-DLX: Rp 12.750.000
# Data contoh di aplikasi lama (2 Lokasi): TPU-BT-01 (alamat diawali "Jl. Contoh") ...
# Ditolak (1):
#   - TPU-CMG-03-PKG [jenis_makam]: harga_belum_dapat_dimasukkan (hanya rentang indikatif ...)
# Pertanyaan untuk owner (3): ...
# Gunakan --tulis untuk menulisnya ke v1.

npm run import:katalog-lama -- --sumber ~/katalog-lama.json --tulis
# [import-katalog-lama] Ditulis: 3 Lokasi Mitra dan 4 Jenis Makam.

# On the beta's own environment (staging): the allowance is named, refused by
# default, and every write it makes says so in the Entri Audit reason.
npm run import:katalog-lama -- --sumber ~/katalog-lama.json --tulis --izinkan-staging
# Ditolak: di staging perlu allowance --izinkan-staging (ditolak secara bawaan).  # without it
# Ditolak: import-katalog-lama tidak pernah jalan di production.                 # production, always
```

Against a worktree's local stack, `npm run stack -- up --build -d` first, then
the same commands with `DATABASE_URL` pointing at that stack (or inside it,
`docker compose exec -T web npx tsx src/cli/import-katalog-lama.ts …`). A
`seed:admin` must have run on the stack first: the import acts as that first
Admin Platform, past TOTP, and every write it makes is audited under that Akun.
Which Entri Audit entries that is, exactly:

- `lokasi.buat` and `lokasi.ubah_profil` (creating the Lokasi Mitra and its
  profile) take **no reason** — the Lokasi module's own signature has none, so
  those two entries are the import only by their actor and their subject;
- `lokasi.tandai_data_contoh` (the example-data mark, see below) takes the
  import's reason plus what the source said;
- `tarif.buat_jenis_makam` and `tarif.ubah_biaya_pemakaman` take the import's
  reason;
- `katalog_lama.impor` binds the source's code to the v1 id, on the Lokasi
  Mitra, with the same reason.

On staging the reason is `impor katalog aplikasi lama (staging,
--izinkan-staging)`, so the Audit Log of every row an import created on the
beta's own environment says so.

### 3. What the report is saying

- **Data contoh di aplikasi lama** — rows the source itself froze as example
  data: an address starting `Jl. Contoh`, a name ending `(pemakaman contoh)`
  (the markers the old app's seeder writes and its `PurgeExampleData` command
  asserts; research 2026-09-27, §1.3). Every row in the old `makam_beta`
  catalog is one of them, so read this line before showing the beta to a
  tester: a fabricated address is not a cemetery. The import does not leave that
  as a report line: it puts `data_contoh` on the Lokasi Mitra record itself, and
  the Lokasi module then **refuses to publish it and leaves it out of every
  public read** (`publish()` answers `data_contoh_tidak_bisa_diterbitkan`, and
  the directory, the city filter and the public page skip it whatever its status
  says). Every imported row is marked, not only the marked ones: an import
  verifies nothing, so nothing it creates is ready to be listed. An operator who
  has verified a row by hand clears the mark through
  `lokasi.tandaiDataContoh(..., { dataContoh: false, reason })`, which is audited
  with that reason.
- **Ditolak** — a row that cannot come across, with the reason: a code used
  twice, two Jenis Makam with one name in a Lokasi, a price the old app only
  estimated (`harga_belum_dapat_dimasukkan`: an indicative range with no term,
  never charged at), a fixed term with no Perpanjangan price, a price the old
  app had already put in force (v1 never rewrites a price that was already in
  force), or a refusal from the Lokasi or Tariffs module while writing. Nothing
  else was written for that row.
- **Pertanyaan untuk owner** — read-only questions, never acted on: a Lokasi
  the source names nobody to run, a facility label that is not on v1's list, the
  publication status of a Lokasi the source had not published, an indicative
  price range (per Jenis Makam, or for the cemetery as a whole), a price already
  in force, a Lokasi it had no price for.
- **Ditolak `pengelola_kosong`** — the source names nobody to run that cemetery,
  and v1 will not invent a name for a field a person reads. Fill `pengelola` in
  the export and run it again; nothing else is written for that row.
- **Di luar cap QRIS** — a Jenis Makam whose all-in total (Harga Hak Pakai plus
  the Lokasi's Biaya Pemakaman) passes Rp 10.000.000. It is imported and kept;
  the public pricing leaves it out, so no order can be taken for it (spec,
  decision 2026-09-26).
- **All imported Lokasi Mitra stay Belum Tayang.** Publishing one needs a
  Kunjungan Verifikasi, an agreement, a Jam Operasional and "tarif diperiksa",
  none of which the old app has: listing them is the owner's decision, not the
  import's.

### 4. Running it again, and an import that was cut short

The import is idempotent on the old app's own code, kept in
`katalog_lama_lokasi` and `katalog_lama_jenis_makam`: a second run over the same
file reports "Sudah ada, dilewati" and writes nothing. A code that is claimed
but not bound — an import killed between the claim and the Lokasi Mitra being
created — is reported as "tertinggal diklaim", and is never created twice on
the next run. Before retrying one, look at

```sql
select kode, lokasi_id, diklaim_pada, diimpor_pada from katalog_lama_lokasi where lokasi_id is null;
select id, name, created_at from lokasi_mitra where name = '<nama dari ekspor>';
```

A claim with no `lokasi_id` and no Lokasi Mitra behind it is a claim nothing
was built on: deleting that one row (by hand, on a development or test
database only) is what lets the import create it. The bind and its Entri Audit
are one transaction, so a bound row always has its entry and an unbound row never
does — there is no state where a code is bound with nothing in the Audit Log
about it. If a Lokasi Mitra does exist under that name, it was created and only
the bind was lost: keep both rows and say so in the ticket, since a second
Lokasi Mitra with the same name is the one outcome an import must never have.
Never delete a bound row: the beta loses the trace of where that Lokasi came
from.

The old app's stack and its data are never modified by any of this: the only
contact is that one read-only query its owner runs.

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
                                                                                      └→ sourcemaps
```

Every job except `deploy-gate`, `sign` and `sourcemaps` also runs on pull
requests, except that there `image` builds without pushing and e2e, scan and
`sourcemaps` are skipped. The one "main only" rule is the `image` job's `release`
output. A warm `main` run takes about 11 to 12 minutes.

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
  from the newest GitHub Deployment **that succeeded** and names a digest
  (`scripts/migrations/deployed-release.ts`), because a deploy follows signed
  digests and production lags staging. The newest deployment of an environment
  is often a refused or rolled-back attempt, and that image is not what anything
  is running, so it is skipped in favour of the one before it. A host that has
  never deployed has no baseline, which is not an error: the upgrade then starts
  from an empty database. That release migrates the database with its own
  `migrate`, the `seed-representative` script fills **every** table with a few
  rows (the run fails if any table stays empty: an empty table would hide
  exactly the breakage this test exists to catch), then this commit's migrations
  run on it (Vitest's global setup) and the domain tests run on the result.
  A value the catalog cannot imply — a CHECK that ties two columns together, or
  one that lists the values a `text` column may hold — is stated in `OVERRIDES`
  in that script, beside the constraint it answers; a new table carrying such a
  CHECK leaves the run failing until it is stated there too.
  Before that, every
  migration file the running release does not have is checked for destructive
  DDL (DROP, TRUNCATE, RENAME, SET NOT NULL, a type change, a NOT NULL column
  without a default, a new UNIQUE/FOREIGN KEY/CHECK constraint on a table that
  existed before): each such statement needs a comment line
  `-- contract: <why nothing running needs it>` on the line(s) **directly** above
  it, and belongs in a later release than its expand step. A constraint on a
  table the same migration creates is expand, and passes without a marker.
  Node and `npm ci` come first in that job: the baseline is read with this
  repository's own script (`npx --no-install tsx`), never with a tsx fetched from
  the registry while it is choosing the image to upgrade from.
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
  host resolves it to a digest and refuses anything the key did not sign. The
  signing itself is `.github/actions/cosign-sign`, pinned by digest, shared with
  the promotion and the rollback.
- **sourcemaps** sends this image's browser source maps to GlitchTip (see
  "Source maps and releases" below). `deploy-gate` does not need it: missing
  source maps cost readable stack traces, not a deploy.
- **Accepting a finding** that cannot be fixed yet: add it to `.trivyignore`
  with the reason in a comment directly above and `exp:YYYY-MM-DD` at most 90
  days out (`tests/trivyignore.test.ts` enforces both), in a reviewed PR.
- **Pins**: every action is pinned by commit SHA (version in a comment), every
  image by digest (CI's Postgres, Trivy, gitleaks, the node base image, the
  compose files). Dependabot proposes updates weekly. Two images are used only
  inside a workflow, which Dependabot cannot see, so they are pinned there and
  bumped by hand: `getsentry/sentry-cli` (the `sourcemaps` job) and
  `sigstore/cosign` (the `cosign-sign` action).
- Every job has least-privilege `permissions` and `timeout-minutes`.
- Re-run a flaky e2e with "Re-run failed jobs"; it uses the same image.
- **Concurrency**: GitHub keeps one *pending* run per group, so a new push
  cancels the pending one and a run in the middle is skipped. Off main nothing
  was deployed, so that costs nothing. On main, `deploy-gate` and `sign` are in
  groups of their own with `cancel-in-progress: false`: a cancelled run would
  cancel all its jobs, and a half-signed image is worse than a slow one.
- **Shared steps**: the ghcr login is `.github/actions/ghcr-login`, the Chromium
  for the PdfRenderer test is `.github/actions/chromium`, and signing an image is
  `.github/actions/cosign-sign` (ci.yml, promote.yml and rollback.yml all pass
  their own key pair, so the image is pinned by digest in one place and a run
  without a private key refuses rather than passing an unsigned digest on). The
  image name always comes from `GITHUB_REPOSITORY`, never from a literal.

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
install -m 0644 /tmp/cosign.pub /opt/makam-v1/prod/cosign.pub   # production
```

**No `sudo` on either line.** The deploy units read these files as `User=ubuntu`
out of a tree that is ubuntu's, and a public key is world-readable anyway, so
root buys nothing and risks the exit 78 described above. If a key sits somewhere
only root can read, copy it somewhere this user can read first.

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
   heartbeat) and rolls back to the previous digest if it never does;
8. creates the **GlitchTip release** for the commit that is now running (needs
   `MAKAM_GLITCHTIP_TOKEN` in `staging.env`; see "Source maps and releases").
   Best effort: no token or GlitchTip down is a logged no-op;
9. bounds the makam images on this host with `makam-prune-images` ("Images on the
   host and the disk"). Best effort in the same way: a host that is not in a
   state where removing an image is safe is a warning in `deploy.log`, never a
   failed deploy.

Exit codes, so a timer or a monitor can tell one failure from another:

| Code | Meaning |
| ---- | ------- |
| 0 | deployed and healthy, or already on that digest |
| 1 | pull, snapshot, migrate or `up` failed, or the health check never came back **and the roll back worked** |
| 2 | the roll back failed as well (or there was nothing to roll back to): the new, unhealthy image is what is still running |
| 64 | usage |
| 77 | unsigned, or signed with another key: nothing was touched |
| 78 | this host is not set up for a deploy (no env file, no compose file, no cosign key) |

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
  digest and exits **1**; exit **2** is the case where that roll back failed as
  well, so the new image is what is left running. Migrations are never rolled
  back: rolling the image back only works while the previous image tolerates the
  new schema.

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

## Images on the host and the disk

**This host is shared.** Other projects have their own images, containers,
volumes and worktrees here, and makam never touches them. There is no global
cleanup in this repository, and none is ever allowed: `docker system prune`,
`docker image prune`, `docker volume prune`, `docker network prune`,
`docker builder prune`, `docker container prune` and every `-a` / `--all` form
of them would reach another project's objects. What is checked, exactly:
`tests/tooling/image-retention.test.ts` fails the build if one appears in **any
file git tracks**, whatever its name, its suffix or its mode — so the
extension-less `deploy/bin/*`, the `Dockerfile` and the systemd units are all in
it, and so is anything added later. Only documentation (`.md`, `.txt`) and lock
files are skipped, because prose that names a prune runs nothing. The rule is
`tests/support/global-prune.ts`, tested by `tests/support/global-prune.test.ts`;
the one file the sweep does not judge is that test's own, whose fixtures are the
commands it refuses, and two tests say so.

### What fills the disk

One image per merge to `main`: GitHub does not keep images of a private
repository on the Free plan, so every `sha-<commit>` version CI pushes is a
version the host pulls and keeps. A deploy only needs the last few.

### `makam-prune-images` (on the host, every deploy)

`makam-deploy` calls it as its last step (step 8 in that script's own header,
once the new release is healthy). It untags
`ghcr.io/andrianm28/makam:sha-<40 hex>` versions and nothing else:

- the repository comes from the environment's env file (`MAKAM_IMAGE`) and must
  equal `ghcr.io/andrianm28/makam`; a `docker image ls` filtered to that one
  repository and that one tag shape is the entire candidate list, so no other
  project's image can even be named;
- **kept, always**: the running version and the previous one of **every**
  environment (`deployed.env` and `deploy.log`), because a roll back must stay
  possible after the next deploy; then up to `MAKAM_KEEP_IMAGES` (3) per
  environment. Staging and production can be on different digests, so the host
  holds the union of the two sets: at most 3 each;
- **kept, always**: whatever a running container on this host holds, whoever
  runs it. Compared by image **id**, and both sides are reduced to docker's
  12-character short id first, because `docker inspect {{.Image}}` answers
  `sha256:<64 hex>` while `docker image ls {{.ID}}` answers the short form. An
  answer that is not an id at all — `sha256:` with no hex, an upper-case digest —
  is **refused**, not read as "nothing is running";
- **kept**: a version whose own id in the listing is not a usable id. Not
  knowing it is free is not knowing it is free; that one is reported and kept
  rather than refused, because it is about that version alone;
- **refused (exit 78), nothing removed**, when the Docker daemon is unreachable,
  when the inventory cannot be read, when an env file names another image, or
  when an environment's `deployed.env` does not say which version it runs. A
  `PREVIOUS_TAG` that is not a version is reported as a `WARNING` and treated as
  absent: unlike `MAKAM_TAG` it does not say what is *running*.

Exit codes: **0** the retention set is what is on the host now (or this was a
dry run), **1** a version outside it could not be untagged so the space is not
free, **78** nothing was removed because the host is not in a state where
removing an image is safe.

**Why keeping the previous version is enough, and what would break it.** Every
roll back path re-pulls by digest — `makam-deploy --env prod --digest
sha256:…`, and `.github/workflows/rollback.yml` re-signs and re-resolves that
digest *in ghcr* — so a host that lost a tag can still be rolled back; keeping
the previous version only means the roll back needs no round trip to ghcr. **If a
future change made a roll back depend on the local tag being present, this
retention set would be the thing that silently breaks.**

```bash
# 1. What would go. Read this first; it removes nothing.
sudo -u ubuntu /opt/makam-v1/bin/makam-prune-images --env staging --dry-run

# 2. Then, if the list is only ghcr.io/andrianm28/makam sha-<commit> versions:
sudo -u ubuntu /opt/makam-v1/bin/makam-prune-images --env staging

# What the last deploys kept, and what is on the host now
grep 'kept \|removed \|WARNING' /opt/makam-v1/staging/deploy.log | tail -5
docker image ls ghcr.io/andrianm28/makam --format '{{.Tag}} {{.CreatedSince}}'
```

**The first run on this host.** The 27 versions older than the retention set are
still here (about 14.7 GB as of 2026-09-27): the script was never run against a
real image, because freeing that space on a shared host is the owner's call and
not a builder's (see the ticket's Decisions). The steps, in order:

1. `deploy/install-host.sh` from a clean checkout of `main`, so
   `makam-prune-images` and `makam-diskcheck` exist under `/opt/makam-v1/bin/`
   (without them a deploy logs a `NOTE` and keeps no images bounded);
2. the `--dry-run` above, and read every line of it — it names the repository and
   the tag of everything it would untag;
3. the real run;
4. `df -h /` to see what it actually freed.

Every line the script prints (the retention set, each `removed`, each `in use,
keeping`, the `kept N of M` summary) is appended to the environment's
`deploy.log`. A non-zero exit is a `WARNING` line there and never a failed
deploy. Raise the count with `MAKAM_KEEP_IMAGES` (at least 2; a lower number is
refused so the previous version always survives).

### The monthly ghcr cleanup (in GitHub, not on the host)

`.github/workflows/image-retention.yml` runs on the 1st of every month at 04:17
UTC, and on demand with `dry_run: true`. It reads every page of both lists (one
page is 100, and one merge is one version) and deletes the versions that are
older than 30 days (`MAKAM_IMAGE_MAX_AGE_DAYS`, or the run's `max_age_days`
input) and that nothing needs:

- a version is a candidate only when **every** tag on it is a `sha-<commit>`, so a
  `v*` release tag (what a roll back names) and `latest` (what the staging timer
  follows) are never in the list, whatever their age;
- the digest **staging or production is running** is excluded explicitly, from
  the GitHub Deployments API, with the same "only a deployment that succeeded"
  rule the migration upgrade test uses;
- **fail closed**: GitHub purges old deployments, so an empty or unreadable
  deployments list is the normal state after a while. The run then names nothing
  and exits **78** — a red run, not a silent deletion on age alone, which could
  take the digest staging is running (a roll back deploys one from months ago).
  The next real deploy records a deployment again and the month after that this
  deletes as usual;
- the decision is `scripts/images/expired-versions.ts`
  (`tests/images/expired-versions.test.ts`); anything it cannot read is not a
  candidate, and the workflow deletes one version at a time by digest.

Its summary lists every version it deleted. It runs on a GitHub-hosted runner and
never touches this host.

### The 85 % warning

`makam-staging-health.timer` runs `makam-diskcheck /` every minute, after the
`/api/health` check and in the same unit. At or above
`MAKAM_DISK_WARN_PERCENT` (85) it logs one line to the journal at priority `err`
with tag `makam-disk` and exits non-zero, so the unit shows as failed:

```bash
journalctl -t makam-disk -p err --since today
journalctl -t makam-health -p err --since today      # the app's own watchdog
df -h /
```

A use that cannot be read is treated as **no space at all**, the same way the
backup scripts refuse to write when they cannot read a free-space figure. The
order inside the unit is deliberate: systemd stops a oneshot at the first failing
`ExecStart`, and the app check is the one an operator (and UptimeRobot) acts on,
so a minute in which the app is already down may go without the disk figure. One
check covers the whole host: production and every builder worktree share this
root filesystem.

### What to do when it warns

1. **Look first, act second.** `makam-prune-images --env staging --dry-run`, and
   read the list. It is safe to run at any time, dry or not.
2. **Run it for real** if the list is only `ghcr.io/andrianm28/makam` versions.
   Expect 14.7 GB the first time (2026-09-27: 29 versions, one per merge, at
   91 % full), then roughly nothing, because every deploy after this one keeps
   the set bounded.
3. **If the space is not ours** — and on this host much of it is not: other
   projects' images are the other half of `docker system df` — then **stop
   there**. Removing them is not makam's to do, and no prune in this repository
   may ever reach them. Collect the numbers and tell the owner:

   ```bash
   docker system df                      # the whole host, by name
   docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep -v andrianm28/makam
   ```

   Report: the figures above, that `makam-diskcheck` has been warning since when
   (`journalctl -t makam-disk -p err --since today`), and what is already free
   after step 2. **The owner decides what happens to another project's images**,
   and does it with that project's own tooling, in that project's own ticket.
   Do not improvise a command, and do not treat a full disk as a reason to
   override this rule: a full disk is an outage for staging and production
   (`makam-backup-db` and `makam-restore-test` already refuse to run), and one
   deleted colleague's image is not recoverable by us.
4. **Worktree leftovers** are `npm run clean` in the worktree that made them
   (AGENTS.md, "Worktrees on the shared host"), and `npm run deps -- --prune`
   for the shared store.
5. **Escalation**: the owner is the ops email in `staging.env`. If the disk is
   above 95 %, or `makam-diskcheck` has been warning for more than an hour after
   step 2, that is an incident: say so in the ticket, with the numbers, and stop
   at the boundary above.

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
beta's nightly-backup plan; the database half is "Database backup and restore"
below (ticket 64 rescoped for the beta: a nightly encrypted `pg_dump` kept 7
days, the same window); the two run as separate units so losing one backup never
touches the other.

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

## Database backup and restore

The database half of the same nightly plan (ticket 64, ADR 0002 beta UAT
amendment). The beta keeps **encrypted `pg_dump` files on the host, 7 days**;
pgBackRest to S3 with WAL archiving and PITR is v2 work, blocked by ticket 03
(AWS account). Three things therefore have to be true, and each has its own
timer:

| What | Unit | When (WIB) |
|---|---|---|
| `makam-backup-db --env staging` | `makam-staging-db-backup.timer` | nightly 02:15 |
| `makam-backup-files --env staging` | `makam-staging-files-backup.timer` | nightly 03:15 |
| `makam-restore-test --env staging` | `makam-staging-restore-test.timer` | Mondays 04:15 |

**Only the `makam-staging-*` units are installed.** The scripts also take
`--env prod` because production will run the very same ones, but there is no
`makam-prod-db-backup.timer` or `makam-prod-restore-test.timer` in
`deploy/systemd/`, and nothing enables one: those come with production (ticket
65), together with the `makam-prod` environment itself. Until then the only way
these run is staging's timers or your own hand.

A nightly backup nobody has ever restored is a hope, not a backup, so the third
one is not optional bookkeeping: it restores the newest Dump into a throwaway
Postgres and checks it against that night's row counts.

### The passphrase (one thing a human must do)

The Dump is encrypted on the client with OpenSSL (already on this host),
aes-256-cbc with PBKDF2-HMAC-SHA256 at 600 000 iterations and a per-file random
salt (OpenSSL's own default, 10 000, is a test default; 600 000 costs about a
second per file and these are read rarely). The script has no default and no
fallback: with no passphrase it refuses and writes nothing, because an
unencrypted Dump of the database is worse than no Dump. The file must hold
**one line** (`openssl enc` would silently use only the first) and must be
**mode 0600**: a passphrase any other account on this host can read is no
passphrase, so both scripts refuse and say so rather than trust a mode an
operator gets by accident.

```bash
umask 077
openssl rand -base64 32 > /opt/makam-v1/staging/backup-passphrase   # 0600
```

**Keep an offline copy of that file somewhere off this host** (Andrian holds
these, with the other secrets): every Dump of the environment is unreadable
without it, and there is no way around the encryption to get one back. Rotating
it means the Dumps taken with the old passphrase can no longer be read, so
restore what you still need, take a fresh Dump, and only then replace the file.

### What a night's Dump is

```bash
ls -la /opt/makam-v1/staging/backups/db/
journalctl -t makam-db-backup -n 20 --no-pager
systemctl list-timers 'makam-*-backup.timer' 'makam-*-restore-test.timer'

# Dump now instead of waiting for the timer
/opt/makam-v1/bin/makam-backup-db --env staging
```

Two files per night, sharing a UTC timestamp: `makam-<stamp>.dump.enc` (a
`pg_dump -Fc` of the whole `makam` database) and `makam-<stamp>.counts.enc`
(one `table=count` line per table of the public schema, the row counts of that
exact night). The counts are what a restore is checked against, so a restore
can be proved lossless without the source database. The dump is written to a
`.part` name and renamed only when complete; a trap removes the `.part` files on
every way out, and a run killed so hard the trap could not run leaves one that
the next night's pruning collects. The two scripts prune only their own files
older than 7 days: the FileStore tar, ticket 72's pre-migrate dump and anything
else in that directory are never touched.

Both scripts **fail closed on space**, each on the filesystem that will actually
hold its data: `makam-backup-db` on the one holding
`/opt/makam-v1/<env>/backups/db` (2 × the database size), `makam-restore-test`
on the one holding **Docker's data directory** (2 × the Dump size) — a restored
database lives in the container's writable layer, not under `/opt/makam-v1`. A
size or a free-space figure that cannot be read is treated as no space at all.
Every refusal exits 78, logs at `err`, and writes nothing. The host has ~20 GB
free at 76 % use; the 85 % warning is `makam-diskcheck` ("Images on the host and
the disk" below).

### The restore check

```bash
/opt/makam-v1/bin/makam-restore-test --env staging             # newest Dump
/opt/makam-v1/bin/makam-restore-test --env staging --dump /opt/makam-v1/staging/backups/db/makam-<stamp>.dump.enc
/opt/makam-v1/bin/makam-restore-test --env staging --keep      # leave the container after a failure
docker ps -a --filter label=makam.role=restore-test            # what is left over (should be empty)
```

It starts `makam-restoretest-<env>-<timestamp>-<pid>` (the pid keeps two checks
started in the same second from asking Docker for one name) from the same
Postgres image by digest that staging runs, with **no network at all**
(`--network none`, so nothing on the host can reach it), no published port, no
restart policy and
nothing of the environment mounted in — the image's own anonymous volume holds
the restored data, under Docker's directory. It restores into it, then checks
that every table of that night is there (the recorded counts, plus a fixed
floor of core tables listed once in `deploy/bin/makam-backup-lib` as
`REQUIRED_TABLES`) and that each holds at least the rows it had that night. The
container is removed whether the check passed or failed — on failure the last
20 lines of its Postgres log are printed first, and `--keep` leaves it for
inspection (`docker rm -f <name>` when done). Nothing of the running environment
is touched: the Dump is read, the live database is not.

A failed check exits 1 and logs at `err` (`journalctl -t makam-restore-test -p
err`). It means one of: the Dump is unreadable (truncated write, wrong
passphrase), the schema is not what the counts say, or rows are missing. A
`refusing` message (exit 78) means there was no Dump to restore, or no room for
one.

### Restoring by hand (the real thing)

Only for a database that is already lost, and only with a decision: restoring
loses every write since the Dump was taken. Migrations are forward-only, so the
restored database is on an **older schema** than the image that is running —
migrate forward with the current image before serving traffic again. The
Postgres 18 image keeps its data in `<volume>/18/docker`, which is why the copy
below moves the `18` directory and not the volume root.

```bash
sudo systemctl stop makam-staging-deploy.timer        # otherwise it redeploys
cd /opt/makam-v1/staging
S="docker compose -p makam-staging -f compose.yml --env-file staging.env --env-file deployed.env"
$S stop web worker                                    # keep the old data until the new one works

D=/opt/makam-v1/staging/backups/db/makam-<stamp>.dump.enc
# 1. A volume of its own, so the running one is untouched until the restore is
#    known to be good.
docker volume create makam-staging_pgdata-restore
docker run -d --name makam-manual-restore -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=makam -e POSTGRES_USER=makam \
  -v makam-staging_pgdata-restore:/var/lib/postgresql \
  postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722
until docker exec makam-manual-restore pg_isready -h 127.0.0.1 -U makam -d makam; do sleep 1; done

# 2. Decrypt straight into it. The passphrase never reaches a command line, only
#    the environment of this one openssl.
BACKUP_PASSPHRASE=$(cat /opt/makam-v1/staging/backup-passphrase) \
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in "$D" -pass env:BACKUP_PASSPHRASE \
  | docker exec -i makam-manual-restore pg_restore -U makam -d makam --no-owner --no-privileges --exit-on-error

# 3. Swap it in: the old data directory is moved aside (not deleted), the restored
#    one is copied in, and the app comes back.
docker stop makam-manual-restore && docker rm makam-manual-restore
$S stop postgres
docker run --rm -v makam-staging_pgdata-restore:/from -v makam-staging_pgdata:/to alpine:3.22.1 \
  sh -c 'mv /to/18 /to/18.old && cp -a /from/18 /to/18'
$S up -d --wait web worker
$S run --rm migrate                                   # forward-only, to the current schema
curl -s https://dev.makam.co.id/api/health | jq .ok    # true

# 4. Only now: start the deploy timer and remove what is left of the old one.
sudo systemctl start makam-staging-deploy.timer
docker volume rm makam-staging_pgdata-restore
# (later, once the app has been healthy for a while: remove /to/18.old out of
#  makam-staging_pgdata by hand. No `docker * prune` ever runs on this host.)
```

### Knowing it ran (alerting)

**The journal is what the beta has.** `makam-backup-db` and
`makam-restore-test` log every run (`makam-db-backup`, `makam-restore-test`) and
every failure at `err` priority, so a missed or failed night is:

```bash
systemctl --failed
journalctl -t makam-db-backup -t makam-restore-test -p err --since '3 days ago'
systemctl list-timers 'makam-staging-db-backup.timer' 'makam-staging-restore-test.timer'
ls -la /opt/makam-v1/staging/backups/db/     # a night older than 36 h is a problem
```

**A monitor that pings you is a separate decision, and nothing in the backup
path calls out to the network.** If you want one, create a GlitchTip **uptime
monitor of type Heartbeat** in GlitchTip (Alerts → Monitors → New → Heartbeat;
the built-in type, no account or credential beyond GlitchTip's own) and ping it
yourself — by hand, from a timer of your own, or from the deploy workflow — with
the URL GlitchTip gives you:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' 'https://glitchtip-web:8000/api/0/heartbeat/<key>/<hash>'
```

Give the nightly monitor an interval of 26 h (one ping a night; a single missed
night already alerts, and the spare hours keep a late run from firing) and a
second one with an 8-day interval for the weekly restore check. A heartbeat URL
is itself a secret — anyone holding it can mark the monitor healthy — so keep it
out of the repo, out of the journal and out of the backup scripts' environment.
The `Uptime alarm` section above is the same idea for the app itself.

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
  The DSN is public by design. It is a **runtime** value: the browser asks the
  running server for it (`GET /api/browser-config`, `no-store`) and the SDK starts
  with the answer, so one image serves staging and production and each reports to
  its own GlitchTip. It is deliberately **not** a build argument any more, so the
  same digest can go to either environment without a rebuild. It is also not
  inlined into the HTML: the home page is statically rendered, so a value read
  while building would be frozen into that HTML (and the build has no environment
  at all, so it would be empty forever). Browser events carry their environment
  from the page's host at runtime (`dev.makam.co.id` → `staging`,
  `makam.co.id`/`www` → `production`, anything else → `development`;
  `browserSentryEnvironment` in `src/lib/env.ts`). Filter by environment in
  GlitchTip. The `@smoke` spec proves the served HTML carries no DSN and that the
  browser ends up with the one the running server serves.
- **Source maps and releases**: uploading them per image and creating a release
  per deploy is set up but **has never run**, because the credentials do not
  exist yet — the exact steps are in "Source maps and releases" below. Until
  they do, GlitchTip shows minified JavaScript with no source map.
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

## Source maps and releases (GlitchTip)

Two separate things, both named after the commit:

- **Per image**, `ci.yml`'s `sourcemaps` job uploads the browser source maps of
  the image it just pushed, with `sentry-cli sourcemaps upload`. The build
  (`next.config.ts`, `src/lib/observability/sentry-build.ts`) only *generates*
  them and the debug ids that match an artifact to its map
  (`sourcemaps.disable: "disable-upload"`), so **no token ever exists in the
  build or in an image layer**: the token is read by the workflow only. The
  build leaves the maps in `/app/dist/sourcemaps`, moved out of `.next/static`
  by `scripts/collect-sourcemaps.mjs` — the web server serves everything under
  `.next/static`, and a map there is a public copy of the source. The cost is
  image size: the maps stay in the image for the upload to pick up.
- **Per deploy**, `makam-glitchtip-release` (called by `makam-deploy` after the
  health check) creates the release for the running commit, so the release
  exists before the first event names it. The release name is the commit, which
  is also what `SENTRY_RELEASE` put in the bundle and what the upload used.

Both are **best effort about credentials and best effort about failures**: no
token is a logged no-op, and neither a GlitchTip outage nor an upload that fails
turns into a failed deploy. A `sourcemaps` job that has a token and then fails
*does* fail the run, because that is a real misconfiguration. Until the token
exists, `sourcemaps` warns and exits 0, so `main` keeps shipping images. (The
opposite of `COSIGN_STAGING_PRIVATE_KEY`: no signing key means no image is
acceptable at all, which is why that job refuses instead.)

### The one-time setup (a human, once)

```bash
# 1. A GlitchTip auth token, in the `makam` organisation, with
#    "project:releases" and "project:source_maps" write.
#    GlitchTip UI: your avatar -> Auth Tokens -> Create.
#    (The ops token in /opt/makam-v1/glitchtip/api-token.txt works if it has them.)

# 2. In GitHub: the token is a secret, the instance and names are variables.
gh secret set GLITCHTIP_AUTH_TOKEN
gh variable set GLITCHTIP_URL --body https://errors.makam.co.id
gh variable set GLITCHTIP_ORG --body makam
gh variable set GLITCHTIP_PROJECT --body makam-staging,makam-prod   # one image, two projects

# 3. On the host, for the per-deploy release, in both env files (mode 0600):
#    MAKAM_GLITCHTIP_TOKEN=<the same token>
sudo chmod 600 /opt/makam-v1/staging/staging.env /opt/makam-v1/prod/prod.env

# 4. Install the release script (it ships with the repo):
deploy/install-host.sh
```

The next `main` run uploads the source maps of the image it builds, and the next
deploy of that image creates its release. Images built before this has the
credentials have no source maps and never will, so there is nothing to re-run for
them.

### Checking it worked

```bash
# CI: the sourcemaps job, and its "::warning title=source maps::" lines when skipped
gh run list --workflow ci.yml --limit 3

# The host: one line per deploy
grep glitchtip-release /opt/makam-v1/staging/deploy.log | tail

# GlitchTip: the release, and a real stack trace with source
#   Releases (both projects) -> the commit sha
#   Issues -> an issue -> Latest -> the event's frames are source, not chunk-XXXX
```

To upload one image by hand (after adding the token, without waiting for the next
build), on any Linux machine with Docker and a checkout:

```bash
IMAGE=ghcr.io/andrianm28/makam@sha256:<digest> RELEASE=<commit> \
  SENTRY_URL=https://errors.makam.co.id SENTRY_ORG=makam \
  SENTRY_PROJECT=makam-staging SENTRY_AUTH_TOKEN=<token> \
  scripts/ci/upload-sourcemaps.sh
```

Rotating the token: replace the secret and the two env files; the release name is
the commit, so a new token uploads into the same releases.

**If the `sourcemaps` job fails** (it only can, with a token in place): the log
has `sentry-cli`'s own error. The usual cause would be the CLI not matching
Turbopack's indexed maps (`sections`) to the debug ids it injects; the way out is
then to let the SDK upload from the build itself, which needs the token as a
buildkit secret (`secrets:` in the `image` job, `RUN --mount=type=secret` in the
Dockerfile) rather than as a build argument, so it still never lands in a layer.

**Not covered**: the *server* and *worker* source maps. The worker bundle already
writes `dist/*.mjs.map` into the image, but nothing uploads them, so only the
browser's stack traces are symbolicated.

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

The same timer also watches the **host's disk**: `makam-diskcheck` warns in the
journal (tag `makam-disk`) when the root filesystem passes 85 %. See "Images on
the host and the disk".

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
| Staging `backup-passphrase` (the database Dump) | **Not rotatable in place**: the passphrase decrypts every Dump, so the old one is needed to read them. Restore (or copy aside) every Dump you still need, then `openssl rand -base64 32 > /opt/makam-v1/staging/backup-passphrase` (0600), then `makam-backup-db --env staging` for a Dump the new passphrase can read, then destroy the offline copy of the old one. Restoring an older Dump needs its own passphrase back in place while it is restored. |
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

**Worktree images**, tag **`makam-v1:<project>`**, where `<project>` is
`makam-<worktree directory name>-<8 hex of the absolute path>`
(`scripts/lib/worktree.ts`, printed by `npm run stack`). `npm run clean` in that
worktree removes exactly that tag, and only after proving from the
`makam.worktree` label that the image was built there, so another worktree's
image, the shared `makam-v1-dev` image and every deployed image are never
candidates. These images are what fill a host's disk: about 1 GB each, so a
builder that leaves its stack up costs a gigabyte until the ticket is merged.


```bash
docker stats --no-stream makam-testpg      # RAM in use
docker stop makam-testpg                   # stays stopped, even across reboots, until the next npm run test:shared
docker rm -f makam-testpg                  # gone; the next npm run test:shared starts a new one
```

Stop or remove it only when no agent is running `npm run test:shared`.
