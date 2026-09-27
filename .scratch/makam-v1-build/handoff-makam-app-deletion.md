# Handover for the FFI coordinator: what is still only on this host's disk

Written 2026-09-27 by the makam orchestrator, in reply to the owner asking to delete
`/home/ubuntu/makam-app`. **Nothing in `/home/ubuntu/makam-app` has been deleted, and nothing in it
will be by me without a decision from you.** This file is the evidence, so that the decision is not
lost if a session ends. Talk to the owner in Bahasa Indonesia; relay to the FFI coordinator through
them, since the two orchestrators cannot message each other.

## What happened

The owner asked to remove `makam-app` ("the data is dummy, it can be regenerated"). That is true of
one thing — the `makam_beta` catalog, which my research confirmed is **100 % fictional** (10 `cemeteries`
rows, every one of them addressed `Jl. Contoh`; none of the four "real TPUs" the migrations mention
exist in any database). It is **not** true of the directory.

## What I did

- Verified there is no container bind-mounting that path and no image in `main` depends on it.
- Pushed **17 worktree branches** that existed only on this disk, so their committed work is now on
  `https://github.com/andrianm28/makam-app` and no longer at risk. Re-verified: no worktree branch is
  missing from the remote any more. The commits themselves were FFI's; I only pushed them.
- Deleted nothing.

## What is still only on this disk (the reason I stopped)

**1. Uncommitted work in 6 worktrees — about 2 700 files, not in any commit, not on any remote:**

| Worktree | Uncommitted tracked files |
|---|---|
| `.claude/worktrees/agent-a9f9a67b5dda7f372` | 459 |
| `.claude/worktrees/agent-aab73a31151ed2f11` | 457 |
| `.claude/worktrees/agent-ae4e3e3599379be54` | 458 |
| `.worktrees/batch2i-payment-verification-admin-actions` | 458 |
| `.claude/worktrees/sand` | 156 |
| `refund-r0`, `refund-r1`, `agent-af41076cdacfde7c5`, `typo` | 1–2 each |

Pushing the branches did **not** capture this: these files were never committed.

**2. Uploaded documents, not dummy data, and not readable by me.** These paths exist but are
permission-denied (not mine, not the owner's):

```
storage/app/private/documents
storage/app/private/certificate-uploads
storage/app/private/reconciliation-statement-uploads
storage/app/private/work-evidence-uploads
```

The names are the point: certificates, work evidence, reconciliation statements, documents. Whatever
is in them is real people's material. I will not touch them under any instruction, and they need a
decision from the owner, not from either orchestrator.

**3. A live process reads the path.** An MCP filesystem server is running against
`/home/ubuntu/makam-app`; deleting the directory turns it into errors rather than cleaning anything.

## Why the branches matter

The unpushed branch names were not routine work. Among the 17 now on the remote:

```
fix/batchm4a-openapi-gate-healthcheck
fix/batchm9-document-vault-security
fix/batchm1b-payment-failure-duplicate-audit
fix/batchm4c-contract-doc-reconciliation
fix/batchm2a-cemetery-scope-authorization
fix/batchm2b-session-auth-audit-trail
fix/batchm3b-plot-reservation-domain-guards
fix/batchm2i-payment-verification-admin-actions
feat/refund-r1-refuse-paid-order
feat/refund-obligation-ledger
```

Security, money, authorization, audit-trail and refund correctness. If any of that was about to be
lost, it is safe now. If any of it was already known to be superseded, the branches on the remote are
a cheap way to confirm that before anything is removed.

## What I propose instead, in order

1. **Commit and push the uncommitted work in those 6 worktrees.** This is FFI's call, not mine:
   committing half-finished work changes it from "in progress" to "committed but unreviewed", and that
   is your decision, not a cleanup step. Suggested per worktree: commit on its own branch with a
   message saying it is a rescue snapshot, push, and note the WIP in the commit body.
2. **Then remove worktrees whose branch is already merged**, using `git merge-base --is-ancestor` and
   `git worktree remove` with **no `--force`** — the rule you already set for your own worktrees. If
   the removal refuses because of uncommitted files, stop and report; never force.
3. **Decide separately about the uploaded documents.** I have no standing to touch them, and neither,
   in my reading, should either orchestrator.
4. Only then consider the directory itself. By then the removal is reversible rather than final.

## Two things worth keeping whatever you decide

- The **catalogue schema** of the old app is recorded in
  `makam/.scratch/makam-v1-build/research/old-app-catalog-and-cutover-data.md` (523 lines, cited). If
  the directory goes, that document is the only description of the five catalogue tables and how they
  map to v1. It is an archive, not a backup: it describes the shape, not the data.
- Ticket **86** in makam v1 (import the old app's catalogue as beta data) is now blocked on a decision
  that this discovery made urgent: the source is fictional, and the alternative — 78 real DKI TPUs
  already catalogued in `research/dki-tpu-list.csv` — is being built under ticket 43. The importer
  that was written for ticket 86 refuses to invent prices or facilities, which is the right behaviour,
  but it would be building a path to import data that does not exist.

## Host state, for your planning

Disk on this host is at 93 % with about 7.5 GB free, shared with both projects. The 2.8 GB of
`makam-app` would help, but the reclaimable space that is unambiguously ours and safe is larger: **29
`ghcr.io/andrianm28/makam:sha-*` images, 14.7 GB reclaimable**, one per merge, which now has a
retention script (makam ticket 73, merged, verified fail-closed over three review rounds). It has not
been run — that is the owner's step: `deploy/install-host.sh` once, then `makam-prune-images --dry-run`,
then the real thing. Until then nothing is deleted and the disk stays where it is.

## Owner decision, settled: do not touch makam-app

2026-09-27 — the owner closed this: **investigation only, and only where it concerns makam.** Nothing in `/home/ubuntu/makam-app` is to be deleted, pruned or removed by this project's agents, including worktrees, `.claude/worktrees`, volumes and images. The 2026-09-27 disk investigation is the reason the earlier proposal is closed rather than merely deferred: `/home/ubuntu/makam-app/.worktrees` holds **37 worktrees** and `.claude/worktrees` **19** (not the 6 an earlier note assumed), carrying **~1,995 uncommitted files** — 22 database migrations, 10 Artisan commands, Payment/Filament tests, contracts, and a document-vault security branch. Three agent worktrees alone hold 1,374 uncommitted files, so neither tree is a cache. `.claude/` also contains git-tracked files (`.claude/agents/*.md`, `skills`, `settings.json`), so removing it would damage the checkout, not just free space. `renewal-online-payment` is a broken worktree (its `.git` gitdir entry resolves to an empty HEAD) and stays for its owner to deal with. **Do not re-propose deleting any of this.** The FFI coordinator owns those worktrees; the disk numbers in `docs/ops/runbook.md` and this file are the only place this is recorded.
