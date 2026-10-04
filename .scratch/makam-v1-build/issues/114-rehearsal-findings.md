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
