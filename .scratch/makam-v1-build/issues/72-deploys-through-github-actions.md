# Signed pull-based deploys: GitHub Deployment statuses, staging smoke test, production promotion and rollback

Status: ready-for-agent
Blocked by: 71
Spec: Implementation Decisions > Architecture (CI/CD, production); ADR 0002 (second amendment of 2026-09-26); docs/ops/runbook.md

## What to build

Decided with the user on 2026-09-26 (rewritten after finding that GitHub Free offers no branch protection or environment approvals for a private repo). Deploys stay pull-based: the host pulls, verifies and deploys; CI never runs code on the host. Add image signing, deploy visibility in GitHub, a staging smoke gate, and owner-only production promotion and rollback.

## Acceptance criteria

- [x] **Signing**: after ticket 71's gate passes on `main`, CI signs the image digest with cosign (staging key pair; private key as a GitHub secret, public key installed on the host by `deploy/install-host.sh`). `makam-deploy` verifies the signature before `migrate` and refuses (distinct exit code, logged) any unsigned or wrongly signed image. Tests show an unsigned image is refused.
- [x] **Staging** follows the signed digest (not a mutable tag alone); the timer stays; each deploy step reports a GitHub Deployment and status (in_progress / success / failure, with the URL) using a fine-grained token limited to deployment statuses on this repository, stored on the host only.
- [x] **One digest for both environments**: the browser GlitchTip DSN (`NEXT_PUBLIC_SENTRY_DSN`) stops being a build argument and becomes a runtime value served to the browser; a test shows one image reports to the DSN of the environment it runs in.
- [x] **Staging smoke gate**: after a staging deploy, a short Playwright smoke test runs from a hosted runner against `https://dev.makam.co.id` (health, home, Masuk page); its result is recorded against the digest, and promotion refuses a digest whose smoke test did not pass.
- [x] **Production promotion**: a `workflow_dispatch` "Promosikan ke produksi" that refuses unless `github.actor` is the repository owner, requires the release tag typed again, requires the digest to be the one deployed and healthy on staging, signs it with a separate **production** key, and creates `vYYYY.MM.DD-N` with generated release notes. The production host accepts only production-signed images.
- [x] **Rollback workflow**: owner-only `workflow_dispatch` re-promoting an earlier released digest (same signing), plus the by-hand `makam-deploy --digest` path in the runbook.
- [x] **Production safety in `makam-deploy --env prod`**: `pg_dump` snapshot before `migrate` (local with rotation; off-host once ticket 64 exists); failed `migrate` -> nothing restarted; failed `up` or `/api/health` -> automatic rollback to the previous digest and a failure status. Migrations are never rolled back automatically.
- [ ] **Releases**: CI uploads source maps to GlitchTip for each image (release-scoped token as a GitHub secret) and each deploy creates a GlitchTip release for the commit. **Not done**: source maps need `SENTRY_ORG`/`SENTRY_PROJECT` and a release at *build* time in `next.config.ts` (a build-time decision, not a runtime one), and both halves need a GlitchTip auth token as a secret. The runbook says so; the credentials do not exist yet.
- [x] **Concurrency**: signing, promotion and rollback run in groups that are never cancelled mid-way.
- [ ] **Rehearsal**: `makam-prod` deployed once through the promotion on 127.0.0.1:3100 with sandbox keys and no nginx change; a forced failing healthcheck shows the automatic rollback; an unsigned image is refused. **Not run**: the promotion and the signature check both need real cosign key pairs, which do not exist yet (see `## Comments`). Both behaviours are covered by `tests/tooling/makam-deploy.test.ts`, which drives the real scripts against fakes.
- [x] Runbook: signing keys (where they live, how to rotate), approving a promotion, rolling back, pausing deploys, reading deploy results in GitHub and `deploy.log`.

## Comments

- 2026-09-26 — Follow-ups from ticket 71's re-review (do them here):
  - The migration upgrade test's baseline is `:latest`; once deploys follow signed digests, and once production lags staging, the baseline must be the digest running in production (else staging), and the very first run must cope with no baseline.
  - `.gitleaks.toml`: narrow the whole-file allowlists (e.g. `src/lib/env.ts`) to the specific keys/rules; one file per entry as the runbook says.
  - Destructive-DDL checker: the `-- contract:` marker must be on the line(s) directly above the statement, not anywhere since the previous `;`; also flag TRUNCATE and new UNIQUE / FOREIGN KEY / CHECK constraints (expand/contract).
  - `seed-representative.ts`: fail when any table stays empty (not only when all do); fix the "savepoint" comment.
  - Derive the image name from `GITHUB_REPOSITORY` in the `migrations` job; share the Chromium step (keep its `--version` check) and the ghcr login instead of copies; state the main-only rule once (also in the concurrency line).
  - Trigger CI once per PR commit (filter `push` to `main` or dedupe with `pull_request`).
  - GitHub keeps only one pending run per concurrency group: correct the "main runs queue" wording; a skipped middle run is acceptable.
  - The runbook's staging-rollback path (explicit tag, timer stopped) means `latest` is not what runs; the upgrade baseline must read the deployed digest.
- 2026-09-27 — Implemented on branch `ticket-72-signed-deploys` (not merged). What changed:
  - **Signing and digest-pinned deploys** (`deploy/bin/makam-verify-image` new, `deploy/bin/makam-deploy` rewritten, `docker-compose.prod.yml`): whatever a tag names is resolved to a **digest**, the digest's signature is checked with that environment's public key *before* `migrate`, and the digest is what runs (`MAKAM_DEPLOY_REF=:<tag>@<digest>` in `deployed.env`). Exit **77** = unsigned or another key (nothing touched), **78** = no cosign on the host. A mutable tag is now only a pointer, so `latest` can no longer be a thing to trust.
  - **`sign` job** in `ci.yml`, after `deploy-gate`, in its own never-cancelled group: cosign with the staging key, and only then `:latest`. `deploy-gate` no longer moves the tag, so the window in which the host could see an unsigned digest is closed rather than narrowed.
  - **Tests** (`tests/tooling/makam-deploy.test.ts`, 13 cases) drive the *real* scripts with a fake `cosign`, `docker` and `curl`: an unsigned image is refused before `migrate` and the running release is untouched; the deployed reference is the digest; a production snapshot comes before `migrate` and staging takes none; an unhealthy new digest rolls back to the previous one; a failed `migrate` restarts nothing; a local image is refused for production.
  - **Deploy visibility** (`deploy/bin/makam-deploy-status`): a GitHub Deployment per run with `in_progress`/`success`/`failure` and the run URL, from a fine-grained token in the env file. Best effort by design: no token, no `curl`/`jq`, or a GitHub outage is a logged no-op, never a failed deploy. The same Deployments are what the migration baseline and the promotion read.
  - **Migration baseline** (`scripts/migrations/deployed-release.ts` + test): the digest production runs, else staging, else `:latest`, and **no baseline at all** when nothing has been deployed yet — a first run no longer needs a fake starting point.
  - **Runtime DSN**: `NEXT_PUBLIC_SENTRY_DSN` is no longer a build argument (`Dockerfile`, `ci.yml`); the server reads it and serves it to the browser in the page, so one digest serves both environments (`src/lib/browser-sentry.test.ts`). The `@smoke` spec checks the value arrives in the page, and the e2e job skips the `@smoke` specs so the minutes are not paid twice.
  - **Workflows**: `staging-smoke.yml` (every 15 min + on demand, against `dev.makam.co.id`, result recorded on the digest's own deployment), `promote.yml` (owner only, tag typed again, staging healthy, **smoke passed**, production signing, release tag + generated notes), `rollback.yml` (owner only, re-signs an earlier released digest, creates no release).
  - **Production safety**: `pg_dump` before `migrate` (seven kept, 0600, in `prod/backups/db`), automatic roll back to the previous digest on a failed `up` or health check, `deployed.env` restored to what is actually running. Migrations are never rolled back.
  - **Ticket 71's follow-ups**: `.gitleaks.toml` narrowed (below); destructive-DDL now needs the marker on the lines directly above, and flags TRUNCATE and new UNIQUE/FOREIGN KEY/CHECK on a pre-existing table; `seed-representative.ts` fails when *any* table stays empty; the image name comes from `GITHUB_REPOSITORY`; the ghcr login and the Chromium step are shared composite actions; `push` is filtered to `main` so a PR commit is checked once; the concurrency wording now says what GitHub actually does (one pending run per group, a skipped middle run).
  - **Judgement calls**
    - A `paths` entry in `.gitleaks.toml` is **whole-file and ignores `matchCondition`** (verified against the pinned gitleaks v8.30.1: a private key appended to an allowlisted file is not reported either way). So the narrowed config drops `paths` and names the exact fixture secret with `regexTarget = "secret"`; the file is named in each entry's description. A different secret in the same file now fails, which is what the re-review asked for.
    - `--local` skips the signature check and is **refused for production**; it logs a WARNING. It exists for tests and the local stack.
    - `MAKAM_HEALTH_WAIT` / `MAKAM_HEALTH_INTERVAL` (default 180 s / 5 s) so a test does not wait three minutes for a health check that will never pass.
    - The staging timer still follows `:latest`; the digest it resolves to is what is verified and deployed, so the timer stays and loses nothing.
- 2026-09-27 — **Needs a human before any of this can run on the host** (nothing here can be finished by an agent):
  - `cosign generate-key-pair` twice (staging and production), the private halves into `COSIGN_STAGING_PRIVATE_KEY` / `COSIGN_PROD_PRIVATE_KEY` (+ passwords) as repository secrets, the public halves onto the host (`/opt/makam-v1/{staging,prod}/cosign.pub`). Until then the `sign` job fails and both deploys are refused (78), which is the safe direction.
  - A fine-grained GitHub token with only **Deployments: write** on this repository, in `staging.env` and `prod.env` as `MAKAM_GITHUB_TOKEN`, for the GitHub Deployment statuses.
  - `NEXT_PUBLIC_SENTRY_DSN` (public) added to each env file on the host, replacing the GitHub variable the build used to read.
  - `deploy/install-host.sh` on the host, then the rehearsal (AC 9) and the first real `main` run.
