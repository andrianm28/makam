# CI: e2e, image scan and supply-chain hardening on every build

Status: ready-for-agent
Blocked by: 12
Spec: Implementation Decisions > Architecture (CI/CD); Testing Decisions > End-to-end; ADR 0002 (second amendment of 2026-09-26)

## What to build

Decided with the user on 2026-09-26. Move the Playwright critical paths off the shared host into GitHub Actions, and scan every image before it can be deployed. PRs keep lint, typecheck, Vitest and an image build without push; on `main` the pushed `sha-<commit>` image is started on a GitHub-hosted runner with its own Postgres (the same compose file shape as staging, fakes as in development/test where the spec allows) and the e2e suite runs against it.

## Acceptance criteria

- [x] A `main` push runs, in order: checks → image build and push `sha-<commit>` → e2e against that exact image and → Trivy scan of that image; the job graph is visible in one run, and a later deploy job can depend on both e2e and scan passing.
- [x] E2e runs the spec's critical paths that exist so far (ticket 12's specs) against the pushed image on a hosted runner, never on the host; Playwright traces and screenshots are uploaded as artifacts on failure.
- [x] Trivy fails the run on any CRITICAL vulnerability with a fix available; findings are uploaded as a SARIF/artifact; an ignore file documents any accepted exception with a reason and an expiry date.
- [x] PR runs build the image without pushing and do not run the deploy-only steps.
- [x] A whole `main` run stays under 15 minutes with warm caches (record the measured time in `## Comments`).
- [x] `AGENTS.md` and the runbook say e2e now runs in CI; agents still may run it locally but need not.

## Added 2026-09-26 (CI/CD best-practice decisions and the two-axis review)

- [ ] Every action pinned by full commit SHA (with the version in a comment); every container image (Postgres service, Trivy, base images) by digest; Dependabot configured weekly for GitHub Actions, npm and Docker.
- [ ] Every job has least-privilege `permissions` (write scopes only where used; `security-events: write` only when code scanning is enabled) and `timeout-minutes`.
- [ ] Concurrency: superseded builds may be cancelled, but jobs that move tags, sign, deploy, promote or roll back run in their own concurrency group with `cancel-in-progress: false`.
- [ ] gitleaks scans the repository on every PR and push (fails on a finding; allowlist with reasons); `npm audit --omit=dev` fails on fixable critical advisories.
- [ ] An SBOM (SPDX or CycloneDX) is produced for every pushed image and kept as an artifact (or attached to the image).
- [ ] Migration upgrade test: a database migrated to the running release's migrations and seeded with representative data is migrated to the new ones, then the domain tests run; a migration containing destructive DDL (DROP, RENAME, ALTER … SET NOT NULL without a default, type changes) fails CI unless the statement is marked `-- contract: <reason>`.
- [ ] Review fixes: one `ref` output (`image:tag@digest`) instead of rebuilding it in three jobs; the "main only" rule stated once; `MAKAM_TAG` renamed for what it holds; the CI stack no longer depends on the host's GlitchTip network name; `.trivyignore`'s 90-day maximum either enforced by the test or dropped from the docs; the runbook cross-reference fixed.
- [ ] The first real `main` run after merge is checked (conditions, `latest` retag, gate) and linked in `## Comments`.

## Comments

- 2026-09-26 — Implemented on branch `ticket-71-ci-e2e-scan` (not merged). What changed:
  - **Job graph** (`.github/workflows/ci.yml`): `check` → `image` → (`e2e` ∥ `scan`) → **`deploy-gate`**. `image` pushes only `sha-<commit>` on `main` and exposes `pushed`, `image`, `tag`, `digest`; `e2e` and `scan` use `<image>:sha-<commit>@<digest>`, so the exact pushed image, never a rebuild. `deploy-gate` needs `image`, `e2e`, `scan` and re-exports `image`/`tag`/`digest`: **ticket 72's deploy job should `needs: deploy-gate`** and read the image from its outputs. Existing jobs are untouched apart from the `image` outputs, so ticket 18's extra check step and ticket 74's smoke spec merge without conflict (a new `e2e/*.spec.ts` runs automatically).
  - **e2e**: on `ubuntu-latest`, starts the image with **`docker-compose.prod.yml`** (the staging/production file) and `deploy/ci/e2e.env` (`makam-e2e`, `APP_ENV=development`, own Postgres, web on 127.0.0.1:3310; no secrets). Same order as `makam-deploy`: `run --rm migrate`, then `up -d --wait`. An empty `glitchtip_ingest` network stands in for the host's. Seeds the e2e Admin Platform via `E2E_SEED_ADMIN="$COMPOSE exec -T web node dist/seed-admin.mjs"`. Chromium is cached per Playwright version. On failure: artifact `e2e-results` (traces, screenshots, `stack.log`), 14 days. `playwright.config.ts` now also takes screenshots on failure and prints the list reporter in CI.
  - **scan**: Trivy `aquasec/trivy:0.74.0` pinned by digest, run as a container rather than through `aquasecurity/trivy-action` (fewer moving third-party parts). One run writes SARIF of every finding; the gate run is `--severity CRITICAL --ignore-unfixed --exit-code 1` with `.trivyignore`. Artifact `trivy-findings` (SARIF + table, 30 days), table in the job summary. Vulnerability DB cached per day.
  - **`.trivyignore`**: plain Trivy format, each entry `<ID> exp:YYYY-MM-DD` with its reason in a `#` comment directly above; `tests/trivyignore.test.ts` (test-first) checks every entry has both and a real date. No exceptions today: the current image has **0 fixable CRITICAL**.
- **Judgement calls**
  - **PRs skip e2e and the scan** (branch pushes too; `PUSH` is `main` only). Running e2e on a locally loaded image would add ~5 min to every PR and branch push on a 2-vCPU runner, and `main` gates every deploy anyway; agents can still run e2e locally before merging.
  - **`latest` moved from `image` to `deploy-gate`** (main only, `docker buildx imagetools create`, same digest). Until ticket 72 retires the staging timer, the timer follows `latest`; otherwise staging would still pick up an image that failed e2e or the scan. Ticket 72 can drop that step once nothing follows `latest`.
  - **SARIF to code scanning**: not available today (private repo, code scanning not enabled: API 403). The upload step exists but runs only when the repo variable `CODE_SCANNING=true`; until then SARIF is an artifact.
  - The "critical paths" run is the whole `e2e/` directory (19 tests: health, masuk, email-login, staf, staging-banner), since the spec's three critical paths are not built yet; they join automatically when written.
- **Verified on real runs** (the main-only jobs were enabled for this branch by a temporary `PUSH` condition, since dropped from the branch history; only `sha-*` tags and one throwaway `ticket-71-gate-test` tag were pushed, never `latest`):
  - https://github.com/andrianm28/makam/actions/runs/36229053947 — all green: 19/19 e2e against the pushed image (2.4 min of tests), scan 0 fixable CRITICAL, gate green. **10m01s** push to gate.
  - https://github.com/andrianm28/makam/actions/runs/36229615852 — temporary failing spec + scan pointed at `node:18.0.0-bullseye-slim`: scan **failed** (11 fixable CRITICAL in Debian packages, 1 in npm's tar), e2e **failed** with `e2e-results` uploaded (trace.zip, screenshots, stack.log checked by download), `trivy-findings` uploaded, **deploy-gate skipped**.
  - https://github.com/andrianm28/makam/actions/runs/36230247000 — reverted, green, **11m36s** (incl. ~40 s queueing); the gate's retag steps skipped off `main`.
  - https://github.com/andrianm28/makam/actions/runs/36230852839 — retag step forced on with a throwaway tag: `imagetools create` pushed the same digest (`sha256:11ac31e1…`) as `ticket-71-gate-test`. **10m34s**.
  - Warm `main`-shaped run: **10–12 min** (check ~3m20s, image ~2m45s, e2e ~4m20s ∥ scan ~1m10s, gate ~10s), under the 15-min target. Inside e2e: `npm ci` ~40 s, Chromium ~25 s, tests ~2.5 min (1 worker on 2 vCPU).
  - Local: `npm run lint` 0, `npm run typecheck` 0, `tests/trivyignore.test.ts` 5/5.
- **Not proven before merge**: the `latest` retag on a real `main` run and the `refs/heads/main` conditions themselves (first `main` run after merge will show them). Clean-up: the branch's `sha-*` images and `ticket-71-gate-test` in ghcr may be deleted.
