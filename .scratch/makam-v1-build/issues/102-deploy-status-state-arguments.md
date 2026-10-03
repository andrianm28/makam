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

### Build (2026-10-03)

- `deploy/bin/makam-deploy`: the five remaining state calls now use `state --state <s> --description "<text>"`. The unsigned refusal (before `begin`) is **log-only**: it has no Deployment to update, and a stale `.deployment-id` from the previous run would have received a false `failure` on the wrong Deployment. deploy.log already gets the `ERROR refusing ...` line.
- `deploy/bin/makam-deploy-status`: header documents exactly the accepted args; `begin` removes the old `.deployment-id` first (a failed begin no longer lets this run's states land on the previous Deployment); the "deployment N: state" log line is written only when the POST succeeded.
- Found and fixed: `makam-deploy-status` was committed as mode 100644 (not executable), so `status()`'s `[ -x ... ]` check could skip it silently wherever the installer keeps the mode. Now 100755.
- Tests: `tests/tooling/makam-deploy-status.test.ts` (fake curl; begin+success, in_progress, failure, positional form is a 64, non-2xx and no token exit 0 without usage text, stale id, makam-deploy call shapes). `npx vitest run tests/tooling`: 25 files, 340 tests passed; lint and typecheck exit 0.
- Unverified: a real run on the host and the live GitHub API; the installed copy in /opt/makam-v1 must be refreshed by the usual install step.

### Review (2026-10-03, orchestrator on the VPS; fixed point origin/main 23362717, head 3dc445e1)

Two axes, run as parallel reviewers (sonnet). Both reported "Hard: 0"; the orchestrator raised Spec's third soft finding to HARD after reproducing it (below).

**Standards** (Hard: 0, soft: 3; the vitest file ran 9/9, exit 0)
- SOFT: `tests/tooling/makam-deploy-status.test.ts:93-103` greps `makam-deploy`'s source for the call shapes (`>=5` count, regex). That is a source-shape assertion, which AGENTS.md says to avoid; it is brittle to reformatting. Prefer running the calls against stubs.
- SOFT: `:60`, `:72` only assert the log does not match `/usage/i`; the "non-2xx" test (`:70-73`) never checks the "one line" its title claims.
- SOFT: `:20-30` needs host `jq`, `bash` and `grep`; nothing skips or fails clearly when `jq` is missing.

**Spec** (Hard: 0 as reported, soft: 3)
- AC1 PARTIAL/MET, AC2 MET, AC3 MET by reading (begin sends `payload.image_digest`; the smoke workflow finds the Deployment by digest and is unaffected by `rm -f .deployment-id`), AC4 PARTIAL, AC5 PARTIAL.
- SOFT: AC4 is not one line. `status()` (`makam-deploy:152`) sends stderr into deploy.log and `curl -sS` prints `curl: (22) …` there, so a failure leaves two lines; the tests' fake curl never checks the line count.
- SOFT: AC5's makam-deploy side is a static regex, not "running makam-deploy's status calls" as the AC says.
- SOFT → **HARD (reproduced by the orchestrator)**: `begin` sends `ref: $TAG`, and `TAG=sha-<rev>` (`makam-deploy:221`). GitHub rejects that. The staging deploy at 2026-10-03T18:28:26Z logged `curl: (22) The requested URL returned error: 422` and then `[deploy-status] could not create the GitHub deployment; continuing without it` (host deploy.log line ~44754, with MAKAM_GITHUB_TOKEN set). `gh api repos/andrianm28/makam/commits/sha-bc71fe22…` answers "No commit found for SHA: sha-…", while the bare SHA resolves. `promote.yml:67` also reads `.ref` as the commit SHA. Without this fix no Deployment is ever created, so AC3 fails on the host.

**Fix list for the builder**
1. HARD: the Deployment `ref` must be the bare commit SHA (40 hex, no `sha-` prefix), for both staging and prod; a test asserts the body's `ref` is the bare SHA when makam-deploy passes `sha-<rev>`.
2. AC4: a failed call leaves exactly one line in deploy.log (no `curl: (22)` line); a test asserts the line count.
3. AC5: exercise makam-deploy's real status calls (for example run its `status` path, or the script with `--local` and stubs) instead of grepping its source. If that is not feasible without a large refactor, say why under "Spec gaps and decisions for the owner" rather than keeping the grep silently.
4. The tests skip with a clear message, or fail with a clear message, when `jq` is missing.

### Fix pass (2026-10-03)

1. HARD, done: `makam-deploy-status begin` sends `ref` = the tag without its `sha-` prefix (the bare 40-hex commit), for staging and prod. Test (in `makam-deploy.test.ts`, running the real `makam-deploy` with the real `makam-deploy-status` and a fake curl): the Deployment body's `ref` is the bare SHA, never `sha-...`, and the statuses are in_progress then success on the same Deployment.
2. Done: `call()` sends curl's stderr to /dev/null, so a failed call leaves exactly one `[deploy-status]` line. Tests assert the line count, both on the script and through a full deploy where GitHub answers 422 (exit 0, no `curl:` line).
3. Done: the grep of makam-deploy's source is gone. The real script now runs on the stubs (healthy deploy, failed migrate records failure, unsigned image records no state).
4. Done: a test fails with "install jq: makam-deploy-status needs it" when jq is missing.
- Counts: `npx vitest run tests/tooling` 25 files, 343 tests passed (exit 0); lint 0; typecheck 0.
