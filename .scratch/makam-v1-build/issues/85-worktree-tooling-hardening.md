# Worktree tooling hardening (follow-ups from ticket 83)

Status: ready-for-agent
Blocked by: —
Spec: AGENTS.md "Worktrees on the shared host"; docs/ops/runbook.md; ticket 83's review

## What to build

Ticket 83 merged with no hard findings; these judgement calls from its Standards and Spec re-reviews make `npm run deps` / `npm run clean` more robust. None of them can touch another project's resources today.

## Acceptance criteria

- [ ] `deps.mjs`: detect a cross-filesystem store (EXDEV) before deleting the worktree's existing `node_modules`; a lock whose owner file never appeared (crash between mkdir and write) expires after an age/timeout, and prune clears it.
- [ ] `clean.mts`: keep going and print a summary when a `volume rm` / `image rm` fails (e.g. in use); report a daemon that is down as "no stack reachable" instead of throwing after the directories are gone; don't swallow database-drop errors other than "not reachable" (auth etc. are reported).
- [ ] Image cleanup also requires the tag to equal `makam-v1:<project>` of a proven project, not only a matching `makam.worktree` label.
- [ ] Volumes and networks left by `npm run stack -- down` without `-v` are found (e.g. by project name proven from the image label) so they don't leak.
- [ ] Fix the comments that claim `makam.worktree` is on containers, volumes and networks (only the image carries it).
- [ ] The test database name derives from the same resolved real path in tests and in clean (symlink-safe).
- [ ] AGENTS.md says `down -v` explicitly next to `npm run clean`, and warns that `chmod u+w` inside `node_modules` unseals the shared store.
- [ ] Tests for each; nothing of other projects touched.
