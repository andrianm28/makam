# Runtime image: fixable CRITICAL in Debian's perl-base fails the main CI's Trivy gate

Status: ready-for-agent
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
