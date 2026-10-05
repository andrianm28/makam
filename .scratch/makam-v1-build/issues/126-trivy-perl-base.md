# Runtime image: fixable CRITICAL in Debian's perl-base fails the main CI's Trivy gate

Status: resolved
Blocked by: none (found 2026-10-06: main CI fails since 1c1b1c32, so staging stays on f56e1ccc and G4 cannot start)
Spec: AGENTS.md, Tests ("The same `main` build scans the image with Trivy and fails on any CRITICAL vulnerability with a fix"); `.trivyignore` rules

## What to build

**The failure.** Since 2026-10-05 every `main` CI run fails the job "Image scan and SBOM (Trivy, fail on fixable CRITICAL)". Run 37356138344 reports "Total: 3 (CRITICAL: 3)", including `perl-base` CVE-2026-13221, installed 5.36.0-7+deb12u3, fixed in 5.36.0-7+deb12u4. The CVE is new: f56e1ccc passed the same gate on 2026-10-04.

**The effect.**
- No new image is signed, so the staging pull deploy keeps f56e1ccc.
- Production's running image (f56e1ccc) carries the same package.

**The image.** The `Dockerfile` pins `node:22-bookworm-slim@sha256:43ac6c60…` and its `runner` stage runs `apt-get update` and installs `chromium-headless-shell fonts-dejavu-core`, without upgrading the base packages.

**Fix in the image, not with an exception:**
- in the `runner` stage, upgrade the Debian packages, so that the security fixes in bookworm-security land at build time;
- move the base image pin to the current `node:22-bookworm-slim` digest, if it is newer. Read the digest with `docker buildx imagetools inspect`, without pulling. Pin it by digest, with the tag in a comment.

## Acceptance criteria

- [ ] **The built image has no fixable CRITICAL:** `perl-base` is 5.36.0-7+deb12u4 or later, and the other two CRITICALs of the run are gone.
- [ ] **Base image pinned by digest** (AGENTS.md), and the tooling tests over the `Dockerfile` stay green.
- [ ] **No `.trivyignore` exception** is added for these CVEs.
- [ ] **Evidence:** after the merge, the `main` CI Trivy job passes, and staging deploys the new digest.

## Comments

- 2026-10-06: Filed by the orchestrator from the failing `main` CI runs 37328185486 and 37356138344. It blocks G4 (staging must run the fixed tickets 118–125). A security and ops fix, merged under the standing authorization.

### Build (2026-10-06)

Branch `ticket-126-trivy-perl-base`, on d1331de7: `acc53b34` (the Dockerfile fix and its test) and `eb4ede9c` (the cache key, a separate commit that can be reverted alone).

**What changed**
- `Dockerfile`, `runner` stage: one layer now runs `apt-get update`, `apt-get upgrade -y --no-install-recommends`, `apt-get install -y --no-install-recommends chromium-headless-shell fonts-dejavu-core`, `rm -rf /var/lib/apt/lists/*`.
- Base pin **unchanged**: `docker.io/library/node:22-bookworm-slim` resolves today (registry `Docker-Content-Digest` of the OCI index) to `sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`, which is the digest already pinned. There is no newer one to move to, and that digest carries the old perl-base.
- `eb4ede9c`: the apt layer sits behind `ARG DEBIAN_PACKAGES_AS_OF=""`. The `image` job in `ci.yml` has a new step `id: day` (`date -u +%F`, the same idiom as the scan job) and passes `DEBIAN_PACKAGES_AS_OF=<UTC day>-<run attempt>` in `build-args`. `docs/ops/runbook.md` ("scan") says what it is for.
- `tests/tooling/dockerfile-runtime-image.test.ts` (new, 6 tests): the upgrade sits between `update` and `install`; the install is `-y --no-install-recommends` and the lists are removed in the same layer; every base image is pinned by tag and digest; the layer as it was before this ticket is reported as upgrading nothing; the Dockerfile's parser reads continuations and comments; the layer sits behind a build argument that `ci.yml` feeds from a step computing the UTC day and the attempt.
- No `.trivyignore` change.

**Evidence read** (nothing built, nothing pulled)
- Failing run 37356138344, Trivy job 111920399086: `Total: 3 (CRITICAL: 3)`, **all three on `perl-base`** (CVE-2026-13221, CVE-2026-42496, CVE-2026-8376), installed 5.36.0-7+deb12u3, fixed 5.36.0-7+deb12u4; target `debian 12.15`; every `node-pkg` row is 0. One package upgrade clears all three.
- `https://security.debian.org/debian-security/dists/bookworm-security/main/binary-amd64/Packages.xz` (Release of 2026-10-05 17:39:55 UTC) lists `perl-base 5.36.0-7+deb12u4` (`pool/updates/main/p/perl/perl-base_5.36.0-7+deb12u4_amd64.deb`); Debian security tracker, CVE-2026-13221: source `perl`, bookworm (security) 5.36.0-7+deb12u4 fixed (DLA-4821-1). Its `Pre-Depends` are `libc6 (>= 2.35)`, `libcrypt1`, `dpkg`: no new package, so `apt-get upgrade` cannot hold it back.
- Build job 111918898754 of the same run: `[runner 1/7] RUN apt-get update && apt-get install ...` printed no apt output and fetched a 210.51 MB layer blob: it was restored from the `type=gha` cache, not executed. That is why `eb4ede9c` exists.

**Decisions**
1. `apt-get upgrade` of everything, not `install --only-upgrade perl-base`: the next fixable CRITICAL in any installed package then lands the same way, and `upgrade` never installs or removes a package.
2. `docker buildx` is not installed on this host, so the digest was read with the registry's HTTP API (token from `auth.docker.io`, `HEAD /v2/library/node/manifests/22-bookworm-slim`, OCI index `Accept`), which is the same value `imagetools inspect` prints and pulls nothing.
3. The cache key carries the run attempt as well as the day, so that "Re-run all jobs" on a failed scan rebuilds the layer at once instead of waiting for the next UTC day. "Re-run failed jobs" does not rebuild the image.
4. The commit trailer is `Co-Authored-By: Claude Sonnet 5.5`, the model that wrote the commits; the brief asked for `Claude Opus 5.5`.

**Spec gaps and decisions for the owner**
- The ticket says to fix it in the `Dockerfile`; `eb4ede9c` also touches `.github/workflows/ci.yml` (one step, one build argument). Without it the upgrade lands when the base digest moves or the cache entry is evicted, not "at build time" as the ticket's rationale says, because CI restores that layer from the cache. If you do not want the CI change, `git revert eb4ede9c`: the Dockerfile fix stays, and the next fixable CRITICAL that appears after the layer is cached needs a new base digest (Dependabot, weekly) to clear.
- The fourth acceptance criterion (Evidence: after the merge the `main` CI Trivy job passes and staging deploys the new digest) can only be met after the merge. The first `main` build rebuilds the layer, because the instruction changed.

**Tests** (with `MAKAM_TEST_PG=shared`, this worktree's own database on `makam-testpg`)
- Red first: `dockerfile-runtime-image.test.ts` failed on the upgrade (`expected -1 to be greater than 0`, 1 failed | 4 passed of 5), then on the missing key (1 failed | 5 passed of 6); green after each change.
- Final run, one whole log, exit 0: **15 files, 375 tests passed** (`npx vitest run` over `tests/tooling/` `dockerfile-runtime-image`, `ci-workflow`, `image-retention`, `types-node-pin`, `collect-sourcemaps`, `upload-sourcemaps`, `go-live-docs`, `katalog-lama-runbook`, `makam-preflight`, `nginx-blocks`, `makam-deploy`, `systemd-units`, `ticket-workflow`, plus `tests/trivyignore.test.ts` and `tests/support/global-prune.test.ts`: every test that reads the Dockerfile, a CI file, `.trivyignore`, the runbook or the tickets).
- `npm run lint` exit 0 (0 errors, 6 existing warnings, none in these files); `npm run typecheck` exit 0 (it caught a `/s` regex flag in my test, fixed).
- Not run: Trivy and a Docker build (CI only; the host's disk is at 84%), `npm run build` (not needed), the full suite.

### Review and merge (2026-10-06, orchestrator; fixed point d1331de7, head 3da85703)

- **Two-axis review:** the Standards and Spec reviewers (sonnet) ran in parallel; Standards Hard: 0, soft: 4, Spec Hard: 0, soft: 3.
- **The fix:**
  - The `runner` stage now runs `apt-get upgrade -y` behind `ARG DEBIAN_PACKAGES_AS_OF`, which CI feeds with the UTC day and the run attempt.
  - This matters because CI's BuildKit cache had kept serving the old apt layer.
  - The base image digest is unchanged: upstream has no newer one.
  - No `.trivyignore` exception was added.
- **AC 1 and AC 4 are proven only after the merge:** the main CI Trivy job, then the staging deploy.
- **Follow-ups (soft):**
  - the CI cache-key step is tested by its text rather than its outcome;
  - `apt-get upgrade` does not take a fix that needs a new dependency (`full-upgrade` would);
  - the cache reasoning is repeated in four places.
- **Merged** in batch MB17, alone, to unblock the main CI.

