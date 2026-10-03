# 07: Merge, research and prototype roles

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** `agent-thread` gains the merge role, generic and driven by the profile, and thin research and prototype roles that wrap Matt Pocock's `research` and `prototype`.

**Blocked by:** 01, 02.

**Status:** ready-for-agent

- [ ] The merge thread works in a `git worktree` from a freshly fetched `main`, runs the profile's merge hooks (for makam, migration renumbering and its proofs), resolves code conflicts with `resolving-merge-conflicts` and stops only on a failed proof, and runs the profile's gate (the merge-branch CI gate when the profile says so, else the local gate).
- [ ] It batches up to three branches whose reviews are clean, at most one with a migration, money code always alone (D7), and takes the coordinator's docs branches along with a batch that has no money code; a failing batch is unbatched.
- [ ] It is the only writer to `main`, never forces a push, follows CI to green or reverts, writes the bookkeeping the profile defines, and reports back once.
- [ ] A reviewer thread started outside a ticket thread also works in a `git worktree`.
- [ ] Research threads use `research` and leave their findings as one file in the repository; prototype threads use `prototype` on a throwaway branch, leave a pointer to it on the implementation ticket, and never merge prototype code.
- [ ] Trigger, behaviour and conformance evals pass.

## Comments
