# makam-deploy records no Deployment status, so promotion always refuses

Status: ready-for-agent
Blocked by: none (it blocks the first promotion: 65, 72)
Spec: ticket 72 (signed pull-based deploys, GitHub Deployment statuses, promotion); `docs/ops/runbook.md` "Promoting to production"; found on the host on 2026-10-03 while preparing the first promotion

## What to build

`deploy/bin/makam-deploy` reports each deploy to GitHub through `deploy/bin/makam-deploy-status`, so that staging and production deploys appear as GitHub Deployments with their states. `promote.yml` depends on that: it only promotes the digest of the newest staging Deployment that has a `success` status and a passed smoke test.

The two scripts disagree about arguments:
- `makam-deploy` calls the state step positionally, for example `status state success "$TAG ($DIGEST) healthy"`. It makes six such calls, in `deploy/bin/makam-deploy` around lines 256–306.
- `makam-deploy-status` only accepts flags: `state --state <in_progress|success|failure> --description "<text>"`. Its own header comment still documents the positional form (`state <in_progress|success|failure> "<description>"`).

So every state call ends in `unknown argument: success` (or `in_progress`, or `failure`) followed by the usage text in `deploy.log`. Because the status function is best effort, the deploy itself carries on. The `begin` call already uses flags and creates the Deployment once `MAKAM_GITHUB_TOKEN` is set.

The effect: no Deployment, staging or production, ever gets a state. `promote.yml` therefore refuses with "staging has no successful status", and the first promotion cannot happen. Production deploys would likewise never show as successful in GitHub.

Make the calls and the script agree, and keep the best-effort rule: a missing token, a GitHub outage or a bad response must never fail a deploy.

## Acceptance criteria

- [ ] Every state change `makam-deploy` reports (unsigned or wrong key → failure, in progress, migrate failed, up failed, healthy → success, never healthy → failure) reaches `makam-deploy-status` in a form it accepts, and lands as that state with that description on the Deployment that `begin` created in the same run. The unsigned case is reported before `begin` runs (line ~256, versus `begin` at ~268), so it has no Deployment of its own yet. The builder decides whether it creates one or is logged only, and says which in this ticket's Comments.
- [ ] `makam-deploy-status`'s header comment documents exactly the arguments it accepts.
- [ ] A successful staging deploy leaves a Deployment whose newest status is `success`, so `promote.yml`'s "The digest staging runs, healthy, with a passed smoke test" step gets past "staging has no successful status" once the smoke test has passed.
- [ ] Still best effort: without a token, without curl or jq, with GitHub unreachable, or on any non-2xx response, the deploy's own outcome and exit code are unchanged, and `deploy.log` says so in one line instead of printing the usage text.
- [ ] Tests (tooling tests, like `tests/tooling/makam-preflight.test.ts`): running `makam-deploy`'s status calls against a fake `makam-deploy-status`, or against the real one with a stubbed GitHub API, shows that each call is accepted, creates or updates the right Deployment, and records the right state and description; a bad-usage call is caught by the test rather than in production.

## Comments

### Evidence (2026-10-03, host session)

- `deploy.log` on the staging host repeats `unknown argument: success` and `unknown argument: in_progress`, each followed by the usage block, on every deploy (for example lines 44453, 44610 and 44651, around the 15:15 and 16:30 UTC deploys).
- `gh api 'repos/andrianm28/makam/deployments?environment=staging'` returns `[]`. Until 2026-10-03, `staging.env` also had no `MAKAM_GITHUB_TOKEN`. It now has one (the same fine-grained token as production, Deployments: write), so after this fix the next staging deploy should create a Deployment with states.
- The installed `/opt/makam-v1/bin/makam-deploy` is byte-identical to `main`'s `deploy/bin/makam-deploy` at `414d608b`.
- After the merge, the host needs `deploy/install-host.sh` from an updated `main` checkout, so the fixed scripts reach `/opt/makam-v1/bin`. Then: a staging deploy, the "Smoke test staging" workflow for its digest, and "Promosikan ke produksi".
