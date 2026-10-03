# Orchestration optimization and the plan as skills (ticket 87)

2026-10-03, base `origin/main` 4fab4b1. Analysis only: nothing here changes `orchestration.md`, `project-instructions.md`, `AGENTS.md`, settings, hooks or skills until the owner decides. Run on Opus by owner decision (2026-10-03, an exception to the research tier). Method: four parallel analysts (cost and observability; speed and reliability; gates, enforcement and the owner; skills), then two skeptics that re-derived every load-bearing claim from primary evidence (code.claude.com docs fetched as markdown, `gh api`, `list_sessions` / `get_session` / `list_triggers`, `git`, path:line). 57 verdicts: 42 confirmed, 3 refuted, 12 uncertain. Refuted claims are corrected below; uncertain ones are marked **[uncertain]** and nothing ranked first depends on them.

## Summary

1. **The merge pipeline is the wall-clock bottleneck, and the coordinator's wakes are the cost bottleneck.** Merge threads take 43–60 min each and run serially (about 1.1 merges an hour). The coordinator's context is now 412k tokens, and every wake re-reads it.
2. **Cheap fixes first.** Make `session-start.sh` run `npm ci` when the lockfile hash changes: this container's `node_modules` is 41 packages behind the lockfile. Rotate the coordinator at about 200k context with a HANDOFF (about −59% per wake). Add an idle mode that stops the backstop when nothing is in flight.
3. **Enforce what is now instruction-only.** Add a `^mcp__.*__create_session$` tier hook, deny the GitHub MCP write and PR tools, add a fail-closed guard on `git push` to `main`, and set a GitHub ruleset that blocks force-push and deletion of `main`. A hook does not exist on a branch cut before it merged, or in a Projects thread, so the instruction lines stay.
4. **Owner decisions:**
   - make CI on a `merge/**` branch the gate, and start the next merge at the push (about 2 merges an hour);
   - a single-agent review class for deps-only and docs-only diffs;
   - a mechanical `test(red)` order check.
5. **Skills:** two repo skills, `makam-thread` (role references) and `makam-coordinator`, both model-invocable. Briefs shrink to "`/makam-thread <role>` + context". The hard "never" rules stay in `append_system_prompt` and `AGENTS.md`. Build after a probe, test with skill-creator evals, and remove the old text after one trial ticket.

## Part A — optimizing the plan

### A.0 Where the time and money go (measured)

- **Cost split.** Coordinator measurement for 2026-10-02 16:35Z + 16 h: the coordinator used 61% of units (22.6M) and the 22 threads 39% (14.5M). 31% of the coordinator's units came from 35 watcher wakes and 33% from 34 report-back wakes, at about 0.2M units per wake against a ~230k context.
  - `get_session` now shows the coordinator at **412k context**, effort max, `cost_usd` 1,112.
  - Cache reads are 66% of its units, cache writes 24%, output 9%.
- **Per role** (`list_sessions`, threads whose parent is the coordinator):

  | Role | Mean | Range | n |
  |---|---|---|---|
  | Builder | US$4.51 | 1.17–8.98 | 4 |
  | Reviewer (two axes) | US$0.78 | 0.45–1.31 | 6 |
  | Sonnet re-review | US$0.44 | – | 3 |
  | Merge thread | US$0.63 | 0.55–0.83 | 6 |
  | Haiku re-review that read the wrong head | US$1.24 | – | 1 |

  Ticket sums reproduce exactly: 87 = 3.21 + 0.68 + 0.62 + 0.59 = 5.10, and 48 Added = 6.94. **A ticket costs US$5–7 in threads.**
- **Prices** (claude-api skill `models.md:78,84`):
  - Opus 5.5 costs US$4 in and US$20 out per MTok; Sonnet 5.5 costs US$2 and US$10.
  - Cache reads cost **US$0.20 on both**, so an Opus cache read is 0.05× its input price, not the 0.1× `usage-report.py` assumes.
  - The coordinator's platform `cost_usd` does not match list prices for any write mix (other Opus sessions price at US$2.1–3.0 per M units), so dollar figures for it below are list-price estimates.
- **Wall clock** (`gh api …/actions/runs/<id>/jobs`, `list_sessions`, `git log`):
  - Main CI takes 17–26 min (median ~21), on the critical path check → image → e2e → deploy-gate → sign.
  - Merge threads, start to report: 43, 47, 54, 53 and 60 min. About half of that is the wait for `main` CI.
  - The 71 pin merge sat **47 min in queue** behind the 87 merge.
  - Builder start to first commit takes 1–6 min. A code review takes 2.5–4 min.
  - One-shot Routine delivery: median 49 s, p90 85 s, maximum 22 min.

### A.1 Cost and tokens

**State.** In thread mode the coordinator's wake count × its context size is the dominant cost: today 412k × ~8.7 call-equivalents × 0.1 ≈ 0.36M units per warm wake. A wake more than an hour after the last call rewrites the cache: 412k × 2 + reads ≈ 1.18M units.

**Bottleneck.** Context size, which grows without bound, multiplied by wakes that carry no decision.

**Candidates judged:**

1. **Rotate the coordinator into a fresh session with a HANDOFF.**
   - Let c0 ≈ 100k be the fresh coordinator with HANDOFF and registry, g the context growth per wake (2.5–10k), and R ≈ 0.35M units the cost of a rotation.
   - The mean cost per wake is minimised at T* = c0 + √(2Rg/a) ≈ 145–190k, and the curve is flat near the optimum.
   - **At 200k (g = 5k) a wake costs 0.148M units against 0.358M today: −59% per wake.**
   - Rotate right after a merge with nothing in flight.
   - Measure: `cost_usd` delta ÷ wakes for one day on each side.
   - Risk: nuance lost in the HANDOFF. Mitigate with the registry rebuilt from `list_sessions` (every thread has `parent_session_id` and a ticket-prefixed title).
   - Cloud sessions compact earlier than a full window (they set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, claude-code-on-the-web "Manage context"), but not near 200k.
   - c0 and g are **[uncertain]** inputs; the conclusion survives any plausible values.
   - **Recommend.**
2. **Coordinator model and effort.**
   - An analyst first put the Sonnet saving at 0–16%; the skeptic **refuted** that.
   - Recomputed on the coordinator's own token counts at list prices: **−21% to −25%** (Opus US$1,571 against Sonnet US$1,175 with 1-hour writes). One rewrite of the context at the switch costs about US$1.65.
   - The trade is quality on routing, merge authorization and owner grilling against about a quarter of coordinator spend.
   - Effort: output (thinking included) is 9% of units, so max → high saves at most about 3%. A top-level effort change mid-conversation invalidates the message cache (`cost-optimization.md:108`), so set effort only when a rotated session starts.
   - **Recommend: keep Opus, start each rotated coordinator at effort high, and use max only for an owner grilling session. Owner decision D3.**
3. **Idle mode.**
   - With no thread in flight, the hourly backstop and the watcher's 115-min re-arm still wake a 412k session.
   - The analyst's "≈US$53/day" was **refuted** as stated. A cache read refreshes the 1-hour timer (`prompt-caching.md:148`) and hourly fires land just under it, so most idle wakes are warm: about 24 × 0.36M + 12 × 0.36M ≈ **13M units/day**, more if a fire slips past the hour.
   - Fix: when the registry has nothing in flight, `update_trigger enabled=false` on the backstop and do not re-arm the watcher; the owner's next message is the wake. Re-enable both when starting a thread (restart checklist).
   - Effect: idle-day cost ≈ 0. Risk: forgetting to re-enable, mitigated by putting it in the start-a-thread checklist.
   - **Recommend; owner decision D4, since it changes the hourly status cadence.**
4. **Polling by a fresh cheap session** (a Routine with `create_new_session_on_fire`, Sonnet, pinging the coordinator only on a change).
   - The minimum interval is one hour (routines docs), so it can only replace the hourly backstop, not the 5-minute watcher.
   - The fixed cost of a fresh Sonnet session is about US$0.30–0.41 per fire (QPou91TE, KY9ACTt7, xzwpxSeK), so US$6–10/day. That is about 50–70% below today's mostly-warm hourly coordinator wakes, but worse than idle mode on idle days.
   - None of the 100 Routines on the account uses `create_new_session_on_fire`, all store `mcp_connections: []`, and whether such a session has `get_session` / `create_trigger` is **[uncertain]**.
   - The in-container watcher costs no tokens until a change.
   - **Recommend: probe once. Adopt it only as the backstop during active periods if it proves to have the tools; idle mode first.**
5. **Fewer report-back wakes.**
   - (a) **Dedupe the watcher against report-backs**: it ignores head changes on branches of in-flight registry threads and wakes on `main` CI, a new PR or an unregistered branch. The size of the saving is **[uncertain]**; measure it by counting watcher + report-back wake pairs within 5 min. Low effort. **Recommend.**
   - (b) Coalescing report-backs into quarter-hour slots saves only cache writes, since each Routine is still a turn. Not worth it.
   - (c) **A reviewer's "merge" verdict starting the merge thread itself** saves one wake per ticket (≈0.15–0.36M units, US$0.3–0.7). Against that:
     - it breaks "only the coordinator starts threads";
     - it loses the tier check (no hook on `create_session` today);
     - two reviewers could start two merges;
     - single-writer-to-`main` is instruction-only.

     **Reject.**
   - (d) Rotation makes every remaining hop cheaper, which is the real lever.

### A.2 Wall-clock speed

**State.** Start to push takes 19–37 min: the local gate (`typecheck && lint && build && npm test`, ~20–21 min in the thread VM) plus merging and bookkeeping. Push to `main` green takes another 17–26 min, and the next merge thread starts only after that. CI runs only on `main` and PRs (`ci.yml:12-15`; the header at `ci.yml:3-5`: a branch push "deliberately runs nothing").

**Options:**

| Option | Start→push | Serial interval | Merges/h | Coverage before `main` |
|---|---|---|---|---|
| A. Today | 19–37 | ~53 | ~1.1 | local suite only |
| A′. Next merge starts at the previous push | 19–37 | ~25–30 | ~2 | same; stacking on a red `main` means reverting both |
| B. Local gate + CI on `merge/<t>` in parallel | ~24–29 | ~27 | ~2 | + e2e, migration upgrade with rows, Trivy, gitleaks, npm audit, fresh `npm ci` |
| C. CI on `merge/<t>` only, then `git push origin merge/<t>:main` (fast-forward) | ~20–29 | ~25 | ~2.4 | as B; the VM runs no suite |

- **Per merge, B and C save little**, because CI (~21 min) is as long as the local gate.
- **The gain is throughput and safety.** A green merge-branch run makes the `main` run a formality, so the next merge may safely start at the push. The 71 pin's 47-min queue would have been ~27 min.
- **What C requires in `ci.yml`:**
  - `on.push.branches: [main, 'merge/**']`;
  - split `RELEASE` into `PUSH_IMAGE` (main or `merge/**`: image push, e2e, scan) and `RELEASE` (main only);
  - an explicit `if: github.ref == 'refs/heads/main'` on `deploy-gate` and `sign`, because today `deploy-gate` is skipped off `main` only implicitly, through its needs (skeptic correction);
  - rewriting the "never checked twice" rule from ticket 72.
- **Cost:** about 38 runner-minutes per run, free on this public repo.
- **Risks:**
  - depends on Actions availability (fallback: the local gate);
  - a flaky e2e costs one more cycle;
  - unsigned `sha-*` images pile up in ghcr (staging refuses unsigned digests).
- **Recommend C, with the local gate as fallback; until decided, A′ plus `npm ci` in the gate. Owner decision D1.**
- **Batching merges.**
  - One merge thread for up to 3 both-axes-clean branches: about 3 + 3×2 + 21 + 21 ≈ 51 min against 3 × 53 = 159 min.
  - Risks: attributing a red gate (bisect costs +21 min × P(red), and the record is 6/6 green); two migrations need `renumber-merge.ts` between merges; a code conflict between batched branches is still untested.
  - Rule: at most 3, at most one schema migration, money code merged alone, one merge commit per branch (reverts stay per branch).
  - **Owner decision D7.**
- **Thread start** (1–6 min) and **reviews** (2.5–4 min) are not bottlenecks.

### A.3 Reliability and durability

1. **Stale `node_modules` (new, verified in this container).**
   - Cloud sessions start from a filesystem snapshot. Here: `node_modules` and `/tmp/makam-npm-ci.log` ("added 965 packages in 40s") are dated 02:25:05Z, and the container booted at 09:41:22Z.
   - `session-start.sh:10` runs `npm ci` only `if [ ! -d node_modules ]`.
   - Result: **41 packages behind `package-lock.json`** (next 16.3.6 vs 16.3.7, nodemailer 10.0.10 vs 10.0.13, vitest 5.0.1 vs 5.0.2, react 19.2.8 vs 19.3.0).
   - The docs say mid-session installs do not carry over to other sessions, yet this one did, so the fix must not rely on either behaviour.
   - Whether a gate tested old versions: the Dependabot #12 merge entry says "dependencies reinstalled as `session-start.sh` does"; #10's entry is silent **[uncertain]**. Main CI runs `npm ci`, so `main` was tested correctly.
   - `orchestration.md:104` ("session-start.sh runs `npm ci`") is wrong in this case.
   - **Fix:** store `sha256sum package-lock.json` in `node_modules/.makam-lock-hash` and run `npm ci` when it is missing or differs (+40 s when stale). Until that merges, every gate and builder brief runs `npm ci` first. **Rank 1.**
2. **Stale heads (3 incidents, plus 1 wrong-head re-review).**
   - The 48 re-review (`source_revision` = the branch) found a stale 380e311 although 680c33c had been pushed about 10 min earlier (`48-perpanjangan-tpu.md:177`).
   - Five merge threads were created with no `source_revision`.
   - Fixes:
     - always pass `source_revision`;
     - the SessionStart hook runs `git fetch --quiet origin` and **prints** `HEAD <sha> on <branch>; origin <sha>; behind N`. Print only: SessionStart also runs on resume, and a checkout there could discard work;
     - the brief keeps `test "$(git rev-parse HEAD)" = <sha>` as its first command.
3. **Routines.**
   - The binding to an existing session (`persistent_session_id`) and `run_once_at` are undocumented. The public page says "Each run creates a new session" and "Routines are in research preview".
   - Delivery is not 100%: of about 55 makam one-shots, 1 FAILED (`WtrZUYUg`, 2026-09-26). The first hourly Routine vanished with no trace; the current one (`trig_018NNeST…`, `6 * * * *`) was created 09:06:47Z and had not fired when this was written.
   - The routines docs also say a green run "does not mean the task in your prompt succeeded".
   - Fixes:
     - run `list_triggers` on every restart **and** every 115-min re-arm wake (one call);
     - the poll treats a thread idle with no report-back as a missed report;
     - probe the documented follow-up path `claude -p "msg" --cloud <session-id>` (claude-code-on-the-web, "Send follow-ups from the CLI"); it needs `allow_remote_sessions`, and whether it works from inside a cloud container is **[uncertain]**.
4. **Watcher into the repo.**
   - The scratchpad watcher dies on every VM pause (cloud-environments, "Time limits": background work "isn't restored").
   - `scripts/agents/poll.sh` in git is reviewed, gitleaks-scanned, survives scratchpad loss and can carry a test of "wake only on change".
   - It must take an explicit argument and never autostart, because threads load the same repo.
   - **Recommend.**
5. **Large-context fix passes.**
   - The 330k-token builder ran a turn but did not do the task (`orchestration.md:125`). A resume hours later also rewrites the whole cache (330k × 2 = 660k units).
   - Rule: send a fix pass into the same session only if its context is ≤150k and it was active ≤60 min ago; otherwise start a fresh session from the HANDOFF.
   - The first reply names the head it found, and the coordinator checks it.
6. **Failing threads.**
   - The `create_session` tool says the parent receives a `<child-session-event>` when a child's turn fails, and `status_bucket` reads `failed`. This is untested (`orchestration.md:155`).
   - The poll already sees `status_bucket`. A deliberate failing probe is optional.
7. **The long gate's self-wake** worked 6/6. A main-loop cache is 1-hour (`orchestration.md:77`; a skeptic fit gives exactly 2.00× writes on cloud Sonnet threads), so a 20-min idle is a warm wake. Keep it; do not poll during the suite.

### A.4 Quality gates

- **`test(red)` order by check, not review.**
  - Both the analyst and the skeptic re-ran it, independently. In the last three tickets with code (7020295, eb2e48b, 3a47f2e), **7 of 41 code commits** are not directly preceded by a `test(red)`.
  - Exempting `src/app/**`-only commits (the test seam is the domain, and UI goes to Playwright) and docs leaves **3**. Each is a refactor or characterization commit that a one-line trailer would excuse.
  - Older tickets show real lapses: 42 had 4 code commits before any red, and 57 had 3.
  - Commit subjects are typed inconsistently, so the check must classify commits **by path**.
  - Proposed `scripts/agents/check-tdd-order.ts <base>..<head>`:
    - a `test(red)` commit touches only test paths;
    - a commit changing non-test files under `src/domain|server|lib|adapters/**` or `scripts/**` must follow an unconsumed `test(red)`, unless its body carries `TDD-exempt: refactor|characterization|comment|deps|ui`.
  - Run it in the builder's verification, the reviewer's Standards input and the merge thread (blocking). Not in CI, which sees the code only after it is on `main`.
  - Optional semantic step: run only the **last** red commit's tests in the reviewer.
  - **Owner decision D8** (it adds a trailer convention).
- **Review of lockfile-only and docs-only diffs.**
  - Today the rule is two parallel sub-agents "whatever the diff size" (`orchestration.md:22`; `code-review/SKILL.md:11`), and the Dependabot reviews broke it.
  - For a lockfile diff the real risks are supply-chain, and they are mechanical:
    - a `resolved` URL off `registry.npmjs.org` (today all 1,164 are on it);
    - an integrity change without a version change;
    - a new `hasInstallScript` (8 today);
    - a major bump inside a minor/patch group;
    - a new package.
  - **Option 1 (analyst A3):** a deps-only class (`package.json`, `package-lock.json`, `.github/dependabot.yml`, a Dockerfile digest line; no major or name change in `package.json`) and a docs-only class (`docs/**`, `.scratch/**`, `*.md` except `AGENTS.md`, `CLAUDE.md`, `.claude/**`). Each gets one Sonnet agent with a checklist, plus `classify-diff.ts` writing the class into the marker (`Two-axis review (deps-only, single agent)`). This saves about US$0.45 a review and is stricter where the risk is.
  - **Option 2 (analyst B):** two sub-agents always, as the skill says.
  - The analysts disagree, so it is **owner decision D2**. Recommend option 1: the second LLM agent adds no supply-chain check.
- **Migration checker.**
  - It runs in the builder (`builder.md:13`), in `merge-proofs.ts`, and in CI after the push (`ci.yml:152-153`). Main CI 359 went red on a missing `-- contract:` line before `merge-proofs` existed.
  - Run over all 64 files, the checker exits 1 with 8 findings, all in `0005` and `0018`.
  - Add a ratchet tooling test, "every migration above 0018 has no unmarked destructive DDL", so every `npm test` and `npx vitest run tests/` enforces it in milliseconds. **Recommend.**
- **The gate:** see A.2 (merge-branch CI) and A.3 (`npm ci` on a lockfile change).

### A.5 Enforcement and security

**What the docs settle (confirmed).**
- Project `.claude/settings.json` hooks and permission rules apply in **one-repo** cloud sessions. A multi-repo session, "including a project thread", does not read them (cloud-environments, "What carries over"; settings, "Settings in cloud sessions").
- Settings come from the checked-out tree and are hot-reloaded (`hooks.md:710`), so **a thread on a branch cut before a hook merged has no hook**.
- A matcher of letters and `|` is an exact-name list, so `Agent|Task` never fires for `mcp__…__create_session`. A matcher with other characters is an unanchored JS regex.
- An omitted `create_session` model defaults to the caller's, Opus.
- Deny rules "are not a security boundary" (`permissions.md:251`), and a hook cannot override a deny.
- All sessions push as the admin owner `andrianm28` through the proxy, so a GitHub ruleset cannot tell threads apart.
- Sessions carry the tag `config:auto-create-pr:draft`. Agent PRs #6–#9 came before thread mode, and there have been none since.

**Recommendations:**
1. **Tier hook on thread creation.** Matcher `^mcp__.*__create_session$` → `.claude/hooks/require-thread-tier.sh`, rules on `tool_input` only:
   - `model` is present;
   - the title starts with `Build|Fix|Review|Re-review|Merge|Research|Docs ticket <n>:`;
   - Review and Re-review are never haiku;
   - a review whose title or prompt matches money terms (Billing, Payouts, Refunds, Tagihan, payment, refund) must be opus;
   - `outcome_branch: main` only for Merge, and Merge must have it;
   - `append_system_prompt` contains the no-PR line.

   Extend the `Agent` hook with the same matrix: today it waves `subagent_type: reviewer` through with no model, which makes a money review run on Sonnet. About 60 lines plus a tooling test. **Rank 2.**
2. **No PR.**
   - Add to `permissions.deny`: `Bash(gh pr create *)`, `mcp__github__create_pull_request`, `mcp__github__merge_pull_request`, `mcp__github__push_files`, `mcp__github__create_or_update_file`, `mcp__github__delete_file`, `mcp__github__update_pull_request_branch`. The REST-writing MCP tools can write to `main` around any `git push` guard, and nothing in the workflow uses them. Bare MCP names only: a rule with parentheses is skipped.
   - Back the Bash deny with a PreToolUse `Bash` hook that also catches `gh api … /pulls` POSTs.
3. **One writer to `main`.**
   - `guard-git.sh` denies a `git push` whose refspec reaches `main` (`main`, `HEAD:main`, `refs/heads/main`, `--all`, `--mirror`) unless `.git/makam-outcome-branch` says `main`.
   - `session-start.sh` writes that file only when the SessionStart input has `source == "startup"`, and the reflog's first checkout confirms it.
   - The hook fails closed when the file is missing.
   - No environment variable carries the outcome branch, and the coordinator runs detached, so how it is identified is **[uncertain]**; probe once.
   - It is a speed bump against drift, not against a hostile agent.
4. **On GitHub** (the owner's settings):
   - a ruleset on `main` blocking force-push and deletion, with no bypass. `rules/branches/main` returns `[]` today, and the merge thread only fast-forwards. **Owner decision D6.**
   - Do **not** require PRs or status checks: with one identity they are either a no-op or block the merge thread.
   - Turn on secret-scanning push protection. Its state could not be read with this token.
5. **Secrets.**
   - The repo is public, and gitleaks runs only in `main` CI (`ci.yml:73-89`), so a secret pushed to a ticket branch is published unscanned.
   - Add a pre-push gitleaks run (the pinned image, `--log-opts origin/main..HEAD`) to `guard-git.sh`. Whether Docker Hub is reachable from the session is **[uncertain]**.
6. **Keep the instruction lines** in `AGENTS.md` and `append_system_prompt` regardless, because of the old-branch and Projects gaps above.

### A.6 Owner in the loop

- `AskUserQuestion` "stays open until you answer" (`tools-reference.md:133`), and a cloud session can be answered "up to environment expiry". The timeout setting is user-level or server-managed, so it cannot be set from the repo.
- A pending question parks the coordinator's turn. What a Routine does when it fires during an open question is **[uncertain]**. **Rule: ask only as the last call of a turn**, after every unblocked dispatch, merge and archive. A Routine wake never stands in for the owner's answer: the routines docs say the fired prompt "is not live user input".
- `PushNotification` sends "a phone push when Remote Control is connected". Delivery from a cloud coordinator that is not on Remote Control is **[uncertain]**, so probe it once with the owner's confirmation before relying on the notify-then-ask rule.
- Status cadence: report on a change, a report-back or a decision (kept). In idle mode the hourly status stops (D4). Owner-facing text stays in Bahasa Indonesia.

### A.7 Observability and reporting

- `usage-report.py` cannot measure thread mode: it reads only local transcripts (`usage-report.py:184-188`), and its 0.1 read weight is wrong for Opus 5.5 (0.05). **Add** a `--sessions <list_sessions.json>` input (per-role table, coordinator share) and Opus/Sonnet 5.5 profiles, so "measure again after a week" (`orchestration.md:80`) can be done.
- **Rebuild the registry** from `list_sessions` (`parent_session_id`, ticket-prefixed titles) on every restart. `scratchpad/threads.md` stays as a cache.
- **A per-ticket cost line** at merge, for example "threads US$5.10 (builder 3.21, review 0.68, re-review 0.62, merge 0.59)": one call.
- No status file in the repo: it would mean pushes to `main`.

### A.8 Scale

- Peak overlap is 4 threads, with every `five_hour` limit `allowed`.
- But `seven_day` showed **`allowed_warning`** on 2026-09-26 to 09-30, and another project's lead session (US$733) shares the account.
- More builders only queue at the serial merge.
- **Recommend:** 3–4 threads at once; start no new thread when `get_session` shows `allowed_warning`; raise the cap only after D1.

### A.9 Ranked recommendations

| # | Recommendation | Impact | Effort | Risk | Owner decision |
|---|---|---|---|---|---|
| 1 | `session-start.sh` runs `npm ci` on a lockfile-hash change; until then briefs run `npm ci` | High (correct gates) | Low | Low | No (ticket) |
| 2 | `create_session` tier hook + model matrix in the `Agent` hook | High | Low | Low | Yes (settings) — D5 |
| 3 | Rotate the coordinator at ~200k with a HANDOFF, effort high | High (−59%/wake) | Low | Medium | Yes — D3 |
| 4 | Idle mode: backstop off and no watcher re-arm when nothing is in flight | Medium–high (~13M units per idle day) | Low | Low | Yes — D4 |
| 5 | Deny GitHub MCP write/PR tools; `guard-git.sh` (PR, `main` push, pre-push gitleaks) | High (closes REST path to `main`) | Medium | Medium (fail-closed false denials) | Yes — D5 |
| 6 | GitHub ruleset: no force-push or deletion on `main`; push protection | High | Low (owner clicks) | Low | Yes — D6 |
| 7 | CI on `merge/**` as the gate; next merge starts at the push | High (~1.1 → ~2 merges/h, e2e before `main`) | Medium | Medium | Yes — D1 |
| 8 | Stale-head report in the hook, `source_revision` always, SHA check | Medium | Low | Low | No |
| 9 | `check-tdd-order.ts` with `TDD-exempt:` trailers | Medium | Medium | Low | Yes — D8 |
| 10 | Deps-only and docs-only single-agent review class | Low–medium | Low | Low | Yes — D2 |
| 11 | Watcher into `scripts/agents/poll.sh`; dedupe against report-backs; `list_triggers` on restart and re-arm wakes | Medium | Low | Low | No |
| 12 | Batch up to 3 clean merges per merge thread | Medium–high | Low | Medium | Yes — D7 |
| 13 | Fix pass into the same session only if ≤150k and ≤60 min idle | Medium | Low | Low | No |
| 14 | `usage-report.py` thread mode + per-ticket cost line + registry from `list_sessions` | Medium | Low | Low | No |
| 15 | DDL ratchet tooling test (>0018) | Low–medium | Low | Low | No |
| 16 | Ask the owner only as a turn's last call; probe PushNotification | Medium | Low | Low | No |
| 17 | Probes: fresh-session poll Routine, `claude -p --cloud`, failing child | Low now | Low | Low | No |
| — | Rejected: a reviewer starting the merge thread; a status file in the repo; coalesced report-backs | — | — | — | — |

## Part B — the plan as skills

### B.1 Constraints from the docs (confirmed unless marked)

- Cloud sessions load the repo's `.claude/skills/`, `.claude/agents/` and `.claude/commands/`. They do not install `enabledPlugins` (cloud-environments, "What carries over"). So these are **repo skills, not a plugin**.
- **The skill list** carries descriptions only. Its budget is 1% of the context window, and description plus `when_to_use` is truncated at 1,536 characters. The body loads on invocation and then "stays there across later turns". After compaction, re-attached skills share 25,000 tokens, the first 5,000 of each.
- **`disable-model-invocation: true`** has these effects:
  - The model cannot invoke the skill, and its description is not in context.
  - "If Claude tries anyway, Claude Code blocks the call and instructs it not to reproduce the … steps another way".
  - A user-typed `/skill` still works.
  - Scheduled `/loop` fires deliver a flagged skill as plain text.
  - Whether a `create_session` prompt or a Routine prompt counts as user-typed is undocumented **[uncertain]**.

  **Neither makam skill may carry the flag**: the coordinator writes thread briefs, and Routines write coordinator wakes.
- **A leading `/skill` expands**, and the trailing text becomes `$ARGUMENTS`; with `arguments: [role]` the first token is the role. Whether this expansion happens in a `create_session` or Routine prompt is **[uncertain]**: the first probe.
- **A checkout removes files.** A branch cut before the skills merged has no `.claude/skills/makam-*`. The invoked body stays, but its references and the new hooks vanish. So a thread reads its role reference **before** any checkout, and reviewer and merge threads use `git worktree add` so the root stays on `main`.
- **Local project agents have no Skill tool** (`builder.md:4,11`). They read the reference by path, as `builder.md` already does for `tdd`, or preload it with the `skills:` frontmatter field (body only).

### B.2 Where each piece belongs

| Plan piece (source) | Home | Why |
|---|---|---|
| Never open a PR; only the merge thread pushes `main`; never change `Status:` or the index; never renumber (`AGENTS.md`, `project-instructions.md:7,13`) | `AGENTS.md` + `append_system_prompt` (stay) + hooks (A.5) | Hard nevers must be always loaded; skills load on demand |
| Model tiering (`AGENTS.md`, `orchestration.md:22,140`) | `AGENTS.md` + hooks (A.5) + the coordinator's `starting-threads` reference | Enforced where it can be |
| Builder procedure (`project-instructions.md:7`; `orchestration.md:116-120`; `builder.md:11-17`) | `makam-thread/references/builder.md` | Role procedure |
| Reviewer and re-review (`project-instructions.md:9`; `orchestration.md:10-15,116-117`; `reviewer.md`) | `references/reviewer.md`, `rereview.md` | Includes the D2 outcome |
| Fix pass (`orchestration.md:86` rule 3, `:136`) | `references/fix-pass.md` | Arrives by Routine; self-contained |
| Merge thread (`project-instructions.md:11`; `orchestration.md:31-41`) | `references/merge.md` calling `scripts/migrations/*.ts` and the D1 gate | Longest procedure; incident narratives stay in the manual |
| Report-back line (`orchestration.md:135`) | `makam-thread` "Finish" + one line in `append_system_prompt` | Must survive compaction |
| Starting threads, brief template (`orchestration.md:134`) | `makam-coordinator/references/starting-threads.md` | Coordinator-only |
| Watching, hourly poll, idle mode (`orchestration.md:137`) | `references/watching.md` + `scripts/agents/poll.sh` | Script in git (A.3) |
| Writers to `main` (`orchestration.md:138`) | `references/merge-and-writers.md` | Coordinator-only |
| Decisions: notification, then the option tool (`orchestration.md:16-17`) | `references/decisions.md`, calling `grilling` and `domain-modeling` | |
| Undocumented Routine mechanics (`orchestration.md:139`) | `references/without-projects.md`, marked TEMPORARY | Deleted when Projects arrive |
| Archive, registry, restart, rotation (`orchestration.md:141-143`; A.1) | `references/restart.md` | |
| Hourly poll prompt | Routine prompt: "Run the makam-coordinator skill, section poll" | Survives a recreated Routine |
| Token discipline, pilot evidence, local mode, workflows (`orchestration.md:65-96,111-129,157-163`) | `orchestration.md` (stays) | Evidence and why; skills link by section name |
| `Two-axis review` marker | `merge.md`; enforced by `tests/tooling/ticket-workflow.test.ts` | Already machine-checked |
| TDD order, diff class, DDL ratchet (A.4) | `scripts/agents/*.ts` + tooling tests, invoked from the references | Checks, not prose |

**One `makam-thread`, not a separate `makam-merge`.** Progressive disclosure already isolates `merge.md`, a third description costs listing budget, and a separate skill would not enforce single-writer anyway. Revisit if `merge.md` passes ~300 lines.

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

No `disable-model-invocation`, no `context: fork` (the thread is the worker), and no `model` (`create_session` sets it).

`SKILL.md` (under 120 lines, about 1k tokens):
1. **Before anything:** read `references/$role.md` before any `git checkout`.
2. **Start:**
   - fetch;
   - a builder runs `checkout -B <branch> origin/<branch>`; a reviewer or merge thread uses `git worktree add`;
   - confirm `git rev-parse HEAD` equals the brief's head, or stop with "head mismatch";
   - run `npm ci` when the lockfile hash differs (until A.3 #1 lands).
3. **Always:** push after every green commit; read counts off a whole log; end with nothing running; at ~100 calls or 250k tokens write a HANDOFF.
4. **Skills to call:**
   - builder and fix-pass: `tdd` (and `diagnosing-bugs` on an unexplained red);
   - reviewer and rereview: `code-review`;
   - merge: `resolving-merge-conflicts`;
   - `handoff` is owner-only, so write the HANDOFF block as `AGENTS.md` defines it.
5. **Finish:** a dated `## Comments` entry, then the report-back Routine (`<ticket> <role> done: <head>, <counts>`).
6. **Pointers:** `AGENTS.md` (already in the prompt) and `orchestration.md` sections by name, never copied.

References:
- `builder.md`: one behaviour per red/green pair, `check-tdd-order.ts`, `check-destructive-ddl.ts`, `docker info` before `npm test`, spec gaps.
- `reviewer.md`: severities, horizontal slicing as should-fix, the smell baseline, the diff class from D2, Comments before any fix pass.
- `rereview.md`: OK/BELUM per item; opus for money code.
- `fix-pass.md`: re-fetch, head check, red first.
- `merge.md`: fresh `origin/main` → `renumber-merge.ts` → `db:generate` → `merge-proofs.ts` → checker → gate (D1) → Status, index and marker → push, never forcing → CI green or revert.

**`makam-coordinator`**

```yaml
---
name: makam-coordinator
description: "Makam coordinator procedures: starting and briefing cloud threads, report-backs, fix passes by Routine, watching and the hourly poll, idle mode, writers to main, owner decisions, archiving, restart and rotation. Use in the makam coordinator session at start or restart and on a report-back, watcher or poll wake. Not in a thread started with a Role brief."
arguments: [section]
argument-hint: "start | report-back | poll | decision | restart | rotate"
---
```

`SKILL.md` (under 150 lines):
1. **Role:** a router; talk to the owner in Bahasa Indonesia; never build, review or push code.
2. **Each wake:** read it, update the registry, act, and report only on a change, a report-back or a decision.
3. **Section table:**
   - `start` → `restart.md`, then `starting-threads.md`;
   - `report-back` → `merge-and-writers.md`;
   - `poll` → `watching.md`;
   - `decision` → `decisions.md`;
   - `rotate` → `restart.md` (HANDOFF at ~200k).
4. **Limits:** 3–4 threads; none on `allowed_warning`; model by tier; archive when a role ends; ask the owner to delete merged branches.
5. **Ultracode:** typed by the owner only.

References: `starting-threads.md` (the `create_session` fields, title prefix for the hook, brief and `append_system_prompt` templates), `watching.md`, `merge-and-writers.md`, `decisions.md` (notification, then the option tool, as a turn's last call; record in Comments; ADR via `domain-modeling`), `restart.md`, `without-projects.md` (TEMPORARY). Scripts: `scripts/agents/poll.sh`, optionally `scripts/agents/brief.sh <role> <ticket> <branch> <head>`.

### B.4 How threads are briefed

The prompt:

```
/makam-thread reviewer
Run the makam-thread skill. Role: reviewer. Ticket: 71 (.scratch/makam-v1-build/issues/71-….md).
Branch: ticket-71-pin. Head: 01ca5d3. Fixed point: origin/main @ <sha fetched now>.
Context: <3–6 lines: ACs, owner decisions, money code yes/no>.
Coordinator session: session_016SvbXgc5TsgPQkMYNP3ocb.
```

`append_system_prompt` (about 600 characters, replacing the pasted role paragraphs `project-instructions.md:7,9,11`): "You are a makam `<role>` thread. Never open a pull request. Push only to `<outcome_branch>` [merge: you are the only writer to `main`]. Never change `Status:`, `00-index.md` or migration numbers [merge excepted]. First invoke makam-thread and read your role reference before any checkout. When finished, create the report-back Routine to the coordinator session above."

The slash line and the "Run the … skill" line are both kept until the probe settles whether the slash form expands.

### B.5 Token cost

- **Live descriptions today.** The vendored skills' descriptions total 1,629 characters (2,110 minus the three flagged skills, which are not listed).
- **The two new descriptions** add 649 characters, about 160 tokens per call: about 40k units, or 0.1% of the 16-hour window.
- **Thread bodies.** An invoked body plus one reference (~1.4k tokens, against today's ~210-token appended paragraph) adds about 3% to a thread, and less if no reference is read.
- **Coordinator.** Replacing a whole-file read of `orchestration.md` (60,694 characters ≈ 15k tokens) with a ~2.5k-token body plus on-demand references saves **at most** about 5% per wake (≈1.1M units per 16 h). This is an upper bound **[uncertain]**: it is not verified that the coordinator reads the file whole or keeps it in context.
- **The real gain is not tokens.** It is one reviewed, evaluated home for the procedure. Each lapse it targets costs about a fix pass plus a re-review (US$1–2): the 3 TDD lapses, the wrong-head re-review, the 3 stale clones, and the single-agent lockfile reviews against the rule.

### B.6 Eval plan (skill-creator)

**Trigger evals** use `run_loop.py` (`--runs-per-query 3`, `--holdout 0.4`, `--max-iterations 5`). `run_eval.py` writes into `<project>/.claude/commands` and runs `claude -p`, so run it **in a scratch clone**, never the worktree.

`makam-thread`:
- **Should trigger:**
  1. the B.4 reviewer brief;
  2. "/makam-thread builder — ticket 95 slice B, branch ticket-95-…, head abc123";
  3. "Role: merge thread. Merge ticket-71-pin at 01ca5d3";
  4. "Fix pass for ticket 48: findings in ## Comments, head 680c33c";
  5. "Re-review ticket 87 fixes at c898419, OK/BELUM";
  6. "You are the builder thread for ticket 23";
  7. a money-code reviewer brief;
  8. a Dependabot lockfile-only reviewer brief.
- **Should not trigger:**
  1. "Review this diff since main" (plain `code-review`);
  2. "Write a test for Billing.tick" (`tdd`);
  3. "Resolve this merge conflict";
  4. "Start a builder thread for ticket 95";
  5. "Hourly poll: check threads and main CI";
  6. "Explain how merge-proofs works";
  7. "Grill me on the refund design";
  8. "Summarise ticket 71's comments".

`makam-coordinator`:
- **Should trigger:**
  1. "71 reviewer done: 01ca5d3, 0 hard, 2 should-fix";
  2. "Run the makam-coordinator skill, section poll";
  3. "Watcher: main CI failed on 2dcdff1";
  4. "Start threads for tickets 95 and 96";
  5. "The container restarted; restore the threads";
  6. "Owner: decide whether lockfile reviews may run single-pass";
  7. "Merge thread done: fe40a42, CI success";
  8. "Who may push to main now?".
- **Should not trigger:** the eight `makam-thread` briefs above (the key near-misses), "Merge ticket-71 into main yourself", "Run code-review on ticket-48".

**Pass bar:** held-out recall ≥90% and false triggers ≤10%, on Sonnet (thread) and Opus (coordinator).

**Behaviour evals** run dry-run briefs in a scratch clone at known commits. The baseline is the same brief with today's appended paragraph and no skill. Each runs 3 times. Pass means 100% on every "never" assertion and at least the baseline elsewhere.

| Eval | Pass criteria |
|---|---|
| Reviewer, wrong head | Stops before any diff with "head mismatch"; zero Agent calls |
| Reviewer, 71 pin da46620…01ca5d3 | `rev-parse` and a non-empty `--stat` before spawning; exactly two Agent calls, each naming a model; `## Standards` and `## Spec` unmerged; count and worst finding per axis; Comments entry; nothing pushed |
| Reviewer, lockfile-only (Dependabot #12) | Follows D2: either the supply-chain checklist with one agent, or two agents |
| Builder, toy slice | First commit `test(red): …` touching tests only, then the code; `check-tdd-order.ts` passes; push only to `ticket-*`; `Status:` untouched; report-back created |
| Branch predates the skills | Reference read before the checkout; procedure followed |
| Fix pass | Fetch, checkout and head check first; red first |
| Merge (plan only) | `merge.md` order; renumbers when a migration is added; checker; whole-log gate; marker; no force-push; push only after the gate |
| Coordinator report-back | Registry updated; reviewer archived; merge-thread `create_session` with title `Merge ticket N:`, sonnet, `outcome_branch: main`; no own code push; one status line |
| Coordinator restart | Fast-forward; registry from `list_sessions`; re-arm `poll.sh`; `list_triggers`; `get_session` per thread; idle mode honoured |

### B.7 What moves out

- **`project-instructions.md` (3,220 characters):**
  - lines 5, 7, 9 and 11 move to the skills;
  - lines 1–3 and 13 stay, plus one pointer line, about 1.2k characters in all.
- **`orchestration.md`:**
  - 130–143 move to the coordinator references; a pointer, the evidence counts and the pilot table (145–155) stay;
  - 10–15, 19 and 116–120 move to the reviewer and builder references; the evidence stays;
  - the merge steps in 31–41 move to `merge.md`; the incident narratives stay;
  - the top of the file names the skills;
  - 65–96 and 157–163 stay.
- **`AGENTS.md`:** nothing moves out. Add one clause to "Cloud sessions": "threads run the `makam-thread` skill", about 15 tokens.
- **`builder.md` and `reviewer.md`:** each reads its role reference by path.
- **`CLAUDE.md`'s "Orchestrator" paragraph:** points the coordinator to `makam-coordinator` and keeps `orchestration.md` as the manual.
- **Drift control:** `tests/tooling/skills.test.ts` checks four things:
  - the frontmatter parses;
  - each description is under 400 characters;
  - no makam skill sets `disable-model-invocation`;
  - every named reference and script exists, and no line of 120+ characters appears verbatim in both a skill and `orchestration.md`.

### B.8 Migration order

1. **Probe.** One cheap Sonnet cloud session, answering four questions:
   - does a `create_session` prompt starting `/makam-thread` expand?
   - does a Routine prompt starting with it expand?
   - after checking out a pre-skill branch, do the skill's files and a new hook disappear?
   - does a fresh-session Routine have `get_session`?

   Record the answers in ticket 87.
2. **Owner decisions D1–D9** (below). The skills encode whichever answers are chosen.
3. **Build** on `ticket-87-skills` (a Sonnet builder thread, TDD for the scripts and tooling tests):
   - both skills;
   - `poll.sh`;
   - the hooks and deny rules approved under D5;
   - `skills.test.ts`, and the `check-tdd-order.ts` / `classify-diff.ts` approved under D8 and D2.
4. **Evals** (B.6) in a scratch clone; scores into ticket 87 Comments.
5. **Two-axis review**, then the merge thread, then `main` CI green.
6. **Expand:** `project-instructions.md`, the agent files and `CLAUDE.md` name the skills, and briefs use the template. The old text stays for one ticket.
7. **Trial** on the next ticket, all roles; compare the lapse counts (TDD, head, PR, tier).
8. **Contract:** delete the moved text (B.7); re-measure the coordinator's wake size and cost per wake.

### B.9 Acceptance criteria (to replace ticket 87's "Added" lines 90–92)

- [ ] The probe results (B.8 step 1) are recorded in ticket 87.
- [ ] `.claude/skills/makam-thread/`:
  - `SKILL.md` under 120 lines;
  - `references/{builder,reviewer,rereview,fix-pass,merge}.md`;
  - model-invocable, with `arguments: [role]`;
  - tells the thread to read its reference before any checkout;
  - points to `AGENTS.md` and `orchestration.md` instead of copying them.
- [ ] `.claude/skills/makam-coordinator/`:
  - `SKILL.md` under 150 lines;
  - `references/{starting-threads,watching,merge-and-writers,decisions,restart,without-projects}.md`, the last marked TEMPORARY;
  - model-invocable;
  - holds the brief and `append_system_prompt` templates, the rotation rule and idle mode.
- [ ] The watcher is `scripts/agents/poll.sh` in git, never autostarted; the restart checklist re-arms it.
- [ ] The hooks and deny rules the owner approved (D5) are in `.claude/settings.json`, each with a tooling test.
- [ ] `tests/tooling/skills.test.ts` passes (frontmatter, description length, no flag, references exist, no verbatim duplication).
- [ ] skill-creator trigger evals: ≥8 should and ≥8 should-not prompts per skill; held-out recall ≥90% and false triggers ≤10% on Sonnet and Opus.
- [ ] Behaviour evals (B.6): 100% on "never" assertions over 3 runs each. Results are in ticket 87 Comments.
- [ ] `project-instructions.md` holds only the nevers and the skill pointers (~1.2k characters). `orchestration.md` and `CLAUDE.md` name the skills, and the moved ranges are deleted after one trial ticket.
- [ ] `builder.md` and `reviewer.md` read the role reference by path.
- [ ] Reviewed on two axes, merged by the merge thread, `main` CI green.

## Claims table

Verdicts are the skeptics', re-derived from primary sources. Counts: 57 verdicts, 42 confirmed, 3 refuted, 12 uncertain (mixed verdicts are counted as uncertain). The load-bearing rows:

| Claim | Evidence | Verdict |
|---|---|---|
| The coordinator is at 412k context, effort max, `cost_usd` 1,112 | `get_session` 2026-10-03 ~09:43Z | Confirmed |
| Opus 5.5 and Sonnet 5.5 cache reads are both US$0.20/MTok | claude-api `models.md:78,84`; `prompt-caching.md:144` | Confirmed |
| A Sonnet coordinator saves only 0–16% | recomputed: −21 to −25% at list prices | **Refuted** |
| The platform prices Opus at US$1.89 per M units | true only for the coordinator; other Opus sessions 2.1–3.0 | **Refuted** (partly) |
| An idle hourly backstop costs ≈28M units/day | a read refreshes the 1-hour TTL, so most wakes are warm: ≈13M | **Refuted** as stated |
| Rotation at 200k saves about 59% per wake | arithmetic confirmed; c0 and g assumed | Uncertain (inputs) |
| Per-role costs; ticket sums 5.10 and 6.94 | `list_sessions` | Confirmed |
| Routine minimum interval 1 h; one-shots are undocumented; delivery 1 failure in ~55 | routines docs; `list_triggers` | Confirmed |
| A fresh-session Routine has the claude-code-remote tools | no precedent on the account | Uncertain |
| `usage-report.py` cannot see threads | `usage-report.py:184-188` | Confirmed |
| Main CI takes 17–26 min; merge threads 43–60 min; 47-min queue | `gh api` jobs; `list_sessions`; Routine fire times | Confirmed |
| A branch push runs no CI; e2e and scan run on `main` only | `ci.yml:3-15,178,221,285`; `deploy-gate` skipped implicitly | Confirmed (corrected) |
| The environment is a reused filesystem snapshot; 41 packages are stale | mtimes, reflog, `node_modules/.package-lock.json` vs `package-lock.json` | Confirmed (mechanism contradicts docs) |
| The Dependabot gates tested old dependencies | #12 says reinstalled; #10 silent | Uncertain |
| `claude -p --cloud` queues into a session | claude-code-on-the-web docs; untested from a container | Confirmed (docs) / uncertain (use) |
| `Agent\|Task` never fires on `create_session`; a regex matcher works | `hooks.md` matcher table | Confirmed |
| An omitted thread model defaults to Opus | `create_session` schema; `get_session` | Confirmed |
| One-repo cloud sessions read project hooks and permissions; project threads and old branches do not | `settings.md:752`; `cloud-environments.md:272`; `hooks.md:710` | Confirmed |
| Hook edits need a restart | `hooks.md:710` (hot reload) | **Refuted** (a correction to an analyst aside, outside the 57) |
| Deny rules are not a boundary; parenthesised MCP rules are skipped | `permissions.md:251,125` | Confirmed |
| All sessions push as admin `andrianm28`; `main` has no ruleset | `gh api user`, `repos/…`, `rules/branches/main` → `[]` | Confirmed |
| No PR since thread mode; sessions are tagged auto-create-pr | PR list #6–#12; `get_session` tags | Confirmed |
| The outcome branch can be captured at SessionStart | one sample; no environment variable carries it | Uncertain |
| TDD order: 7/41 flagged, 3 after exemptions | two independent scripts | Confirmed |
| Unmarked destructive DDL only in 0005 and 0018 | checker over 64 files, exit 1, 8 findings | Confirmed |
| `AskUserQuestion` blocks until answered; PushNotification needs Remote Control for a phone push | `tools-reference.md:133,42` | Confirmed (docs) / uncertain (cloud delivery) |
| `disable-model-invocation` blocks model invocation; a user-typed `/skill` works; Routine prompts are covered | `skills.md:385,545,552`; `scheduled-tasks.md:43-46` | Confirmed / Routine part uncertain |
| `/skill` expands in a `create_session` prompt | `skills.md:620`; untested there | Uncertain |
| Cloud loads repo skills, not plugins | `cloud-environments.md:275-276`; `skills.md:203` | Confirmed |
| Skill descriptions cost about 0.1%; replacing the `orchestration.md` read saves ≤5% per wake | `wc -c`; arithmetic | Confirmed / upper bound uncertain |

## Owner decisions needed

| # | Decision | Recommended | Alternatives |
|---|---|---|---|
| D1 | The gate before `main` | CI on `merge/**` (option C); the next merge starts at the push; the local gate as fallback | A′ (start at the push, local gate + `npm ci`); B (both in parallel); keep today |
| D2 | Review of lockfile-only and docs-only diffs | One agent with a supply-chain or docs checklist, class recorded by `classify-diff.ts` | Two sub-agents always (`code-review` as written) |
| D3 | Coordinator model and effort | Opus; rotate at ~200k with a HANDOFF; effort high on rotation; max for grilling | Sonnet coordinator (−21 to −25%, a quality risk); no rotation |
| D4 | Idle mode | Backstop off and no watcher re-arm when nothing is in flight; no hourly status then | Hourly status always; a fresh Sonnet poll Routine after the probe |
| D5 | Enforcement in settings | `create_session` tier hook + `Agent` matrix; deny GitHub MCP write/PR tools; `guard-git.sh` (PR, `main`, gitleaks), fail-closed | Tier hook only; instruction only (today) |
| D6 | GitHub settings on `main` | Ruleset blocking force-push and deletion, no bypass; secret-scanning push protection | Nothing; "require PR / status checks" (breaks the merge thread) |
| D7 | Batch merges | Up to 3 clean branches, at most one migration, money code alone | One branch per merge thread |
| D8 | TDD order check | `check-tdd-order.ts` blocking in the builder and merge thread, with `TDD-exempt:` trailers | Advisory only (reviewer input); review only (today) |
| D9 | The skill set | `makam-thread` + `makam-coordinator`, no `disable-model-invocation`, acceptance criteria B.9 replacing ticket 87 lines 90–92 | A third `makam-merge`; a single skill; keep pasted paragraphs |

## What stays untested

- Whether a `/makam-thread` line expands in a `create_session` or Routine prompt, and whether a checkout to a pre-skill branch drops the skill's files and new hooks in practice (the B.8 probe).
- A fresh-session Routine's tools; the `claude -p --cloud` reply path from a container; a deliberately failing child's `<child-session-event>`.
- Capturing the outcome branch at SessionStart, and identifying the coordinator for the `main` push guard.
- PushNotification delivery from a cloud coordinator, and what a Routine does while an `AskUserQuestion` is open.
- The rotation inputs (c0, g), the real idle-day cost, and the duplicate watcher/report-back wakes: each needs a day of `cost_usd` deltas.
- Whether the Dependabot #10 gate ran on stale dependencies.
- CI on `merge/**`, merge batching, a merge thread resolving a code conflict, a review of money code on Opus, and a real Project (all as before).
- Docker Hub reachability for a pre-push gitleaks run, and the current state of secret-scanning push protection.
