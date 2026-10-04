# Promotion and rollback work on their first run

Status: ready-for-agent
Blocked by: none (blocks the first promotion: 72, 65)
Spec: ticket 72 (signed deploys, promotion, rollback); `docs/ops/runbook.md` "Promoting to production", "Rolling back"; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

`.github/workflows/promote.yml` and `rollback.yml` have never run, and reading them shows they fail on first use. In the worst case they leave a production-signed digest without a release.

Defects in `promote.yml`:
- The tag step's `gh release list` (~line 51) has no `GH_TOKEN` and no repository.
- The `check` job never exports `tag`, but `sign-and-release` reads `needs.check.outputs.tag` (~94). So the digest is signed with the production key first, and then `gh release create ""` fails.
- The "healthy" check (`any(.state=="success")`, ~71-77) is also satisfied by the smoke test's own status. A digest that failed and rolled back on staging can therefore be promoted.

Defect in `rollback.yml`: `:50` runs `gh release view` without a repository, and `2>/dev/null` turns the real error into "no such release".

Make both workflows correct on their first run, and make a smoke result provably belong to the digest that is actually running.

## Acceptance criteria

- [ ] **`promote.yml`:**
  - Every `gh` step has `GH_TOKEN` and `GH_REPO`.
  - `check` exports `tag`.
  - The expected tag's N counts the non-draft `v` releases created that day in WIB, plus 1.
  - Order: create the release as a draft, then sign the digest with the production key, then publish the release. A re-run with the same tag after a failure completes instead of failing. No production signature can exist without a release (draft or published) naming that digest.
- [ ] **"Healthy" means the host's own status.** `promote.yml` requires a status on that Deployment whose description ends `(<digest>) healthy` (written by `makam-deploy`); the smoke status alone never counts. It still requires the smoke `success` status for the digest.
- [ ] **`rollback.yml`:** finds the release with `GH_REPO` set and reports the real error when the lookup fails.
- [ ] **`staging-smoke.yml`:**
  - Also runs `on: deployment_status`, for staging and state `success`, so a deploy is smoked within minutes instead of waiting for the 15-minute schedule.
  - Records `failure` when `/api/health` reports a `release` different from the Deployment's ref.
- [ ] **`/api/health`** also returns `release` (the running commit, `SENTRY_RELEASE`) and `rilisTerbuka` (the open release number), with no secret (`src/app/api/health/route.ts`, `src/server/health.ts`, tests).
- [ ] **CI:** a pinned (SHA) actionlint job in `.github/workflows/ci.yml` lints every workflow.
- [ ] **Tests:** `tests/tooling/promote-workflow.test.ts` covers the step order and outputs, the tag rule, the healthy rule and the GH_REPO use; `tests/tooling/staging-smoke-record.test.ts` is extended for the release check.
- [ ] **Runbook:** "Promoting to production" and "Rolling back" are updated.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB1). Not money code. Verified in source on origin/main 09f3b8b8.

### Build (2026-10-04)

Branch `ticket-106-promotion-path-first-run`, built on origin/main 0fd6bf41. Every acceptance criterion is delivered as written; the decisions below are where the criterion left a choice, and none of them narrows one.

**What changed**

- `promote.yml`: every `gh` step carries `GH_TOKEN` and `GH_REPO`. `check` exports `tag`, `digest` and `sha`. N is the count of non-draft `v` releases published that day in WIB, plus 1 (the runner's UTC day is never used). `sign-and-release` creates the release as a **draft** naming the digest, then signs with the production key, then **publishes** it by id. A re-run with the same tag finds the draft it left, updates its notes and completes. "Healthy" is now the host's own success status ending `(<digest>) healthy`; the smoke status alone no longer counts, and a passed smoke test is still required.
- `rollback.yml`: `gh release view` runs with `GH_REPO`; only gh's own "release not found" reads "there is no release X", any other error is printed as it is. A draft is refused. The recorded Deployment now has `required_contexts: []` and an object payload, and the status description is cut at GitHub's 140 characters (the full reason is in the job summary).
- `staging-smoke.yml`: also runs `on: deployment_status` (job `if`: staging, state `success`, never the smoke's own statuses). The Record step reads `/api/health` and records `failure` unless `release` equals the Deployment's ref.
- `/api/health` returns `release` (`SENTRY_RELEASE`) and `rilisTerbuka` (asked the way every gate asks, `rilisAktif()`); `src/server/health.ts`, `src/app/api/health/route.ts`, test in `route.test.ts`.
- `ci.yml`: job `actionlint` (`rhysd/actionlint:1.7.12@sha256:b1934ee5...`, no file arguments, so every workflow, shellcheck on every script); `deploy-gate` needs it. It found a real shellcheck finding in the migrations job (`ls | grep`, SC2010): replaced by `find drizzle -maxdepth 1 -name '*.sql' -printf '%f\n'`, same 64 names (checked by diff). actionlint 1.7.12 with shellcheck 0.11.0 is clean on all five workflows, run locally from the release binaries.
- Tests: `tests/support/workflow.ts` (a small reader of the workflows' shape plus a harness that runs a step's own script against a fake `gh`/`curl`/`date`, with the real jq, the step's own env as the only environment, and `GH_REPO` required like on a runner with no checkout), `tests/tooling/promote-workflow.test.ts` (43 tests: step order and outputs, tag rule, healthy rule, GH_REPO use, draft/re-run, rollback), `tests/tooling/staging-smoke-record.test.ts` extended (21 tests, incl. the release check), `tests/tooling/ci-workflow.test.ts` (actionlint job and gate). Three mutations of promote.yml (draft guard removed, `createdAt` instead of `publishedAt`, the healthy check removed) each failed the tests.
- Runbook: "Promoting to production", "Rolling back", "The staging smoke gate", "Reading a deploy in GitHub", the CI job list and the `/api/health` fields.

**Decisions**

1. **`publishedAt`, not `createdAt`, for "created that day in WIB".** GitHub's `created_at` of a release is the date of its commit, so a promotion of yesterday's commit would not count today and the day's second tag would collide with the first.
2. **The newest smoke result for the digest must be a pass** (not "any success"), so a failure recorded after a success blocks until a new pass. The AC asks for the smoke `success` status; this only adds that it be the latest.
3. **All pages of statuses are read.** The smoke test adds a status every 15 minutes, so the host's `healthy` status falls off the default first page of 30 after about 7.5 hours; without paging promotion would refuse a healthy digest the next morning.
4. **Release and draft through the REST API** (list, generate-notes, create, patch by id), not `gh release create/edit`: a draft has no tag, and these are the documented calls. A draft is reused only if its notes name the same digest; a draft naming another digest is refused, because that digest may already carry the production signature and its release must keep naming it.
5. **The smoke job's fallback that created a Deployment for an unknown digest is removed** (it could shadow the real Deployment, which has the host's `healthy` status, and block promotion). The job resolves the Deployment once (id, digest, ref), then checks out the commit staging runs (a `deployment_status` event for a bare-SHA Deployment has no branch for checkout to use).
6. Owner inputs reach scripts through env, never pasted into the script text, and every script runs under `shell: bash` (pipefail), so a failing `gh | jq` is not read as "no releases".
7. Deployment payloads are read as an object or as a JSON string (what `-F payload=...` stores, and what `scripts/migrations/deployed-release.ts` already accepts).

**Spec gaps and decisions for the owner**

None blocking. For awareness (not changed, outside this ticket):

- `ci.yml`'s migrations job selects `.state == "success"` on the objects of `GET /deployments`, which carry no `state` field (verified on a public repo's list), so its baseline probably always falls back to `latest`.
- `makam-deploy`'s automatic roll back exports `MAKAM_RELEASE=$PREVIOUS` (the tag `sha-<commit>`), so after one `/api/health.release` reads `sha-<commit>`, not the bare SHA. For this ticket that is harmless (the failed Deployment's ref differs anyway, so the smoke records `failure`), but ticket 107 may want the bare SHA there.
- A staging Deployment whose digest failed and rolled back stays the newest, so promotion refuses until a healthy digest is deployed (as designed); promoting the digest staging still runs needs it redeployed once.

**Tests** (read off whole logs): `npx vitest run` on `tests/tooling/promote-workflow.test.ts`, `staging-smoke-record.test.ts`, `ci-workflow.test.ts`, `src/app/api/health/route.test.ts` and the runbook readers (`nginx-blocks`, `makam-preflight`, `katalog-lama-runbook`, `makam-deploy-status`, `image-retention`): 9 files, 156 tests, all passed, exit 0 (43 in promote-workflow, 21 in staging-smoke-record). `npm run lint` 0 errors (6 warnings, all in files this ticket does not touch), `npm run typecheck` clean. No build was run (nothing here needs one). **Unverified**: nothing ran on GitHub, so the first real `deployment_status` run, `generate-notes` with a start tag, and publishing a draft by id are checked only against the documented API and the fake `gh`.
