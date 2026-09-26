# CI: Playwright critical paths and image scan on every main build

Status: ready-for-agent
Blocked by: 12
Spec: Implementation Decisions > Architecture (CI/CD); Testing Decisions > End-to-end; ADR 0002 (amendment of 2026-09-26)

## What to build

Decided with the user on 2026-09-26. Move the Playwright critical paths off the shared host into GitHub Actions, and scan every image before it can be deployed. PRs keep lint, typecheck, Vitest and an image build without push; on `main` the pushed `sha-<commit>` image is started on a GitHub-hosted runner with its own Postgres (the same compose file shape as staging, fakes as in development/test where the spec allows) and the e2e suite runs against it.

## Acceptance criteria

- [ ] A `main` push runs, in order: checks → image build and push `sha-<commit>` → e2e against that exact image and → Trivy scan of that image; the job graph is visible in one run, and a later deploy job can depend on both e2e and scan passing.
- [ ] E2e runs the spec's critical paths that exist so far (ticket 12's specs) against the pushed image on a hosted runner, never on the host; Playwright traces and screenshots are uploaded as artifacts on failure.
- [ ] Trivy fails the run on any CRITICAL vulnerability with a fix available; findings are uploaded as a SARIF/artifact; an ignore file documents any accepted exception with a reason and an expiry date.
- [ ] PR runs build the image without pushing and do not run the deploy-only steps.
- [ ] A whole `main` run stays under 15 minutes with warm caches (record the measured time in `## Comments`).
- [ ] `AGENTS.md` and the runbook say e2e now runs in CI; agents still may run it locally but need not.
