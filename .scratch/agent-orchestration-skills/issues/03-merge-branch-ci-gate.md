# 03: Merge-branch CI as the gate before main (D1), makam

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** In makam, the merge thread pushes its merged result to a `merge/` branch, CI runs the full gate there, and `main` moves only by fast-forward to a merge branch whose CI is green, so the next merge can start as soon as the previous one is pushed. The local full gate stays as the fallback when CI is unavailable (owner decision D1, 2026-10-03).

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] CI runs the same checks on `merge/**` as on `main` up to the deploy gate (lint, typecheck, Vitest, build, e2e, image scan), and never signs, moves `latest` or deploys from a merge branch.
- [ ] A merge branch whose base is no longer `main`'s head is not fast-forwarded; the procedure says to merge again.
- [ ] The merge procedure and the manual describe the new order and the fallback.
- [ ] Measured on the first two merges: wall-clock per merge before and after.

## Comments
