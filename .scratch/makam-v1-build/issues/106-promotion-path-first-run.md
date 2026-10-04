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

- 2026-10-04 (ticket thread, branch `ticket-106-promotion-first-run`): All acceptance criteria delivered. Actionlint 1.7.12 (digest-pinned) is clean on every workflow; workflows were not run.
  - Review 1 (Standards: 0 blocking, 2 should, 3 nit; Spec: 0 blocking, 3 should, 2 nit), all fixed red-test-first: re-run reusing a draft now refuses if its notes name another digest before signing; drafts found via list + API, not `gh release view`; tag count uses `publishedAt`; newest smoke status decides; `TODAY_WIB` override removed (tests fake `date`); `/api/health` validates `SENTRY_RELEASE` with the build Zod schema; `vi.stubEnv`; `GH_REPO` in staging-smoke.
  - Re-review: 1 blocking (`gh api --paginate` emitted one array per page, false refusal past 100 releases) and 1 nit (digest match too loose); both fixed (`--slurp`, match the "Production digest" line).
  - `yaml` added as a devDependency (TDD-exempt: deps) for the workflow tests.
  - Spec gaps and decisions for the owner: none.
