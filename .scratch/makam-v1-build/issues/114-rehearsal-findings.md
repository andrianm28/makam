# Rehearsal findings: first production deploy, long failure statuses, release after rollback, preflight probe cleanup

Status: ready-for-agent
Blocked by: none (owner approved 2026-10-04: "ya 114")
Spec: ticket 72 (rehearsal), ticket 102 (Deployment statuses), ticket 106/107/108; `docs/ops/runbook.md` "Rehearsal of the first production deploy"; plan /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (G1)

## What to build

The production rehearsal (G1) on 2026-10-04 promoted `v2026.10.04-1` (digest `sha256:344c9503…`, `c04dd9c9`) and deployed it on 127.0.0.1:3100. Every gate held, but four defects showed.

1. **The first production deploy cannot snapshot.**
   - `deploy/bin/makam-deploy`'s `snapshot()` runs `compose exec -T postgres pg_dump`. On a host where makam-prod has never run, there is no postgres container, so it logs `ERROR pg_dump failed; refusing to migrate production` and exits 1.
   - The operator had to start Postgres by hand. `deployed.env` was empty, so Compose also demanded `MAKAM_TAG` just to start Postgres: `MAKAM_TAG=sha-… docker compose … up -d --wait postgres`.
2. **A failed deploy's status is never recorded.**
   - The description `"$TAG ($DIGEST) never became healthy; rolling back to $PREVIOUS"` is about 200 characters, and GitHub caps a Deployment status description at 140.
   - The POST is refused; deploy.log says `[deploy-status] could not record status failure for deployment 6840201605`.
   - The other descriptions fit today; the success one must keep ending in `(<digest>) healthy`, which promote.yml reads.
3. **The release becomes a tag after an automatic rollback.** After `makam-deploy`'s automatic rollback, `/api/health` reports `release: "sha-c04dd9c9…"` (the tag) instead of the bare commit. `roll_back` exports `MAKAM_RELEASE=$PREVIOUS`, the tag. The staging smoke then records `failure` (its release must equal the Deployment ref), and GlitchTip names the wrong release.
4. **The preflight probe is never deleted.**
   - `deploy/bin/makam-preflight` reads the probe Deployment's id with a greedy `sed` over single-line JSON. It took the `creator.id` (25896940, the owner's user id) instead of the Deployment id (6840219276).
   - Marking it inactive and deleting it then answered 404, the line FAILed, and the probe stayed in the `preflight` environment (removed by hand).
   - Read the id with `jq` (already a dependency of the status script) or an anchored match on the top-level `id`.

## Acceptance criteria

- [ ] **First deploy:** on a host whose makam-prod stack has never run, `makam-deploy --env prod --digest …` starts Postgres itself, waits for it to be healthy, and then snapshots (an empty database dumps fine) before migrating. It does not need a `MAKAM_TAG` already in `deployed.env`. A second deploy behaves as today. Tested with the existing fakes in `tests/tooling/makam-deploy.test.ts`.
- [ ] **Status length:** every status description `makam-deploy-status` posts is at most 140 characters, and the success description still ends in `(<digest>) healthy`. The failure descriptions name the tag and what happened, shortened where needed (for example, the short commit instead of the full digest). Tested in `tests/tooling/makam-deploy-status.test.ts`: a too-long description is cut or shaped to ≤140, and the success shape is unchanged.
- [ ] **Release after rollback:** after an automatic rollback, `MAKAM_RELEASE` (and so `/api/health` `release`) is the bare commit of the restored release, as on a normal deploy. Tested.
- [ ] **Probe id:** the preflight reads the probe Deployment's own top-level `id`, so marking it inactive and deleting it succeed and the line PASSes. Tested with a fake GitHub reply where `creator.id` appears after the top-level `id` on one line.
- [ ] **Runbook:** "Rehearsal of the first production deploy" and "Hari switch" need no hand-started Postgres; the 140-character rule is noted where statuses are described.

## Comments

- 2026-10-04: Filed by the orchestrator from the G1 rehearsal; the owner approved ("ya 114"). Not money code. Evidence: `/opt/makam-v1/prod/deploy.log` (snapshot refusal at 11:06:45Z; forced rollback at 11:10:22Z, `could not record status failure`), `/tmp/preflight.txt` (the probe line).

### Build (2026-10-04)

Built on `ea371143` (origin/main plus ticket 109, the MB3 merge), branch `ticket-114-rehearsal-findings`. The four findings, each test first (the red run failed 22 new tests for the reasons below), then the change.

**What changed**

1. **First deploy** (`deploy/bin/makam-deploy`, `snapshot()`): when `running postgres` is false it logs `postgres is not running in makam-prod (a first deploy?); starting it ...`, runs `compose up -d --wait --wait-timeout 120 postgres` (waits until healthy), logs `postgres is up and healthy`, then dumps as before. It runs after the script has exported `MAKAM_TAG`, `MAKAM_DIGEST`, `MAKAM_DEPLOY_REF` and `MAKAM_RELEASE` (the order was already right: the exports are above step 3), so an empty `deployed.env` is enough. A Postgres that already runs is left alone: a second deploy makes no `up` call, so it behaves as today. A Postgres that will not start stops the deploy before `migrate` (exit 1, `ERROR postgres would not start; refusing to migrate production`).
2. **Status length**: `makam-deploy`'s never-healthy line is now `<tag> never became healthy; rolling back to <tag>` (127 characters with two full tags; the digest it used to name is in the Deployment's payload and in the success line). `makam-deploy-status` cuts any description over 140 characters (counted in characters, by jq) to exactly 140: the first 47, `...`, the last 90, so the success line's ending `(<digest>) healthy` (81 characters) is never cut off. The success line (126 characters) is sent unchanged; the Deployment's own description gets the same cut. The script's usage text now prints its whole header (it was a fixed `2,19p`).
3. **Release after rollback**: `roll_back` exports `MAKAM_RELEASE` from the commit the previous deploy recorded in `deployed.env` (read before `record_release` overwrites the file), falling back to the previous tag without its `sha-`. `deployed.env` is still put back verbatim.
4. **Probe id** (`deploy/bin/makam-preflight`): the id is read with `jq` from the top level (`(.id // empty) | select(type == "number" and . > 0 and . == floor)`), so the creator's id that follows it on the same line is never taken. `jq` is now a dependency of that line, so a host without it gets one FAIL (`jq is not installed: ...`) before any Deployment is created; and a 201 whose reply has no id gets its own FAIL with the by-hand cleanup, instead of the false "refused (HTTP 201)".
5. **Runbook**: "Reading a deploy in GitHub" (the 140-character rule, the bare commit after a rollback), "Production safety" (Postgres start), "Rehearsal of the first production deploy" (a paragraph after the commands, and the forced-rollback paragraph), "Hari switch" step 2, the Staging deploy list (the 140 limit) and the preflight table's GitHub row (`jq`).

**Decisions**

- Postgres is started only when it is not running (not an unconditional `up`), so a host that already runs it sees no new Compose call and no recreate before the snapshot.
- Added beyond the acceptance criteria (small, in the same function, say so if unwanted): both snapshot failure paths (Postgres will not start, `pg_dump` fails) now post a `failure` status (`pg_dump failed on <tag>; <previous> still running`, `postgres did not start for <tag>; ...`). Before, they left the Deployment `in_progress` for good, which is the same "a failed deploy's status is never recorded" as finding 2.
- The restored release's commit comes from the previous deploy's own record, not from the image label of the restored image: no extra docker call, and it is by construction what that deploy exported.
- Fakes in `tests/tooling/makam-deploy.test.ts` made closer to the real thing: the fake `docker` refuses any `compose` command without `MAKAM_TAG` (from the process or from deployed.env), as Compose does with `x-app`'s image, so the test of the first deploy fails if Postgres is started before the exports (mutation checked); `FAKE_POSTGRES_ABSENT` models a host whose stack never ran; `FAKE_REVISION_FROM_TAG` gives each tag its own revision label, so a rollback run under the failed release's commit fails the test (mutation checked); the fake `up` records the `MAKAM_RELEASE` it ran with. The fake GitHub in `tests/tooling/makam-preflight.test.ts` can reply with the real one-line body (creator id after the Deployment's) and answers 404 to any id that is not the Deployment's, as GitHub did in the rehearsal.
- `tests/tooling/go-live-docs.test.ts` had one ticket 113 assertion that the runbook says `/api/health` reads `sha-<commit>` after an automatic rollback: that was the defect, so it now asserts the bare commit.

**Tests** (read from whole logs): `npx vitest run tests/tooling/makam-deploy.test.ts tests/tooling/makam-deploy-status.test.ts tests/tooling/makam-preflight.test.ts` is 3 files, 132 tests passed (deploy 52, status 15, preflight 65). With `go-live-docs`, `katalog-lama-runbook`, `nginx-blocks`, `systemd-units`, `image-retention` and `tests/support/global-prune.test.ts`: 9 files, 290 passed, 3 failed; the 3 failures are all in `go-live-docs.test.ts` and fail the same way on the untouched base `ea371143` (the `CONTEXT.md` Data Contoh entry and two assertions on the runbook's Data Contoh section, from ticket 109 against ticket 113's tests): not touched here. `npm run lint` exit 0 (6 warnings, none in these files), `npm run typecheck` exit 0. No build run (nothing in `src/` changed).

**Spec gaps and decisions for the owner**

- None blocks an acceptance criterion. Two choices for the owner to confirm: the extra `failure` statuses above, and `jq` now being a FAIL on the preflight's GitHub line when missing (the host has it today: the status script logged `could not record status failure`, not `jq is not installed`).
- Unverified, because nothing here touches Docker or GitHub: `compose up -d --wait postgres` on a host whose stack never ran (the fake models it), and GitHub counting the 140 characters as characters (the cut is character-based and every description `makam-deploy` writes is ASCII).
