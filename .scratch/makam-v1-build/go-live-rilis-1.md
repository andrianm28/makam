# Go-live checklist: the Rilis 1 beta, gates G0 to G5 (ticket 65)

Rebuilt on 2026-10-04 from the owner-approved plan of that day (the `Spec:` line of ticket 113; "the plan" below, C2 to C13 being its owner items). Human-gated: an agent may prepare and rehearse, and the owner signs each gate. The procedures are in `docs/ops/runbook.md`; this file says what must be true and where the proof goes. **Tick an item only when its `Evidence:` line is filled in**: a command and its trimmed output (never a secret), a link, or a name and a date.

What it rests on (owner decisions, 2026-10-04; ADR 0006's "Amendment (2026-10-04)" and ADR 0007):

- **The beta runs on SumoPod's sandbox**, behind the trial banner "PEMBAYARAN UJI COBA". Live keys (ticket 04) come separately, and S3 (ticket 03) stays in v2.
- **Production switches at `RILIS_TERBUKA=1`**, written in `prod.env`, and opens 3 once a UAT at 3 is signed. This reverses the 2026-10-03 choice of 3 on switch day.
- **The beta takes no real orders**: CS turns them away, and no real Pencairan or refund transfer is made.
- **Data Contoh**: marked "(Contoh)" example data for every release, prices included, removed with one command before real operation.
- **Production backups and monitoring are gates of the switch** (G1 and G3).
- **UAT by agents first** (the Playwright runner and screenshots): the owner reads the login codes out, checks samples and signs.
- **One SumoPod sandbox project**: every payment case is finished on staging before the switch, and the webhook moves to `makam.co.id` at the switch.

Legend: A, B and C are the three digests (A for the rehearsal, B for the switch, C for level 3). D1 is Sunday 2026-10-04, so G3 is D4 (Wednesday 2026-10-07) with D5 as the spare day, and G5 is D10 to D11. A merge freeze (F1 before G3, F2 before G5) means nothing lands on `main` while a gate window runs, so the digest that was tested is the digest that goes. Builders are stopped during G1, G3 and G5: the host is shared.

## Before the gates: the owner's items

- [ ] **Cosign key pairs** for staging and production exist; their public keys are installed by `deploy/install-host.sh` (ticket 72, "Rehearsal").
  Evidence:
- [ ] **GlitchTip release token**: `GLITCHTIP_AUTH_TOKEN` and the `GLITCHTIP_*` CI variables, and `MAKAM_GLITCHTIP_TOKEN` in each host env file (ticket 72, "Releases").
  Evidence:
- [ ] **`prod.env` is complete** ("Production (ticket 65)"): the sandbox set `SUMOPOD_BASE_URL`, `SUMOPOD_API_KEY` and `SUMOPOD_WEBHOOK_SECRET` of the project staging uses (only these three are read; the `whtok_` token is not), SMTP, and `RILIS_TERBUKA=1` written down (plan B2), mode 0600.
  Evidence:
- [ ] **The first Admin Platform's email and phone** for `seed:admin` are chosen (plan C4).
  Evidence:
- [ ] **The Data Contoh amounts are approved** (the Lokasi and Layanan prices, the contoh Biaya Layanan Platform, the 22 DKI prices and the Mitra Jasa rates; plan C2), and **Retribusi Pemda at Rp 0 is accepted as a real value** (plan C3).
  Evidence:
- [ ] **Both backup passphrases are copied somewhere offline**, and the GlitchTip superuser password is changed (plan C5).
  Evidence:
- [ ] **UptimeRobot account and alert contacts, and the GlitchTip alert recipients** exist (plan C9). GlitchTip's `EMAIL_URL` and the rule "Error baru (email)" on both projects are already in place (runbook, "errors.makam.co.id").
  Evidence:
- [ ] **Texts approved**: the trial banner and its Data Contoh line, the CS script for turning real orders away ("Production on SumoPod's sandbox"), and the TPU guide copy (plan C11).
  Evidence:
- [ ] **Accepted by the owner** (plan C12): the production import of the old catalog is skipped, because Data Contoh replaces it; the deferral lists below; and the trade-off of stable Server Action ids for ticket 98, whose key would live in the image.
  Evidence:
- [ ] **Beta staff**: the Bertugas hours, a CS person, and the Petugas Lapangan accounts before G5 (plan C13).
  Evidence:
- [ ] **Old-app data question answered** (ticket 65, AC1): answered on 2026-10-03, the old app holds test data only and is archived at the switch (ticket 65, "Comments").
  Evidence:

## G0: the promotion path runs (D1 to D2)

Procedure: runbook, "Promoting to production" and "The staging smoke gate".

- [ ] **Ticket 105 is proved**: the staging smoke test recorded `success` against the digest staging runs.
  Check: `gh api repos/andrianm28/makam/deployments/<id>/statuses` holds `... (sha256:...) healthy` and `smoke test against dev.makam.co.id for sha256:...: success`.
  Evidence:
- [ ] **Batch MB1 (tickets 106, 107, 108) is merged and staging runs digest A**; the smoke test records its own `success` on the Deployment's `deployment_status` event, not only on the 15-minute schedule.
  Check: the Deployment id and its newest smoke status, with the time.
  Evidence:
- [ ] **`/api/health` names the release and the open release.**
  Check: `curl -s https://dev.makam.co.id/api/health | jq '{ok,release,rilisTerbuka}'` shows A's commit and `3`.
  Evidence:
- [ ] **The `actionlint` job is green on `main`.**
  Evidence:

## G1: the rehearsal on 127.0.0.1:3100 (D2)

Procedure: runbook, "Rehearsal of the first production deploy". No nginx change: `makam.co.id` still serves the old app. The order is promote, deploy, `seed:admin`, the launch data, `install-host.sh` again, and only then the preflight, because the production timers exist only after the first deploy.

- [ ] **P1: A is promoted** (the owner ran `promote.yml` and typed the tag; the first of a day is `-1`).
  Check: `gh release view <tag> --json isDraft` shows `false`.
  Evidence:
- [ ] **`makam-deploy --env prod --digest A` exits 0** and the worker started at level 1.
  Check: the exit code, and `$P logs worker | grep 'started (RILIS_TERBUKA=1)'`.
  Evidence:
- [ ] **The first Admin Platform and the launch data are in** (`seed:admin`, then `import-data-peluncuran --izinkan-production`, a dry run first).
  Check: the two reports.
  Evidence:
- [ ] **`install-host.sh` ran again and four production timers are listed.**
  Check: `systemctl list-timers 'makam-prod-*'` lists makam-prod-db-backup, -files-backup, -restore-test and -health.
  Evidence:
- [ ] **The preflight `--rilis 1` exits 0 with no FAIL**; SKIP only for S3, the sandbox, data contoh, the uptime monitor and nginx.
  Check: the whole output (it never prints a secret).
  Evidence:
- [ ] **An image signed only with the staging key is refused**: exit 77, and nothing is touched.
  Check: the exit code, the `deploy.log` line, and `deployed.env` unchanged.
  Evidence:
- [ ] **A forced rollback works**: `MAKAM_HEALTH_WAIT=0 ... --force` exits 1, the previous digest runs again, the Deployment ends `failure`, and a normal deploy then restores `healthy`.
  Check: the exit code, the `deploy.log` lines, the Deployment's statuses.
  Evidence:
- [ ] **The backups and the restore test pass**: `makam-backup-db --env prod`, `makam-backup-files --env prod` and `makam-restore-test --env prod` exit 0.
  Evidence:
- [ ] **Ticket 72's Rehearsal items are ticked** (by the orchestrator, from this evidence; the ticket's wording is unchanged).
  Evidence:

## G2: the UAT of Rilis 1 and of every payment case, on staging (D2 to D4)

- [ ] **Tickets 98 and 109 are merged by the evening of D3, and the freeze F1 holds digest B on the morning of D4.**
  Check: `origin/main` equals B's ref.
  Evidence:
- [ ] **The UAT of Rilis 1 passes in the runner**: the checklist from section 0 to 11, 0 failed, a screenshot per step.
  Evidence:
- [ ] **Every [BAYAR] item of Rilis 2 and 3 is paid and confirmed on staging.** One SumoPod project means none of them can be done after the switch.
  Evidence:
- [ ] **Every SumoPod webhook delivery shows 2xx**, and the UAT orders are cancelled.
  Check: the dashboard's Webhooks tab.
  Evidence:
- [ ] **The regression on digest B passes**: the Rilis 1 critical path; the stale form (open a form, deploy, submit: the Indonesian page with "Muat ulang"); an `.invalid` address answers "gagal kirim"; Data Contoh is visible.
  Evidence:
- [ ] **The owner's gate comment is in ticket 65's `## Comments`**: v1 is ready to replace the old app, and the old-app data question is answered.
  Evidence:

## G3: the switch at level 1 (D4 afternoon, spare D5)

Procedure: runbook, "Hari switch", every step in its order; the lines below are the proof to keep, not the procedure.

- [ ] **P2: B is promoted and pre-pulled, the rollback is rehearsed with B (exit 1, back to A), and B is deployed (exit 0).**
  Check: the two exit codes and the `deploy.log` lines.
  Evidence:
- [ ] **Data Contoh is planted**: `data-contoh tanam --set rilis1 --izinkan-production --tulis`, and `status` lists the set.
  Evidence:
- [ ] **The preflight `--rilis 1` exits 0 with no FAIL.**
  Evidence:
- [ ] **The old app is archived and proven** (`makam-arsip-app-lama --container makam-nonprod-postgres-1`): every table's row count equals the source's.
  Evidence:
- [ ] **`makam-switch --cek`, then `makam-switch --ke v1`** ran, `nginx -t` passed before the reload.
  Evidence:
- [ ] **The SumoPod webhook is moved to `https://makam.co.id/api/webhooks/pembayaran` and Save & Test shows 2xx.**
  Check: the dashboard, and a 2xx line in `/var/log/nginx/makam.co.id.access.log`.
  Evidence:
- [ ] **The checks pass**: `curl -s https://makam.co.id/api/health | jq '{ok,environment,release,rilisTerbuka}'` shows `true`, `"production"`, B's commit and `1`; the banner "PEMBAYARAN UJI COBA" and the Data Contoh line are visible; the owner's Pengaturan Operator is in and TOTP enrolled; one order at a Lokasi "(Contoh)" is placed and cancelled.
  Evidence:
- [ ] **Monitoring works**: UptimeRobot shows Up and a test alert arrived, and `sentry-check` produced the "Error baru (email)" email.
  Evidence:
- [ ] **If anything failed, `makam-switch --ke pemeliharaan` was run** and the reason is written in ticket 65 (not applicable when everything passed).
  Evidence:
- [ ] **After the checks, the old app is deleted** (`--hapus`, the word `hapus-app-lama`) and the freeze F1 is lifted.
  Evidence:

## G4: the UAT at level 3 is signed (D6 to D10)

- [ ] **Digest C is deployed on staging**: batches MB5 (tickets 112 and the second slice of 110) and MB6 (ticket 111) are merged.
  Check: `curl -s https://dev.makam.co.id/api/health | jq '{release,rilisTerbuka}'`.
  Evidence:
- [ ] **`data-contoh tanam --set rilis3 --izinkan-staging --tulis` is run on staging**, and the [TANPA-BAYAR] items of Rilis 2 and 3 pass in the runner at digest C.
  Evidence:
- [ ] **The level-3 prerequisites hold**: Retribusi Pemda at Rp 0 as a real value in production; Petugas Lapangan accounts active (without them the TPU Saat Duka confirmation is refused) and the Bertugas devices ready; the PT JKP name checked in the Surat Kuasa; AC3 of ticket 55 (the Pencairan display) seen.
  Evidence:
- [ ] **The owner checks samples and signs; the freeze F2 is set.**
  Check: the owner's comment in ticket 65, or in the ticket that carries G4.
  Evidence:

## G5: production at level 3 (D10 to D11)

Procedure: runbook, "Which release is open", after "Promoting to production" and "Hari switch" for P3.

- [ ] **P3: C is promoted and deployed at a quiet hour**, with the staff told first.
  Evidence:
- [ ] **`data-contoh tanam --set rilis3 --izinkan-production --tulis` is run**, and `status` lists the Rilis 3 set.
  Evidence:
- [ ] **A log snapshot is kept** before the change.
  Evidence:
- [ ] **`RILIS_TERBUKA=3` is in `prod.env` and web and worker are recreated.**
  Check: `grep '^RILIS_TERBUKA=3$' prod.env`, then `up -d --force-recreate web worker`.
  Evidence:
- [ ] **The worker started at 3 and skips nothing**: a `started (RILIS_TERBUKA=3)` line and 0 lines with `skipped`.
  Evidence:
- [ ] **`/api/health` reports `rilisTerbuka` 3, and `makam-preflight --env prod --rilis 3` exits 0.**
  Evidence:
- [ ] **A TPU quote has no `tarif_belum_ada`.**
  Evidence:
- [ ] **The freeze F2 is lifted.**
  Evidence:

## Rollback

- Production is rolled back to an earlier release by `rollback.yml` (owner only: an earlier release tag and a reason; it re-signs that digest with the production key and records a rollback, and cuts no new release), or by hand: `makam-deploy --env prod --digest sha256:<earlier>` (runbook, "Rolling back"). The host also rolls back by itself when a new digest never becomes healthy (exit 1).
- It only works while the previous image tolerates the new schema: migrations are forward-only, and an image rollback never undoes one.
- At the switch, the fallback is `makam-switch --ke pemeliharaan`, the maintenance page, because the old app is gone (runbook, "Hari switch").

## After the beta: what waits, and the trigger to resume it

| Item | Trigger |
|---|---|
| Live payments (ticket 04) | SumoPod's KYC is done and the owner decides to take real orders; then "Going live" in the runbook: `cabut`, close the beta orders, build ticket 46's gap 5 reminder, install the live keys, delete `SUMOPOD_BASE_URL` |
| Real prices (ticket 06): the Biaya Layanan Platform, the 22 DKI prices, the Biaya Pengurusan start dates | the owner gives the values, which are entered through Tarif and Layanan; `cabut` checks that each contoh version is replaced |
| Real partners: the agreement, the Kunjungan Verifikasi, the Mitra Jasa agreement, the rota | the agreement template exists and the first partner signs; published together with live payments |
| S3 (ticket 03) and offsite backup | v2 |
| Moving the repository and ghcr to the PT JKP organisation (ticket 02) | two stable weeks after G5 at the earliest; it needs code changes in `promote.yml`, `rollback.yml`, `makam-deploy`, the preflight and more, and a new rehearsal |
| SEO: redirects or 410 for old URLs, a sitemap, canonical URLs | before the site is promoted or indexed |
| The Paket Layanan order screen (ticket 54) | the owner decides to sell subscriptions; it is not shown in the app today |
| GlitchTip source maps (ticket 72, AC8), HSTS for a year, the `:production` timer pointer, CI sharding | after G5 |

## Deferred for the beta, safe because no real order is taken

Each is picked up before the first real order, and none blocks G3 or G5:

- The family reminder for overdue pay-after TPU Tagihan (ticket 46, gap 5): built before live payments.
- TPU Perpanjangan for an IPTM outside the platform (story 80).
- Ticket 46's gaps 1, 2 and 4, ticket 47, ticket 56's gap 7, the Tier 4 deadline of ticket 55 and the open question of ticket 53: staff handle them by hand during the beta.
- The Setor Retribusi task form, needed only when Retribusi is more than Rp 0.
- The test that a Mitra Jasa cannot reach a Hak Pakai: required before a real Mitra Jasa.
- The family email for decisions 39 and 41, the platform Audit Log page, the viewer for manual payment proofs and the Jadwal Petugas page.
