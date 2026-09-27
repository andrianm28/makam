# Image retention and disk hygiene on the shared host

Status: ready-for-agent
Blocked by: 72
Spec: Implementation Decisions > Architecture; ADR 0002 (second amendment of 2026-09-26)

## What to build

Decided with the user on 2026-09-26, after the shared host's disk filled up. Keep makam's footprint on the host bounded without touching other projects.

## Comments

- 2026-09-27 — Orchestrator: Spec axis on this branch. **Nothing in this ticket's file had been touched**, which is itself a finding, and one that matters most here: the builder deliberately deleted **no real image** and called the 14,7 GB an owner decision — but that decision existed only in a report to the orchestrator. Merging it that way leaves the host at 91 % with the new alarm ringing and nothing in the repo saying what was decided or by whom. Recorded here now; it stays the owner's call.
  - **The runbook tells you to look, not what to do.** "What to do when it warns: `makam-prune-images` first … then `docker image ls | head -50` … never a prune." AC 4 is literally satisfied, but there is no action for the case that actually happens on this host — the disk pressure is mostly **other projects' images**, which this ticket must never touch — and nothing escalates to the owner. Say what to do when the space is not ours, and who to tell.
  - **There is no `--dry-run` for the host prune.** The ghcr side has `dry_run`; `makam-prune-images` does not. Worse, the runbook's code block runs the **destructive** command first and shows `docker image ls` as the "preview" *afterwards*. For a first run on a shared host that ordering is backwards. Add a dry run that lists exactly what it would remove and deletes nothing, and make the runbook show it before the real thing.
  - **"in this repository" is overstated.** AGENTS.md and the runbook both claim `tests/tooling/image-retention.test.ts` fails the build if a prune without a name appears anywhere in the repository. It scans `deploy`, `scripts` and `.github` (ts/mts/mjs/sh/yml) only — not `package.json`, `docker-compose.yml`, `e2e/`, or the docs. Either widen the scan or narrow the claim. (It also only strips `#` comments, so a `// docker image prune` inside a TS comment is a false positive — cheap to fix while widening.)
  - **One sentence is missing about why "3 versions per env" is safe.** It holds only because `rollback.yml` re-resolves a digest from ghcr rather than a local tag. State that dependency explicitly, or a future change to the rollback path silently breaks the guarantee the retention set is built on.
  - **Out of ticket, and it needs its own ticket:** the fix to the top-level `await` in `scripts/migrations/deployed-release.ts`. It is correct and necessary here (the retention CLI imports that module), but it changes what the migration-upgrade test in `ci.yml` actually exercises — the test had been silently falling back to `ghcr :latest` and now reads a real successful deployment. That deserves a ticket of its own with a test, not a mention here.
  - Verified good: the tests assert real outcomes against a fake inventory and check *which* images were asked to be removed; `deployedDigest` reuse is sensible; the `makam-deploy` change is **required**, not scope creep — AC 1 replaces its 5-tag retention, and the call site is unchanged.

## Acceptance criteria

- [ ] Every deploy (the host's `makam-deploy`) keeps at most the last 3 makam image versions per environment on the host (the running one and the previous one always among them) and removes only `ghcr.io/andrianm28/makam` images; other projects' images are never touched.
- [ ] A monthly GitHub Actions workflow deletes ghcr `sha-*` versions older than 30 days, except any currently deployed to staging or production and any `v*` release tag.
- [ ] Dev work: AGENTS.md tells builder agents to remove their own compose stack, dev image and `node_modules` when a ticket is merged, and names the per-worktree image tag pattern so the cleanup is exact.
- [ ] A disk check (on the existing health timer or GlitchTip/uptime alarm) warns when the root disk passes 85%.
