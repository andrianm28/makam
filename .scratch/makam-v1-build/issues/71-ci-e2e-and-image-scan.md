# CI: e2e, image scan and supply-chain hardening on every build

Status: ready-for-agent
Blocked by: 12
Spec: Implementation Decisions > Architecture (CI/CD); Testing Decisions > End-to-end; ADR 0002 (second amendment of 2026-09-26)

## What to build

Decided with the user on 2026-09-26. Move the Playwright critical paths off the shared host into GitHub Actions, and scan every image before it can be deployed. PRs keep lint, typecheck, Vitest and an image build without push; on `main` the pushed `sha-<commit>` image is started on a GitHub-hosted runner with its own Postgres (the same compose file shape as staging, fakes as in development/test where the spec allows) and the e2e suite runs against it.

## Acceptance criteria

- [ ] A `main` push runs, in order: checks → image build and push `sha-<commit>` → e2e against that exact image and → Trivy scan of that image; the job graph is visible in one run, and a later deploy job can depend on both e2e and scan passing.
- [ ] E2e runs the spec's critical paths that exist so far (ticket 12's specs) against the pushed image on a hosted runner, never on the host; Playwright traces and screenshots are uploaded as artifacts on failure.
- [ ] Trivy fails the run on any CRITICAL vulnerability with a fix available; findings are uploaded as a SARIF/artifact; an ignore file documents any accepted exception with a reason and an expiry date.
- [ ] PR runs build the image without pushing and do not run the deploy-only steps.
- [ ] A whole `main` run stays under 15 minutes with warm caches (record the measured time in `## Comments`).
- [ ] `AGENTS.md` and the runbook say e2e now runs in CI; agents still may run it locally but need not.

## Added 2026-09-26 (CI/CD best-practice decisions and the two-axis review)

- [ ] Every action pinned by full commit SHA (with the version in a comment); every container image (Postgres service, Trivy, base images) by digest; Dependabot configured weekly for GitHub Actions, npm and Docker.
- [ ] Every job has least-privilege `permissions` (write scopes only where used; `security-events: write` only when code scanning is enabled) and `timeout-minutes`.
- [ ] Concurrency: superseded builds may be cancelled, but jobs that move tags, sign, deploy, promote or roll back run in their own concurrency group with `cancel-in-progress: false`.
- [ ] gitleaks scans the repository on every PR and push (fails on a finding; allowlist with reasons); `npm audit --omit=dev` fails on fixable critical advisories.
- [ ] An SBOM (SPDX or CycloneDX) is produced for every pushed image and kept as an artifact (or attached to the image).
- [ ] Migration upgrade test: a database migrated to the running release's migrations and seeded with representative data is migrated to the new ones, then the domain tests run; a migration containing destructive DDL (DROP, RENAME, ALTER … SET NOT NULL without a default, type changes) fails CI unless the statement is marked `-- contract: <reason>`.
- [ ] Review fixes: one `ref` output (`image:tag@digest`) instead of rebuilding it in three jobs; the "main only" rule stated once; `MAKAM_TAG` renamed for what it holds; the CI stack no longer depends on the host's GlitchTip network name; `.trivyignore`'s 90-day maximum either enforced by the test or dropped from the docs; the runbook cross-reference fixed.
- [ ] The first real `main` run after merge is checked (conditions, `latest` retag, gate) and linked in `## Comments`.
