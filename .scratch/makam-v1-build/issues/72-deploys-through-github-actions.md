# Signed pull-based deploys: GitHub Deployment statuses, staging smoke test, production promotion and rollback

Status: ready-for-agent
Blocked by: 71
Spec: Implementation Decisions > Architecture (CI/CD, production); ADR 0002 (second amendment of 2026-09-26); docs/ops/runbook.md

## What to build

Decided with the user on 2026-09-26 (rewritten after finding that GitHub Free offers no branch protection or environment approvals for a private repo). Deploys stay pull-based: the host pulls, verifies and deploys; CI never runs code on the host. Add image signing, deploy visibility in GitHub, a staging smoke gate, and owner-only production promotion and rollback.

## Acceptance criteria

- [ ] **Signing**: after ticket 71's gate passes on `main`, CI signs the image digest with cosign (staging key pair; private key as a GitHub secret, public key installed on the host by `deploy/install-host.sh`). `makam-deploy` verifies the signature before `migrate` and refuses (distinct exit code, logged) any unsigned or wrongly signed image. Tests show an unsigned image is refused.
- [ ] **Staging** follows the signed digest (not a mutable tag alone); the timer stays; each deploy step reports a GitHub Deployment and status (in_progress / success / failure, with the URL) using a fine-grained token limited to deployment statuses on this repository, stored on the host only.
- [ ] **One digest for both environments**: the browser GlitchTip DSN (`NEXT_PUBLIC_SENTRY_DSN`) stops being a build argument and becomes a runtime value served to the browser; a test shows one image reports to the DSN of the environment it runs in.
- [ ] **Staging smoke gate**: after a staging deploy, a short Playwright smoke test runs from a hosted runner against `https://dev.makam.co.id` (health, home, Masuk page); its result is recorded against the digest, and promotion refuses a digest whose smoke test did not pass.
- [ ] **Production promotion**: a `workflow_dispatch` "Promosikan ke produksi" that refuses unless `github.actor` is the repository owner, requires the release tag typed again, requires the digest to be the one deployed and healthy on staging, signs it with a separate **production** key, and creates `vYYYY.MM.DD-N` with generated release notes. The production host accepts only production-signed images.
- [ ] **Rollback workflow**: owner-only `workflow_dispatch` re-promoting an earlier released digest (same signing), plus the by-hand `makam-deploy --tag` path in the runbook.
- [ ] **Production safety in `makam-deploy --env prod`**: `pg_dump` snapshot before `migrate` (local with rotation; off-host once ticket 64 exists); failed `migrate` → nothing restarted; failed `up` or `/api/health` → automatic rollback to the previous tag and a failure status. Migrations are never rolled back automatically.
- [ ] **Releases**: CI uploads source maps to GlitchTip for each image (release-scoped token as a GitHub secret) and each deploy creates a GlitchTip release for the commit.
- [ ] **Concurrency**: signing, promotion and rollback run in groups that are never cancelled mid-way.
- [ ] **Rehearsal**: `makam-prod` deployed once through the promotion on 127.0.0.1:3100 with sandbox keys and no nginx change; a forced failing healthcheck shows the automatic rollback; an unsigned image is refused. Live keys, the nginx switch and going live stay in ticket 65; production is not live before ticket 64.
- [ ] Runbook: signing keys (where they live, how to rotate), approving a promotion, rolling back, pausing deploys, reading deploy results in GitHub and `deploy.log`.

## Comments

- 2026-09-27 — Orchestrator: Standards axis on `cd70da0` found 3 HARD to fix in the next pass (do these before merge; the merge also needs the owner's explicit OK):
  1. **Runtime DSN never reaches the browser for static pages.** `src/app/layout.tsx:40` — `npm run build` shows `/` and `/_not-found` as `○ (Static)` and `.next/server/app/index.html` holds the *build-time* DSN (`https://buildtimekey@…/9`); in an image built without the build arg it is `""` forever. This defeats the one-digest-both-environments AC, and `e2e/smoke.spec.ts` (`if (dsn) …`) cannot catch it because it is skipped when the DSN is empty. Needs an on-demand/on-demand route or `connection()`.
  2. **cosign pinned by tag, not digest.** `COSIGN: ghcr.io/sigstore/cosign/cosign:v2.6.1` in `ci.yml` (job `sign`), `promote.yml` and `rollback.yml` — that image reads `COSIGN_*_PRIVATE_KEY`, so an unpinned tag is a supply-chain hole (AGENTS.md: pin a new image by digest; runbook: every image by digest).
  3. **`tsx` fetched from the registry at run time.** `ci.yml` job `migrations` runs `npx tsx scripts/migrations/deployed-release.ts` before `setup-node` + `npm ci`, and that script is what picks the baseline image.
  - Judgement calls: the 14-line cosign block is triplicated across the three workflows (extract a composite action); the same regex fixture is repeated in 4 `.gitleaks.toml` entries; `ci.yml` job `image` has a stale comment ("`latest` … is added by deploy-gate" — it is `sign` now); `docker-compose.prod.yml` `${MAKAM_DEPLOY_REF:-…}` without `MAKAM_TAG` still errors and the message offers an option that does not work.
  - Clean: no `docker *prune` (the only `prune()` call is `docker image rm` of this repo's own image), no real secrets, signature verified before `migrate`, `MAKAM_DEPLOY_REF` digest-pinned, rollback never touches data, every action pinned by SHA, `cancel-in-progress: false` on the release paths.

- 2026-09-26 — Follow-ups from ticket 71's re-review (do them here):
  - The migration upgrade test's baseline is `:latest`; once deploys follow signed digests, and once production lags staging, the baseline must be the digest running in production (else staging), and the very first run must cope with no baseline.
  - `.gitleaks.toml`: narrow the whole-file allowlists (e.g. `src/lib/env.ts`) to the specific keys/rules; one file per entry as the runbook says.
  - Destructive-DDL checker: the `-- contract:` marker must be on the line(s) directly above the statement, not anywhere since the previous `;`; also flag TRUNCATE and new UNIQUE / FOREIGN KEY / CHECK constraints (expand/contract).
  - `seed-representative.ts`: fail when any table stays empty (not only when all do); fix the "savepoint" comment.
  - Derive the image name from `GITHUB_REPOSITORY` in the `migrations` job; share the Chromium step (keep its `--version` check) and the ghcr login instead of copies; state the main-only rule once (also in the concurrency line).
  - Trigger CI once per PR commit (filter `push` to `main` or dedupe with `pull_request`).
  - GitHub keeps only one pending run per concurrency group: correct the "main runs queue" wording; a skipped middle run is acceptable.
  - The runbook's staging-rollback path (explicit tag, timer stopped) means `latest` is not what runs; the upgrade baseline must read the deployed digest.
