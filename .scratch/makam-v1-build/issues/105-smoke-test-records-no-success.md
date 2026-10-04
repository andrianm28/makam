# The staging smoke test never records a pass, so promotion always refuses

Status: ready-for-agent
Blocked by: none (it blocks the first promotion: 65, 72)
Spec: ticket 72 (staging smoke test recorded against the digest; promotion needs a passed smoke test); `docs/ops/runbook.md` "Promoting to production"; found on 2026-10-04 while running the first promotion

## What to build

`.github/workflows/staging-smoke.yml`, step "Record the result against the digest", posts the smoke result as a status on the staging Deployment for that digest. `promote.yml` refuses any digest without a `success` status whose description starts `smoke test against dev.makam.co.id for <digest>`.

The step begins `[ "$RESULT" = success ] || state=failure`, so on a pass `state` is never set. GitHub then rejects the status: `gh: Validation Failed (HTTP 422) … "field":"state","message":"state is not included in the list"`. A failing run records `failure` correctly, but a passing run fails at its last step and records nothing. So no digest can ever be promoted.

Record `success` when the job passed and `failure` otherwise, with the description `promote.yml` expects.

## Acceptance criteria

- [ ] A passing smoke run records a `success` status on the staging Deployment for its digest, with the description `smoke test against dev.makam.co.id for <digest>: success`. The step itself ends green.
- [ ] A failing smoke run still records `failure` with the same description shape.
- [ ] The description stays a prefix match for `promote.yml`'s check (`startswith("smoke test against dev.makam.co.id for " + $digest)`).
- [ ] A test fails if the step can post an empty or unknown `state` again. For example, a tooling test runs the step's shell with `RESULT=success` and `RESULT=failure` against a fake `gh` and checks the state each one posts. Follow the style of the tooling tests in `tests/tooling/`.

## Comments

### Evidence (2026-10-04, orchestrator on the VPS)

- Run 37168614156 (`workflow_dispatch`, 01:38Z): the Playwright smoke passed (`RESULT: success`, digest `sha256:7c07a86b…`), then "Record the result against the digest" failed with the HTTP 422 above.
- Run 37150149670 had failed earlier for another reason: staging served an empty browser DSN. That is fixed on the host; `NEXT_PUBLIC_SENTRY_DSN` is now in `staging.env`.
- Ticket 102 is merged and works on the host: staging Deployment 6832434792 has `in_progress` and then `success`, with `ref` as the bare SHA.
