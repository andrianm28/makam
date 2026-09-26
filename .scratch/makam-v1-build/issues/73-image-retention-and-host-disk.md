# Image retention and disk hygiene on the shared host

Status: ready-for-agent
Blocked by: 72
Spec: Implementation Decisions > Architecture; ADR 0002 (second amendment of 2026-09-26)

## What to build

Decided with the user on 2026-09-26, after the shared host's disk filled up. Keep makam's footprint on the host bounded without touching other projects.

## Acceptance criteria

- [ ] Every deploy (the host's `makam-deploy`) keeps at most the last 3 makam image versions per environment on the host (the running one and the previous one always among them) and removes only `ghcr.io/andrianm28/makam` images; other projects' images are never touched.
- [ ] A monthly GitHub Actions workflow deletes ghcr `sha-*` versions older than 30 days, except any currently deployed to staging or production and any `v*` release tag.
- [ ] Dev work: AGENTS.md tells builder agents to remove their own compose stack, dev image and `node_modules` when a ticket is merged, and names the per-worktree image tag pattern so the cleanup is exact.
- [ ] A disk check (on the existing health timer or GlitchTip/uptime alarm) warns when the root disk passes 85%.
