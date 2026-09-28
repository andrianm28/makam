# Handoff — makam.co.id v1, sesi 2026-09-28

_To a fresh agent. The orchestrator session ended mid-investigation on the owner's
UI finding. Read this first, then `AGENTS.md` (it is long and it is the repo's
authority), then the artifacts named here._

---

## 1. What just happened, in one line

Staging went live for the first time in the repo's history, and then the owner
looked at it and said **"ui nya jauh dari prototipe"**. That finding is open, is
the most important thing in this document, and **no agent has yet acted on it**.

## 2. The deploy milestone — verified, not claimed

```
MAKAM_TAG   sha-0f59e9ee0cf33c0cc0cb4090e2ef5046929b0cb2
DEPLOYED_AT 2026-09-28T06:35:34Z
```

Live checks, read from the running instance: `/api/health` → 200 with
`database.ok: true` and worker `fresh`; the SumoPod webhook answers **401** for a
forged signature; `/` and `/hubungi-kami` → 200; `PortNotConfiguredError` count 0.

The full chain worked end to end for the first time: build → sign → move
`latest` → host pull → **verify signature** → migrate → run → health.

**Six stacked faults were behind one 992-line log.** This is recorded in
`00-index.md` under the entry "Staging deployed, and the six faults behind one
log" — read that rather than the list below, but the six were: `cosign` never
installed on the host (verify exited 78 silently); the staging env file missing
both SumoPod values; registry credentials `0600` while the cosign container runs
as uid 65532; the private key passed as `COSIGN_PRIVATE_KEY`, which cosign does
**not** read, so signing silently fell back to keyless; `install-host.sh` run as
root leaving `$ROOT` and `.git/index` root-owned; and no image ever signed.

**None of the six was visible in the log.** All six were found by running
`makam-deploy` and reading what it printed.

## 3. THE OPEN ITEM — the owner's UI finding

`docs/design-system.md` (311 lines) is the surviving record. Line ~5 says the look
was settled on a **throwaway prototype** — so the prototype was deliberately
discarded and only its decisions were kept. Brand source:
`docs/brand/brand-guideline-visual-2026.pdf` (18 pages).

Two questions were put to the owner and **dismissed without answering** — the
next agent should ask them again, but ask *one at a time and plainly*:

1. **Which screen is furthest from the prototype?** "Jauh dari prototipe" across
   an app this size could mean fifty screens. Guessing wrong wastes a prototype
   cycle.
2. **Does a copy of the prototype still exist** outside the repo? If not, only
   the written decisions remain, and an honest audit may conclude the written
   record cannot reproduce the remembered feel. Say so plainly if that is what
   the audit finds — do not paper over it.

**Known limits of the current investigation:**

- **No desktop browser is connected to this session.** `browser.tabs.open` fails
  with "No desktop browser is connected". The UI has **not** been seen by any
  agent. Do not claim to have seen it. If a browser becomes available, look
  before theorising.
- `src/app/globals.css` has **274 tokens**; the design system specifies five exact
  colours — Forest `#29483A`, Sage `#8FA99A`, Sand `#D8C6A5`, Ivory `#F7F4ED`,
  Charcoal `#303330` — plus a role for each. A token-level comparison was started
  and **not finished**; no finding was reached.
- Token conformance is a weak proxy anyway. The things that usually make a UI
  "feel far off" are spacing, density and hierarchy, and those are not in tokens.

**`AGENTS.md` names the sanctioned path: UI uncertainty goes through the
`prototype` skill.** One screen, throwaway, the owner judges it, then build it
properly. Ticket 81 ("Design system catalogue as an Admin Platform page") and
ticket 74 ("Brand foundation and staff shell") are the related tickets.

## 4. Errors the next agent should not repeat

The orchestrator made a repeated class of mistake all session. Each was a
**conclusion drawn before the measurement finished**, and several were reported
to the owner as fact before being checked:

- **`ls-tree -- <partial-path>` returns nothing.** It does not prefix-match. Four
  separate false alarms came from this. Always list the full directory then grep.
- **A pipeline's exit code is the last command's.** `foo | tail -n 1; echo $?`
  reports `tail`'s status. This produced a fabricated "bug" (a script allegedly
  exiting 0 when it refused — it correctly exits 1) and a fabricated "dead
  process" (a slow test whose log was still growing). Redirect to a file, then
  read the file.
- **Absence of output is not absence of fact.** A small log meant a slow run, not
  a finished one.
- **Silence from a subagent is not absence of work.** Three worktrees (t37, t50,
  tfixscrub) each had a *live* writer when a second was dispatched into it.
  Always check for a live session first; the salvage agents correctly refused to
  write and reported instead.
- **Reading a stale checkout.** `/home/ubuntu/makam` lagged `origin/main` several
  times; read blobs with `git show origin/main:<path>` when the tree matters.
- **Asserting cosign behaviour from memory, twice, both times wrong.** Measure
  it. `docker run --rm --entrypoint cosign <img> sign --help` is how.
- **Overruling a reviewer by reading instead of running** is explicitly forbidden
  in `AGENTS.md`; it did not happen today, and the rule earned its place.

The durable habit now written into `AGENTS.md`: **if a result is not there, say
"not there yet", not "it is not there".**

## 5. State of the work in flight

Measured ticket counts from `origin/main` (`9d5a7f0`): **51 resolved**, 28
ready-for-agent, 5 ready-for-human, 2 wontfix, 2 in-progress, of 88.

**Built, pushed, awaiting merge** — all four need migration renumbering at merge
(`main` holds 0025–0028 and the queue is contended):

| Ticket | Branch | Note |
|---|---|---|
| 25 | `ticket-25-pemakaman-bukti-pesanan` | **36 conflicted paths, 71 hunks** against current main. Expects renumbering ×4 |
| 31 | `ticket-31-refunds` | Migration 0029 → 0030. 18 refund tests |
| 37 | `ticket-37-terencana-konfirmasi-bayar` | **Owns a second Bukti Pemesanan table — see below** |
| 28 | `ticket-28-bertugas` | Migration 0029 → 0030. Its `AntreanRowType.peringatan` hook is what ticket 45's row type wants |

**⚠ Merging 25 and 37 both will produce two definitions of the same table.** The
orchestrator caused this by telling 37 to build what 25 owns, then telling 25 to
build it too. **Order must be 25 first, then 37 rebased onto it.** Nothing in the
tooling will catch this.

**Fix pass in flight:** `origin/ticket-install-host-index` — two-axis review
returned **7 Standards findings, 4 Spec findings**, not merged. Worst of each:
the guard can be walked around (`cp` matched by destination name, not source;
`maintenance`/`submodule` missing from `INDEX_WRITING`), and the branch does not
cover the second damage mode its own header predicts. A fix agent is running in
`/home/ubuntu/makam-tfixhost`.

**Scrub fix:** the signed-URL leak in `src/lib/observability/scrub.ts` — a signed
document URL survives whole in a browser breadcrumb, and the `sig` parameter *is*
the read permission for 5 minutes. Also `isBinary` sat *after* the depth cap, so
a document on the cap was reshaped rather than dropped. Agent in
`/home/ubuntu/makam-tfixscrub`.

**Merged today:** 24, 45, 50 (branch, not merged), plus CI fixes and the
observability deferral. The 45 merge agent found two real splice defects with no
conflict markers and proved its structural checker on a positive control first.

## 6. Settled decisions — do not re-open

Recorded with dates in `00-index.md` under "## Release plan". Brief:

- **GlitchTip, observability, monitoring → Rilis 2.** Cost named: staging stack
  traces arrive minified; a failed payment or lost family message is **silent**
  because the Sentry DSN is empty.
- **Margin Layanan TPU / Biaya Layanan Platform**: platform fee appears on a
  Lokasi Mitra order, **never** on a TPU one. ADR 0001 amended.
- **`pengembalian_jumlah` means the amount *requested*, not paid.** The `RFD/…`
  document carries what actually leaves. No code change needed.
- **Biaya Layanan Platform chosen after UAT.** SumoPod QRIS is 0,7% + Rp 300 at
  T+2, so the figure is a floor, not a preference. Placeholder during UAT.
- **Ticket 50: only `Berakhir` blocks a Layanan order; `dibatalkan` does not.**
  A one-way block meant one failed service blocked every other paid service.
- **Ticket 28: Bertugas lives in the Antrean as a new table, not on the Akun Staf.**
  One Akun may hold many roles (`spec.md:342`), so a single-Lokasi column would
  contradict ticket 55.
- **Ticket 24 refunds: "batalkan lalu catat permintaan pengembalian".**
- **Owner still owns the 5 `ready-for-human` tickets**: 02 (infra), 03 (S3, already
  decided to Rilis 2), 04 (SumoPod), 06 (operator facts, dummy content already
  decided), 65 (production cutover). None blocks UAT on staging.

## 7. Outstanding, and needing the owner

- **Rotate the SumoPod credentials.** They were pasted into this session's chat
  and must be treated as exposed. Values are **not** reproduced here; they are in
  `/opt/makam-v1/staging/staging.env` (mode 600, owner `ubuntu`) and in SumoPod's
  dashboard. SumoPod runs two credentials side by side for ~24 h, so rotation is
  downtime-free.
- **The SumoPod webhook URL now points at staging** (`dev.makam.co.id/api/webhooks/pembayaran`).
  The old production app therefore no longer receives payment confirmations.
  Correct for UAT; **must be restored before any cutover**.
- **`backup-passphrase` is absent on staging and prod**, so the backup timer
  refuses. It holds family documents. Owner's call.
- **The release column is approved but not implemented.** `00-index.md` still has
  `| # | Title | Status | Blocked by |`, and only 4 of 88 ticket files mention a
  release. The owner's decision was: add the column, fill it once, guard it in
  `tests/tooling/ticket-workflow.test.ts`. Consequence today: ticket 46 (Rilis 3)
  shows as "buildable" and only a brief reveals that.
- **The staff page for a Terencana order does not exist.** Both the 25 and the 37
  builder reported this against their own tickets rather than claiming their ACs
  were met. The Antrean row points at a page that cannot answer the order.

## 8. Housekeeping the next agent owes

Merged worktrees are not yet torn down. For each: `npm run stack -- down -v`
if it has a stack, `npm run clean`, `rm -rf node_modules`, `git worktree remove
--force <path>`, `git worktree prune`, `npm run deps -- --prune`. `makam-m24`
(24), `makam-m45` (45) are merged and owed this. **Never a bare `docker image rm`,
no `docker system prune`, no `-a`/`--all` on anything** — this host is shared with
other projects, and `tests/tooling/image-retention.test.ts` fails the build if a
prune without a name appears in any tracked file.

## 9. Suggested skills for the next agent

- **`handoff`** — already used; not needed again unless the next session also ends
  mid-task.
- **`brainstorming`** — before any creative or design work. The UI finding is
  exactly its trigger, and the instinct will be to start fixing screens.
- **`prototype`** — named in `AGENTS.md` as the path for UI uncertainty, and the
  right tool for the open item: one screen, throwaway, the owner judges it, then
  build it properly. This is the highest-value skill to call.
- **`grilling`** — the release column needs a real decision about what Rilis 1
  *is*, and the owner's own rule is that decisions come from this skill, not from
  a multiple-choice prompt.
- **`code-review`** — for `origin/ticket-install-host-index` once the fix pass
  lands, and for any ticket branch before merge. Two axes, reported separately,
  never merged or re-ranked.
- **`tdd`** — for any fix, and mandatory by repo convention for domain behaviour.
- **`diagnosing-bugs`** — if a UAT report comes back as a defect rather than a
  taste mismatch.
- **`domain-modeling`** — any `CONTEXT.md` or ADR edit is its output, never a
  hand edit. Relevant because the release column will need glossary work.

## 10. Do not do these

- Do not claim a number that was not read off a log kept whole.
- Do not report a step's result before its notification arrives.
- Do not dispatch a second writer into a worktree without checking for a live
  session.
- Do not re-open a settled decision listed in §6 — read the dated entry first.
- Do not treat "CI is green" as evidence about anything except the pipeline. The
  UI finding is the proof, and it is the most important thing in this document.
