# Orchestration optimization and the plan as skills (ticket 87)

2026-10-03, base `origin/main` 4fab4b1. Analysis only: nothing changes `orchestration.md`, `project-instructions.md`, `AGENTS.md`, settings, hooks or skills until the owner decides. On Opus by owner decision (2026-10-03, an exception to the research tier). Four analysts, then two skeptics re-deriving each load-bearing claim from primary evidence (code.claude.com docs, `gh api`, `list_sessions` / `get_session` / `list_triggers`, `git`, path:line). 57 verdicts: 42 confirmed, 3 refuted (corrected below), 12 uncertain (marked **[uncertain]**; nothing ranked first depends on them).

## Summary

1. **Bottlenecks.** Wall clock: the serial merge (43–60 min per merge thread, ~1.1 merges/h). Cost: coordinator wakes re-reading a 412k context.
2. **Cheap fixes first.** `session-start.sh` runs `npm ci` on a lockfile-hash change (`node_modules` here is 41 packages behind); rotate the coordinator at ~200k with a HANDOFF (~−59% per wake); idle mode stops the backstop when nothing is in flight.
3. **Enforce instruction-only rules.** A `^mcp__.*__create_session$` tier hook; deny GitHub MCP write/PR tools; a fail-closed guard on `git push` to `main`; a ruleset blocking force-push and deletion of `main`. Instruction lines stay (hooks miss old branches and Projects).
4. **Owner decisions:** `merge/**` CI as the gate, next merge at the push (~2 merges/h); single-agent review for deps-only and docs-only diffs; a mechanical `test(red)` order check.
5. **Skills:** model-invocable repo skills `makam-thread` (role references) and `makam-coordinator`; briefs become "`/makam-thread <role>` + context"; hard nevers stay in `append_system_prompt` and `AGENTS.md`. Probe, build, skill-creator evals, remove old text after one trial ticket.

## Part A — optimizing the plan

### A.0 Where the time and money go (measured)

- **Cost split** (2026-10-02 16:35Z + 16 h): coordinator 61% of units (22.6M), 22 threads 39% (14.5M). Coordinator: 31% from 35 watcher wakes, 33% from 34 report-back wakes, ~0.2M units per wake at ~230k context. Now (`get_session`): **412k context**, effort max, `cost_usd` 1,112; cache reads 66% of units, writes 24%, output 9%.
- **Per role** (`list_sessions`, children of the coordinator):

  | Role | Mean | Range | n |
  |---|---|---|---|
  | Builder | US$4.51 | 1.17–8.98 | 4 |
  | Reviewer (two axes) | US$0.78 | 0.45–1.31 | 6 |
  | Sonnet re-review | US$0.44 | – | 3 |
  | Merge thread | US$0.63 | 0.55–0.83 | 6 |
  | Haiku re-review, wrong head | US$1.24 | – | 1 |

  Ticket sums reproduce: 87 = 3.21 + 0.68 + 0.62 + 0.59 = 5.10; 48 Added = 6.94. **A ticket costs US$5–7 in threads.**
- **Prices** (claude-api `models.md:78,84`): Opus 5.5 US$4/US$20 per MTok in/out, Sonnet 5.5 US$2/US$10; cache reads **US$0.20 on both** (Opus 0.05× input, not `usage-report.py`'s 0.1×). The coordinator's `cost_usd` fits no list-price mix (other Opus sessions: US$2.1–3.0 per M units), so its dollars below are list-price estimates.
- **Wall clock** (`gh api …/actions/runs/<id>/jobs`, `list_sessions`, `git log`): main CI 17–26 min (median ~21; check → image → e2e → deploy-gate → sign). Merge threads, start to report: 43, 47, 54, 53, 60 min, half waiting for `main` CI. The 71 pin merge sat **47 min in queue** behind 87's. Builder to first commit 1–6 min; code review 2.5–4 min. One-shot Routine delivery: median 49 s, p90 85 s, max 22 min.

### A.1 Cost and tokens

**State.** 412k × ~8.7 call-equivalents × 0.1 ≈ 0.36M units per warm wake; a wake over an hour after the last call rewrites the cache (412k × 2 + reads ≈ 1.18M). **Bottleneck:** unbounded context × wakes with no decision.

1. **Rotate with a HANDOFF.** With c0 ≈ 100k (fresh, with HANDOFF and registry), growth g = 2.5–10k per wake, R ≈ 0.35M units per rotation, cost per wake is minimised at T* = c0 + √(2Rg/a) ≈ 145–190k, flat near the optimum. **At 200k (g = 5k): 0.148M units per wake vs 0.358M, −59%.** Rotate after a merge with nothing in flight; measure `cost_usd` delta ÷ wakes, a day each side; rebuild the registry from `list_sessions` to limit HANDOFF loss. Cloud autocompact (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) is not near 200k. c0, g **[uncertain]**; the conclusion holds for plausible values. **Recommend.**
2. **Model and effort.** The 0–16% Sonnet saving was **refuted**: at list prices on the coordinator's tokens it is **−21% to −25%** (Opus US$1,571 vs Sonnet US$1,175, 1-hour writes), plus ~US$1.65 for one rewrite, against routing and grilling quality. Output is 9% of units, so max → high saves ≤~3%; a mid-conversation effort change invalidates the cache (`cost-optimization.md:108`), so set it only at rotation. **Recommend: Opus, effort high per rotated coordinator, max only for owner grilling. D3.**
3. **Idle mode.** With nothing in flight, the hourly backstop and the 115-min watcher re-arm still wake a 412k session. "≈US$53/day" was **refuted**: reads refresh the 1-hour timer (`prompt-caching.md:148`), so wakes are mostly warm: 24 × 0.36M + 12 × 0.36M ≈ **13M units/day**, more if fires slip past the hour. Fix: `update_trigger enabled=false` on the backstop, no watcher re-arm, re-enable both when starting a thread. Idle-day cost ≈ 0. **Recommend; D4 (changes hourly status).**
4. **Fresh cheap poll session** (Routine, `create_new_session_on_fire`, Sonnet, pings on change). Minimum interval 1 h, so it can replace only the hourly backstop, not the 5-min watcher. ~US$0.30–0.41 per fire (QPou91TE, KY9ACTt7, xzwpxSeK), US$6–10/day: 50–70% below today's hourly wakes, worse than idle mode on idle days. None of 100 account Routines uses it; all store `mcp_connections: []`; its `get_session` / `create_trigger` access is **[uncertain]**. **Recommend: probe once; adopt as active-period backstop only if tooled; idle mode first.**
5. **Fewer report-back wakes.** (a) **Dedupe the watcher**: ignore head changes on in-flight branches; wake on `main` CI, a new PR or an unregistered branch. Saving **[uncertain]** (count watcher + report-back pairs within 5 min); low effort. **Recommend.** (b) Quarter-hour coalescing saves only cache writes: not worth it. (c) **A reviewer's "merge" verdict starting the merge thread** saves a wake per ticket (≈0.15–0.36M units, US$0.3–0.7) but breaks "only the coordinator starts threads", skips the tier check, allows two merges; single-writer is instruction-only.  **Reject.** (d) Rotation is the lever.

### A.2 Wall-clock speed

**State.** Start to push 19–37 min (local gate `typecheck && lint && build && npm test` ~20–21 min, plus merging and bookkeeping); green `main` takes 17–26 min more before the next merge starts. CI runs only on `main` and PRs (`ci.yml:12-15`; `ci.yml:3-5`: a branch push "deliberately runs nothing").

| Option | Start→push | Serial interval | Merges/h | Coverage before `main` |
|---|---|---|---|---|
| A. Today | 19–37 | ~53 | ~1.1 | local suite only |
| A′. Next merge starts at the previous push | 19–37 | ~25–30 | ~2 | same; stacking on a red `main` means reverting both |
| B. Local gate + CI on `merge/<t>` in parallel | ~24–29 | ~27 | ~2 | + e2e, migration upgrade with rows, Trivy, gitleaks, npm audit, fresh `npm ci` |
| C. CI on `merge/<t>` only, then `git push origin merge/<t>:main` (fast-forward) | ~20–29 | ~25 | ~2.4 | as B; VM runs no suite |

- CI (~21 min) equals the local gate, so B and C buy **throughput and safety**: a green merge-branch run lets the next merge start at the push (the 71 pin's 47-min queue → ~27).
- **C needs in `ci.yml`:** `on.push.branches: [main, 'merge/**']`; `RELEASE` split into `PUSH_IMAGE` (main or `merge/**`: image push, e2e, scan) and `RELEASE` (main only); explicit `if: github.ref == 'refs/heads/main'` on `deploy-gate` and `sign` (`deploy-gate` now skips off `main` only implicitly via its needs; skeptic correction); ticket 72's "never checked twice" rule rewritten.
- ~38 runner-minutes per run, free (public repo). Risks: Actions outages (fallback: local gate); flaky e2e costs a cycle; unsigned `sha-*` images pile up in ghcr (staging refuses unsigned digests).
- **Recommend C, local gate as fallback; until decided, A′ plus `npm ci` in the gate. D1.**
- **Batching:** ≤3 both-axes-clean branches per merge thread, ≈ 3 + 3×2 + 21 + 21 ≈ 51 min vs 3 × 53 = 159. Risks: attributing a red gate (bisect +21 min × P(red); record 6/6 green); two migrations need `renumber-merge.ts` between merges; a code conflict between batched branches is untested. Rule: ≤3, ≤1 schema migration, money code alone, one merge commit per branch. **D7.**
- Thread start (1–6 min) and reviews (2.5–4 min) are no bottleneck.

### A.3 Reliability and durability

1. **Stale `node_modules` (verified here).** Sessions start from a snapshot: `node_modules` and `/tmp/makam-npm-ci.log` ("added 965 packages in 40s") date from 02:25:05Z; boot was 09:41:22Z. `session-start.sh:10` runs `npm ci` only `if [ ! -d node_modules ]` (and the install persisted, against the docs), so **41 packages lag `package-lock.json`** (next 16.3.6 vs 16.3.7, nodemailer 10.0.10 vs 10.0.13, vitest 5.0.1 vs 5.0.2, react 19.2.8 vs 19.3.0). Dependabot #12's entry says "dependencies reinstalled as `session-start.sh` does"; #10's is silent **[uncertain]**. Main CI runs `npm ci`, so `main` was tested correctly; `orchestration.md:104` is wrong here. **Fix:** keep `sha256sum package-lock.json` in `node_modules/.makam-lock-hash`; `npm ci` when missing or different (+40 s). Meanwhile gates and builder briefs run `npm ci` first. **Rank 1.**
2. **Stale heads (3 incidents + 1 wrong-head re-review).** The 48 re-review (`source_revision` = branch) saw stale 380e311 ~10 min after 680c33c was pushed (`48-perpanjangan-tpu.md:177`); five merge threads had no `source_revision`. Fixes: always pass it; SessionStart runs `git fetch --quiet origin` and only **prints** `HEAD <sha> on <branch>; origin <sha>; behind N` (it also runs on resume); briefs start with `test "$(git rev-parse HEAD)" = <sha>`.
3. **Routines.** `persistent_session_id` and `run_once_at` are undocumented; Routines are "in research preview", and a green run "does not mean the task in your prompt succeeded". Of ~55 makam one-shots, 1 FAILED (`WtrZUYUg`, 2026-09-26). The first hourly Routine vanished; the current one (`trig_018NNeST…`, `6 * * * *`, created 09:06:47Z) had not fired yet. Fixes: `list_triggers` on every restart **and** 115-min re-arm; the poll treats an idle thread without report-back as a missed report; probe `claude -p "msg" --cloud <session-id>` ("Send follow-ups from the CLI"; needs `allow_remote_sessions`; from a container **[uncertain]**).
4. **Watcher into the repo.** The scratchpad watcher dies on every VM pause (background work "isn't restored"). `scripts/agents/poll.sh` in git is reviewed, scanned, durable and testable; explicit argument, never autostarts. **Recommend.**
5. **Large-context fix passes.** The 330k builder ran a turn without doing the task (`orchestration.md:125`); a late resume rewrites the cache (330k × 2 = 660k units). Same session only if ≤150k and active ≤60 min ago, else a fresh one from the HANDOFF; the coordinator checks the head its first reply names.
6. **Failing threads.** The parent should get a `<child-session-event>` and `status_bucket` `failed`; untested (`orchestration.md:155`); the poll sees `status_bucket`; probe optional.
7. **Long-gate self-wake** worked 6/6. The 1-hour cache (`orchestration.md:77`; skeptic fit: exactly 2.00× writes on cloud Sonnet threads) keeps a 20-min idle warm. Keep; no polling during the suite.

### A.4 Quality gates

- **`test(red)` order by check.** Re-run independently twice: in the last three code tickets (7020295, eb2e48b, 3a47f2e), **7 of 41 code commits** lack a directly preceding `test(red)`; exempting `src/app/**`-only commits (UI goes to Playwright) and docs leaves **3**, each a refactor or characterization. Older lapses were real (42: 4 code commits before any red; 57: 3). Classify **by path**. `scripts/agents/check-tdd-order.ts <base>..<head>`: `test(red)` touches only tests; a commit changing non-test files under `src/domain|server|lib|adapters/**` or `scripts/**` must follow an unconsumed `test(red)` unless its body has `TDD-exempt: refactor|characterization|comment|deps|ui`. Blocking in builder verification and the merge thread, input to reviewer Standards; not CI. Optional: the reviewer runs the **last** red commit's tests. **D8.**
- **Lockfile-only and docs-only reviews.** The rule is two sub-agents "whatever the diff size" (`orchestration.md:22`; `code-review/SKILL.md:11`); Dependabot reviews broke it. Lockfile risks are mechanical: `resolved` off `registry.npmjs.org` (all 1,164 on it); integrity change without version change; new `hasInstallScript` (8 today); major bump in a minor/patch group; new package. **Option 1 (analyst A3):** deps-only (`package.json`, `package-lock.json`, `.github/dependabot.yml`, a Dockerfile digest line; no major or name change in `package.json`) and docs-only (`docs/**`, `.scratch/**`, `*.md` except `AGENTS.md`, `CLAUDE.md`, `.claude/**`) classes, one Sonnet agent with a checklist; `classify-diff.ts` writes the class into the marker (`Two-axis review (deps-only, single agent)`); saves ~US$0.45 a review, stricter where the risk is. **Option 2 (analyst B):** always two sub-agents. **D2**; recommend option 1 (a second LLM adds no supply-chain check).
- **Migration checker.** Runs in the builder (`builder.md:13`), `merge-proofs.ts` and post-push CI (`ci.yml:152-153`; main CI 359 went red on a missing `-- contract:` line). Over 64 files it exits 1 with 8 findings, all in `0005` and `0018`. Add a ratchet tooling test, "every migration above 0018 has no unmarked destructive DDL". **Recommend.**

### A.5 Enforcement and security

**Settled (confirmed).** Project `.claude/settings.json` hooks and permissions apply in **one-repo** cloud sessions, not multi-repo ones "including a project thread" (cloud-environments, "What carries over"; settings, "Settings in cloud sessions"). They come from the checked-out tree and hot-reload (`hooks.md:710`): **a pre-hook branch has no hook**. A matcher of letters and `|` is an exact-name list (`Agent|Task` never fires for `mcp__…__create_session`); others are unanchored JS regexes. An omitted `create_session` model defaults to Opus. Deny rules "are not a security boundary" (`permissions.md:251`); hooks cannot override a deny. All sessions push as admin `andrianm28`, so a ruleset cannot tell threads apart. Sessions carry `config:auto-create-pr:draft`; agent PRs #6–#9 predate thread mode.

1. **Tier hook.** `^mcp__.*__create_session$` → `.claude/hooks/require-thread-tier.sh`, on `tool_input`: `model` present; title starts `Build|Fix|Review|Re-review|Merge|Research|Docs ticket <n>:`; Review/Re-review never haiku; money terms (Billing, Payouts, Refunds, Tagihan, payment, refund) in a review's title or prompt require opus; `outcome_branch: main` only and always for Merge; `append_system_prompt` has the no-PR line. The `Agent` hook gets the same matrix (today a modelless `subagent_type: reviewer` runs money reviews on Sonnet). ~60 lines plus a tooling test. **Rank 2.**
2. **No PR.** `permissions.deny`: `Bash(gh pr create *)`, `mcp__github__create_pull_request`, `mcp__github__merge_pull_request`, `mcp__github__push_files`, `mcp__github__create_or_update_file`, `mcp__github__delete_file`, `mcp__github__update_pull_request_branch` (REST writers bypass any `git push` guard; unused). Bare MCP names only (parenthesised rules are skipped). A PreToolUse `Bash` hook backs it and catches `gh api … /pulls` POSTs.
3. **One writer to `main`.** `guard-git.sh` denies pushes reaching `main` (`main`, `HEAD:main`, `refs/heads/main`, `--all`, `--mirror`) unless `.git/makam-outcome-branch` says `main`, written by `session-start.sh` only on `source == "startup"` and confirmed by the reflog's first checkout; fails closed if missing. No environment variable carries the outcome branch and the coordinator runs detached: **[uncertain]**, probe once.
4. **GitHub** (owner): `main` ruleset blocking force-push and deletion, no bypass (`rules/branches/main` is `[]`; merges only fast-forward). **D6.** Do **not** require PRs or checks (one identity: no-op or blocks merges). Turn on secret-scanning push protection (state unreadable with this token).
5. **Secrets.** Public repo, gitleaks only in `main` CI (`ci.yml:73-89`): a secret on a ticket branch is published unscanned. Add pre-push gitleaks (pinned image, `--log-opts origin/main..HEAD`) to `guard-git.sh`; Docker Hub reachability **[uncertain]**.
6. **Keep the instruction lines** in `AGENTS.md` and `append_system_prompt` (old-branch and Projects gaps).

### A.6 Owner in the loop

- `AskUserQuestion` "stays open until you answer" (`tools-reference.md:133`), in the cloud "up to environment expiry"; its timeout is not repo-settable.
- A Routine firing during a pending question is **[uncertain]**. **Ask only as a turn's last call**, after every unblocked dispatch, merge and archive. A Routine wake ("not live user input") never replaces the answer.
- `PushNotification` reaches a phone "when Remote Control is connected"; from a cloud coordinator **[uncertain]**: probe once with the owner before relying on notify-then-ask.
- Status on change, report-back or decision; none hourly when idle (D4); Bahasa Indonesia.

### A.7 Observability and reporting

- `usage-report.py` reads only local transcripts (`usage-report.py:184-188`) and weights reads 0.1, not Opus 5.5's 0.05. **Add** `--sessions <list_sessions.json>` (per-role table, coordinator share) and 5.5 profiles so "measure again after a week" (`orchestration.md:80`) works.
- **Registry** rebuilt from `list_sessions` at restart; `scratchpad/threads.md` is a cache.
- **Per-ticket cost line** at merge: "threads US$5.10 (builder 3.21, review 0.68, re-review 0.62, merge 0.59)".

### A.8 Scale

Peak 4 threads, `five_hour` always `allowed`; `seven_day` was **`allowed_warning`** 2026-09-26 to 09-30, and another project's lead session (US$733) shares the account. **Recommend:** 3–4 threads; none new on `allowed_warning`; raise the cap after D1.

### A.9 Ranked recommendations

| # | Recommendation | Impact | Effort | Risk | Owner decision |
|---|---|---|---|---|---|
| 1 | `npm ci` in `session-start.sh` on lockfile-hash change; briefs meanwhile | High (correct gates) | Low | Low | No (ticket) |
| 2 | `create_session` tier hook + `Agent` model matrix | High | Low | Low | Yes (settings) — D5 |
| 3 | Rotate coordinator at ~200k, HANDOFF, effort high | High (−59%/wake) | Low | Medium | Yes — D3 |
| 4 | Idle mode: backstop off, no watcher re-arm | Medium–high (~13M units/idle day) | Low | Low | Yes — D4 |
| 5 | Deny GitHub MCP write/PR tools; `guard-git.sh` (PR, `main` push, pre-push gitleaks) | High (closes REST path to `main`) | Medium | Medium (fail-closed false denials) | Yes — D5 |
| 6 | Ruleset: no force-push/deletion on `main`; push protection | High | Low (owner clicks) | Low | Yes — D6 |
| 7 | CI on `merge/**` as gate; next merge at push | High (~1.1 → ~2 merges/h, e2e before `main`) | Medium | Medium | Yes — D1 |
| 8 | Stale-head report in hook, `source_revision` always, SHA check | Medium | Low | Low | No |
| 9 | `check-tdd-order.ts` + `TDD-exempt:` trailers | Medium | Medium | Low | Yes — D8 |
| 10 | Deps-only/docs-only single-agent review | Low–medium | Low | Low | Yes — D2 |
| 11 | `scripts/agents/poll.sh`; dedupe vs report-backs; `list_triggers` on restart and re-arm | Medium | Low | Low | No |
| 12 | Batch ≤3 clean merges per thread | Medium–high | Low | Medium | Yes — D7 |
| 13 | Same-session fix pass only if ≤150k and ≤60 min idle | Medium | Low | Low | No |
| 14 | `usage-report.py` thread mode + per-ticket cost + registry from `list_sessions` | Medium | Low | Low | No |
| 15 | DDL ratchet test (>0018) | Low–medium | Low | Low | No |
| 16 | Ask owner only as last call; probe PushNotification | Medium | Low | Low | No |
| 17 | Probes: fresh-session poll Routine, `claude -p --cloud`, failing child | Low now | Low | Low | No |
| — | Rejected: reviewer starts merge thread; status file in repo; coalesced report-backs | — | — | — | — |

## Part B — the plan as skills

### B.1 Constraints from the docs (confirmed unless marked)

- Cloud loads `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, not `enabledPlugins` ("What carries over"): **repo skills, not a plugin**.
- **The skill list** holds descriptions only (budget 1% of context; description plus `when_to_use` truncated at 1,536 characters). A body "stays there across later turns"; after compaction re-attached skills share 25,000 tokens, 5,000 each.
- **`disable-model-invocation: true`** hides the description and blocks the model ("blocks the call and instructs it not to reproduce the … steps another way"); user-typed `/skill` works; scheduled `/loop` fires get it as plain text. Whether `create_session` or Routine prompts count as user-typed is **[uncertain]**. **Neither makam skill may carry the flag** (the coordinator writes briefs; Routines write wakes).
- **A leading `/skill` expands**, trailing text becoming `$ARGUMENTS` (with `arguments: [role]`, first token = role). Expansion in `create_session` or Routine prompts is **[uncertain]**: the first probe.
- **A checkout removes files**: a pre-skill branch lacks `.claude/skills/makam-*`; the body stays, references and new hooks vanish. So threads read their reference **before** any checkout, and reviewer and merge threads use `git worktree add`, keeping the root on `main`.
- **Local project agents have no Skill tool** (`builder.md:4,11`): they read the reference by path (as `builder.md` does for `tdd`) or preload it via `skills:` frontmatter (body only).

### B.2 Where each piece belongs

| Plan piece (source) | Home | Why |
|---|---|---|
| Never PR; only merge thread pushes `main`; never change `Status:`/index; never renumber (`AGENTS.md`, `project-instructions.md:7,13`) | `AGENTS.md` + `append_system_prompt` (stay) + hooks (A.5) | Always loaded |
| Model tiering (`AGENTS.md`, `orchestration.md:22,140`) | `AGENTS.md` + hooks + `starting-threads` | Enforced |
| Builder (`project-instructions.md:7`; `orchestration.md:116-120`; `builder.md:11-17`) | `makam-thread/references/builder.md` | Role |
| Reviewer, re-review (`project-instructions.md:9`; `orchestration.md:10-15,116-117`; `reviewer.md`) | `reviewer.md`, `rereview.md` | Includes D2 |
| Fix pass (`orchestration.md:86` rule 3, `:136`) | `fix-pass.md` | Via Routine |
| Merge thread (`project-instructions.md:11`; `orchestration.md:31-41`) | `merge.md` + `scripts/migrations/*.ts` + D1 gate | Narratives stay |
| Report-back line (`orchestration.md:135`) | "Finish" + one `append_system_prompt` line | Survives compaction |
| Starting threads, brief (`orchestration.md:134`) | `makam-coordinator/references/starting-threads.md` | Coordinator |
| Watching, poll, idle mode (`orchestration.md:137`) | `watching.md` + `scripts/agents/poll.sh` | Script in git |
| Writers to `main` (`orchestration.md:138`) | `merge-and-writers.md` | Coordinator |
| Decisions (`orchestration.md:16-17`) | `decisions.md` → `grilling`, `domain-modeling` | |
| Routine mechanics (`orchestration.md:139`) | `without-projects.md`, TEMPORARY | Until Projects |
| Archive, registry, restart, rotation (`orchestration.md:141-143`; A.1) | `restart.md` | |
| Hourly poll prompt | "Run the makam-coordinator skill, section poll" | Survives recreation |
| Token discipline, pilot evidence, local mode, workflows (`orchestration.md:65-96,111-129,157-163`) | `orchestration.md` (stays) | Evidence |
| `Two-axis review` marker | `merge.md`; `tests/tooling/ticket-workflow.test.ts` | Machine-checked |
| TDD order, diff class, DDL ratchet (A.4) | `scripts/agents/*.ts` + tooling tests | Checks |

**One `makam-thread`, no `makam-merge`:** `merge.md` is already isolated, a third description costs budget, and a separate skill would not enforce single-writer. Revisit past ~300 lines.

### B.3 The skill set

**`makam-thread`**

```yaml
---
name: makam-thread
description: "Makam cloud-thread checklists for the roles builder, reviewer, rereview, fix-pass and merge. Use when a prompt says to run makam-thread or gives a makam Role with a ticket, branch and head SHA. Not for the coordinator session and not for general coding or ad-hoc reviews."
arguments: [role]
argument-hint: "builder | reviewer | rereview | fix-pass | merge"
---
```

No `disable-model-invocation`, `context: fork` or `model`. `SKILL.md` (<120 lines, ~1k tokens): (1) read `references/$role.md` before any `git checkout`; (2) fetch; builder `checkout -B <branch> origin/<branch>`, reviewer/merge `git worktree add`; HEAD must equal the brief's head, else stop with "head mismatch"; `npm ci` on a lockfile-hash change (until A.3 #1); (3) push after each green commit, counts off a whole log, end with nothing running, HANDOFF at ~100 calls or 250k tokens; (4) skills: `tdd` (builder, fix-pass; `diagnosing-bugs` on an unexplained red), `code-review` (reviewer, rereview), `resolving-merge-conflicts` (merge); `handoff` is owner-only, so write HANDOFF per `AGENTS.md`; (5) finish: dated `## Comments` entry, then report-back Routine (`<ticket> <role> done: <head>, <counts>`); (6) point to `AGENTS.md` and `orchestration.md` sections, never copy.

References: `builder.md` (one behaviour per red/green pair, `check-tdd-order.ts`, `check-destructive-ddl.ts`, `docker info` before `npm test`, spec gaps); `reviewer.md` (severities, horizontal slicing as should-fix, smell baseline, D2 class, Comments before fix pass); `rereview.md` (OK/BELUM; opus for money); `fix-pass.md` (re-fetch, head check, red first); `merge.md` (`origin/main` → `renumber-merge.ts` → `db:generate` → `merge-proofs.ts` → checker → gate (D1) → Status, index, marker → push, never forcing → CI green or revert).

**`makam-coordinator`**

```yaml
---
name: makam-coordinator
description: "Makam coordinator procedures: starting and briefing cloud threads, report-backs, fix passes by Routine, watching and the hourly poll, idle mode, writers to main, owner decisions, archiving, restart and rotation. Use in the makam coordinator session at start or restart and on a report-back, watcher or poll wake. Not in a thread started with a Role brief."
arguments: [section]
argument-hint: "start | report-back | poll | decision | restart | rotate"
---
```

`SKILL.md` (<150 lines): a router speaking Bahasa Indonesia to the owner, never building, reviewing or pushing code; each wake: read, update registry, act, report only on change, report-back or decision; sections `start` → `restart.md` + `starting-threads.md`, `report-back` → `merge-and-writers.md`, `poll` → `watching.md`, `decision` → `decisions.md`, `rotate` → `restart.md` (HANDOFF at ~200k); limits: 3–4 threads, none on `allowed_warning`, model by tier, archive when a role ends, owner deletes merged branches; Ultracode owner-typed only. References: `starting-threads.md` (`create_session` fields, hook title prefix, brief and `append_system_prompt` templates), `watching.md`, `merge-and-writers.md`, `decisions.md` (notification, then option tool as last call; Comments; ADR via `domain-modeling`), `restart.md`, `without-projects.md` (TEMPORARY). Scripts: `scripts/agents/poll.sh`, optionally `scripts/agents/brief.sh <role> <ticket> <branch> <head>`.

### B.4 How threads are briefed

```
/makam-thread reviewer
Run the makam-thread skill. Role: reviewer. Ticket: 71 (.scratch/makam-v1-build/issues/71-….md).
Branch: ticket-71-pin. Head: 01ca5d3. Fixed point: origin/main @ <sha fetched now>.
Context: <3–6 lines: ACs, owner decisions, money code yes/no>.
Coordinator session: session_016SvbXgc5TsgPQkMYNP3ocb.
```

`append_system_prompt` (~600 characters, replacing `project-instructions.md:7,9,11`): "You are a makam `<role>` thread. Never open a pull request. Push only to `<outcome_branch>` [merge: you are the only writer to `main`]. Never change `Status:`, `00-index.md` or migration numbers [merge excepted]. First invoke makam-thread and read your role reference before any checkout. When finished, create the report-back Routine to the coordinator session above."

Keep both first lines until the probe settles it.

### B.5 Token cost

- Live vendored descriptions: 1,629 characters (2,110 minus three flagged); the new two add 649 (~160 tokens per call, ~40k units, 0.1% of the 16-hour window).
- A thread body plus one reference (~1.4k tokens vs a ~210-token paragraph) adds ~3% to a thread.
- Coordinator: a ~2.5k-token body instead of a whole `orchestration.md` read (60,694 characters ≈ 15k tokens) saves **at most** ~5% per wake (≈1.1M units per 16 h); **[uncertain]** (whole-file reading unverified).
- **The real gain is one evaluated procedure**: each targeted lapse (3 TDD, wrong-head re-review, 3 stale clones, single-agent lockfile reviews) costs US$1–2.

### B.6 Eval plan (skill-creator)

**Trigger evals:** `run_loop.py` (`--runs-per-query 3`, `--holdout 0.4`, `--max-iterations 5`); `run_eval.py` writes `<project>/.claude/commands` and runs `claude -p`, so **scratch clone only**.

`makam-thread` **should:** the B.4 brief; "/makam-thread builder — ticket 95 slice B, branch ticket-95-…, head abc123"; "Role: merge thread. Merge ticket-71-pin at 01ca5d3"; "Fix pass for ticket 48: findings in ## Comments, head 680c33c"; "Re-review ticket 87 fixes at c898419, OK/BELUM"; "You are the builder thread for ticket 23"; a money-code reviewer brief; a Dependabot lockfile-only reviewer brief. **Should not:** "Review this diff since main"; "Write a test for Billing.tick"; "Resolve this merge conflict"; "Start a builder thread for ticket 95"; "Hourly poll: check threads and main CI"; "Explain how merge-proofs works"; "Grill me on the refund design"; "Summarise ticket 71's comments".

`makam-coordinator` **should:** "71 reviewer done: 01ca5d3, 0 hard, 2 should-fix"; "Run the makam-coordinator skill, section poll"; "Watcher: main CI failed on 2dcdff1"; "Start threads for tickets 95 and 96"; "The container restarted; restore the threads"; "Owner: decide whether lockfile reviews may run single-pass"; "Merge thread done: fe40a42, CI success"; "Who may push to main now?". **Should not:** the eight `makam-thread` briefs; "Merge ticket-71 into main yourself"; "Run code-review on ticket-48".

**Pass:** held-out recall ≥90%, false triggers ≤10% (Sonnet thread, Opus coordinator).

**Behaviour evals:** dry runs in a scratch clone at known commits, 3 each, vs the same brief with today's paragraph and no skill. Pass: 100% on "never" assertions, ≥ baseline elsewhere.

| Eval | Pass criteria |
|---|---|
| Reviewer, wrong head | Stops before any diff, "head mismatch"; zero Agent calls |
| Reviewer, 71 pin da46620…01ca5d3 | `rev-parse` and non-empty `--stat` first; exactly two Agent calls naming models; `## Standards`, `## Spec` unmerged; count and worst finding per axis; Comments; nothing pushed |
| Reviewer, lockfile-only (Dependabot #12) | Follows D2 (one agent + checklist, or two) |
| Builder, toy slice | First `test(red): …` tests only, then code; `check-tdd-order.ts` passes; push only `ticket-*`; `Status:` untouched; report-back |
| Branch predates skills | Reference read before checkout; procedure followed |
| Fix pass | Fetch, checkout, head check first; red first |
| Merge (plan only) | `merge.md` order; renumbers on new migration; checker; whole-log gate; marker; no force-push; push after gate |
| Coordinator report-back | Registry updated; reviewer archived; `create_session` `Merge ticket N:`, sonnet, `outcome_branch: main`; no own push; one status line |
| Coordinator restart | Fast-forward; registry from `list_sessions`; re-arm `poll.sh`; `list_triggers`; `get_session` per thread; idle mode |

### B.7 What moves out

- **`project-instructions.md`** (3,220 characters): lines 5, 7, 9, 11 → skills; 1–3, 13 and a pointer stay (~1.2k).
- **`orchestration.md`:** 130–143 → coordinator references (pointer, evidence counts, pilot table 145–155 stay); 10–15, 19, 116–120 → reviewer/builder references (evidence stays); merge steps in 31–41 → `merge.md` (narratives stay); the top names the skills; 65–96, 157–163 stay.
- **`AGENTS.md`:** "Cloud sessions" gains "threads run the `makam-thread` skill" (~15 tokens). `builder.md`/`reviewer.md` read references by path; `CLAUDE.md`'s "Orchestrator" points to `makam-coordinator`.
- **Drift:** `tests/tooling/skills.test.ts`: frontmatter parses; descriptions <400 characters; no `disable-model-invocation`; references and scripts exist; no 120+-character line in both a skill and `orchestration.md`.

### B.8 Migration order

1. **Probe** (cheap Sonnet session): does `/makam-thread` expand in a `create_session` prompt, a Routine prompt? Does a pre-skill checkout drop the skill files and a new hook? Has a fresh-session Routine `get_session`? Record in ticket 87.
2. **Owner decisions D1–D9**, encoded by the skills.
3. **Build** on `ticket-87-skills` (Sonnet, TDD): both skills, `poll.sh`, D5 hooks and denies, `skills.test.ts`, `check-tdd-order.ts` / `classify-diff.ts` per D8, D2.
4. **Evals** (B.6) in a scratch clone; scores in ticket 87.
5. **Two-axis review**, merge thread, `main` CI green.
6. **Expand:** instructions, agent files, `CLAUDE.md` name the skills; briefs use the template; old text stays one ticket.
7. **Trial** next ticket, all roles; compare lapses (TDD, head, PR, tier).
8. **Contract:** delete moved text (B.7); re-measure coordinator wake size and cost.

### B.9 Acceptance criteria (to replace ticket 87's "Added" lines 90–92)

- [ ] Probe results (B.8 step 1) in ticket 87.
- [ ] `.claude/skills/makam-thread/` as B.3: `SKILL.md` <120 lines, `references/{builder,reviewer,rereview,fix-pass,merge}.md`, model-invocable, `arguments: [role]`, reference before checkout, pointers not copies.
- [ ] `.claude/skills/makam-coordinator/` as B.3: `SKILL.md` <150 lines, `references/{starting-threads,watching,merge-and-writers,decisions,restart,without-projects}.md` (last TEMPORARY), model-invocable, templates, rotation, idle mode.
- [ ] `scripts/agents/poll.sh` in git, never autostarted, re-armed by the restart checklist.
- [ ] D5 hooks and denies in `.claude/settings.json`, each with a tooling test.
- [ ] `tests/tooling/skills.test.ts` passes.
- [ ] Trigger evals: ≥8 should and ≥8 should-not per skill; recall ≥90%, false triggers ≤10% on Sonnet and Opus.
- [ ] Behaviour evals (B.6): 100% on nevers over 3 runs; results in ticket 87.
- [ ] `project-instructions.md` only nevers and pointers (~1.2k); `orchestration.md`, `CLAUDE.md` name the skills; moved ranges deleted after one trial ticket.
- [ ] `builder.md`, `reviewer.md` read the reference by path.
- [ ] Two-axis review, merge thread, `main` CI green.

## Claims table

57 verdicts: 42 confirmed, 3 refuted, 12 uncertain (mixed counted as uncertain). Load-bearing rows:

| Claim | Evidence | Verdict |
|---|---|---|
| Coordinator 412k context, effort max, `cost_usd` 1,112 | `get_session` 2026-10-03 ~09:43Z | Confirmed |
| Opus 5.5, Sonnet 5.5 cache reads both US$0.20/MTok | `models.md:78,84`; `prompt-caching.md:144` | Confirmed |
| Sonnet coordinator saves only 0–16% | recomputed: −21 to −25% | **Refuted** |
| Platform prices Opus at US$1.89/M units | coordinator only; others 2.1–3.0 | **Refuted** (partly) |
| Idle hourly backstop ≈28M units/day | reads refresh 1-hour TTL: ≈13M | **Refuted** as stated |
| Rotation at 200k saves ~59%/wake | arithmetic; c0, g assumed | Uncertain (inputs) |
| Per-role costs; ticket sums 5.10, 6.94 | `list_sessions` | Confirmed |
| Routine minimum 1 h; one-shots undocumented; 1 failure in ~55 | routines docs; `list_triggers` | Confirmed |
| Fresh-session Routine has claude-code-remote tools | no precedent | Uncertain |
| `usage-report.py` cannot see threads | `usage-report.py:184-188` | Confirmed |
| Main CI 17–26 min; merges 43–60 min; 47-min queue | `gh api` jobs; `list_sessions`; Routine fire times | Confirmed |
| Branch push runs no CI; e2e, scan on `main` only | `ci.yml:3-15,178,221,285`; `deploy-gate` implicit | Confirmed (corrected) |
| Reused snapshot; 41 packages stale | mtimes, reflog, `node_modules/.package-lock.json` vs `package-lock.json` | Confirmed (contradicts docs) |
| Dependabot gates tested old dependencies | #12 reinstalled; #10 silent | Uncertain |
| `claude -p --cloud` queues into a session | docs; untested from a container | Confirmed (docs) / uncertain (use) |
| `Agent\|Task` never fires on `create_session`; regex works | `hooks.md` matcher table | Confirmed |
| Omitted thread model defaults to Opus | `create_session` schema; `get_session` | Confirmed |
| One-repo sessions read project hooks/permissions; project threads, old branches do not | `settings.md:752`; `cloud-environments.md:272`; `hooks.md:710` | Confirmed |
| Hook edits need a restart | `hooks.md:710` (hot reload) | **Refuted** (aside, outside the 57) |
| Deny rules not a boundary; parenthesised MCP rules skipped | `permissions.md:251,125` | Confirmed |
| All push as admin `andrianm28`; no `main` ruleset | `gh api user`, `repos/…`, `rules/branches/main` → `[]` | Confirmed |
| No PR since thread mode; auto-create-pr tag | PR list #6–#12; `get_session` tags | Confirmed |
| Outcome branch capturable at SessionStart | one sample; no env variable | Uncertain |
| TDD order: 7/41 flagged, 3 after exemptions | two independent scripts | Confirmed |
| Unmarked destructive DDL only in 0005, 0018 | checker, 64 files, exit 1, 8 findings | Confirmed |
| `AskUserQuestion` blocks; PushNotification needs Remote Control | `tools-reference.md:133,42` | Confirmed (docs) / uncertain (cloud delivery) |
| `disable-model-invocation` blocks the model; typed `/skill` works; Routines covered | `skills.md:385,545,552`; `scheduled-tasks.md:43-46` | Confirmed / Routine part uncertain |
| `/skill` expands in `create_session` prompt | `skills.md:620`; untested | Uncertain |
| Cloud loads repo skills, not plugins | `cloud-environments.md:275-276`; `skills.md:203` | Confirmed |
| Descriptions ~0.1%; replacing `orchestration.md` read ≤5%/wake | `wc -c`; arithmetic | Confirmed / upper bound uncertain |

## Owner decisions needed

| # | Decision | Recommended | Alternatives |
|---|---|---|---|
| D1 | Gate before `main` | CI on `merge/**` (C); next merge at push; local gate fallback | A′ (local gate + `npm ci`); B (parallel); today |
| D2 | Lockfile/docs-only reviews | One agent + checklist; class by `classify-diff.ts` | Always two sub-agents |
| D3 | Coordinator model, effort | Opus; rotate ~200k with HANDOFF; high on rotation; max for grilling | Sonnet (−21 to −25%, quality risk); no rotation |
| D4 | Idle mode | Backstop off, no watcher re-arm, no hourly status when idle | Hourly status always; fresh Sonnet poll Routine after probe |
| D5 | Enforcement in settings | Tier hook + `Agent` matrix; deny GitHub MCP write/PR; `guard-git.sh` (PR, `main`, gitleaks), fail-closed | Tier hook only; instruction only (today) |
| D6 | GitHub on `main` | Ruleset: no force-push/deletion, no bypass; push protection | Nothing; require PR/checks (breaks merge thread) |
| D7 | Batch merges | ≤3 clean branches, ≤1 migration, money code alone | One branch per thread |
| D8 | TDD order check | `check-tdd-order.ts` blocking in builder and merge thread, `TDD-exempt:` | Advisory (reviewer); review only (today) |
| D9 | Skill set | `makam-thread` + `makam-coordinator`, no flag, B.9 replacing ticket 87 lines 90–92 | Third `makam-merge`; one skill; pasted paragraphs |

## What stays untested

- `/makam-thread` expansion in `create_session` and Routine prompts; pre-skill checkout dropping skills and hooks (B.8 probe).
- Fresh-session Routine tools; `claude -p --cloud` from a container; a failing child's `<child-session-event>`.
- Outcome-branch capture at SessionStart; identifying the coordinator for the `main` guard.
- PushNotification from cloud; a Routine during an open `AskUserQuestion`.
- c0, g, real idle-day cost, duplicate watcher/report-back wakes (a day of `cost_usd` deltas each).
- Dependabot #10's gate on stale dependencies.
- CI on `merge/**`, batching, a merge thread resolving a code conflict, an Opus money-code review, a real Project.
- Docker Hub reachability for pre-push gitleaks; push protection state.
