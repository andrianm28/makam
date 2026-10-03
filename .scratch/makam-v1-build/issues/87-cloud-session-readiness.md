# Cloud session readiness (Claude Code on the web)

Status: in-progress
Blocked by: —
Spec: AGENTS.md "Working agreements for agents"; decided with the user 2026-09-26 (use Claude cloud credits; the FFI project moved its sessions off the VPS)

## What to build

Make the repo self-sufficient for Claude Code cloud sessions: vendored skills, rules in the repo, and a SessionStart hook.

## Acceptance criteria

- [x] Matt Pocock's skills used by this project vendored in `.claude/skills/` with their MIT licence.
- [x] The owner's working agreements (workflow, model tiering, merge authorization, priorities) in AGENTS.md.
- [x] `.claude/hooks/session-start.sh` (cloud only: `npm ci`, start Docker) registered in `.claude/settings.json`.
- [ ] A trial cloud session on a small ticket (e.g. 85) runs `npm run test` green and pushes its branch; findings recorded here.
- [ ] The owner reports the mattpocock-skills plugin is installed in the cloud environment. In the first cloud session, check that the plugin's skills load (e.g. list skills, or run `mattpocock-skills:tdd`). If they do: delete the vendored copies in `.claude/skills/` (keep `.claude/hooks/` and `.claude/settings.json`), change AGENTS.md "Working agreements" to name the plugin (`mattpocock-skills:<skill>`) as the source, and record it here. If they don't, keep the vendored copies.
- [ ] Cloud environment configured by the owner at claude.ai/code as recommended on 2026-09-26: name `makam-v1`; network **Custom** = Trusted defaults + `fonts.gstatic.com`, `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`; env var `NEXT_TELEMETRY_DISABLED=1` only (no secrets, no API credentials); setup script: start dockerd, `docker pull postgres:18.6`, `npx -y playwright@latest install --with-deps chromium`, `exit 0`.
- [ ] Verify in the first cloud session: Node 22 matches the Dockerfile; the hook exports `CHROMIUM_PATH` (system Chrome, else Playwright's Chromium) through `CLAUDE_ENV_FILE`, so the real PdfRenderer test runs; `next build` fetches fonts; `npm test` green; the image's Postgres 16 stays unused. Limits: 4 vCPU, 30 GB disk — one Docker stack per session, full e2e optional (CI runs it on `main`).


## Added (2026-10-03, owner decision: the merge-time migration scripts go into the repo)

The renumbering procedure is written in `docs/agents/orchestration.md` ("Renumbering a ticket's migration at merge time" and "The third proof"), but its helpers live only in the coordinator's scratchpad, so a merge thread in its own VM cannot run them and has to stop. Put them in the repo so the merge thread renumbers itself.

- [x] `scripts/migrations/` gains a merge-time renumber helper: given a branch, it sets aside the branch's added `drizzle/*.sql`, drops the branch's migrations and snapshots from the merge, restores `main`'s journal and snapshots, so `npm run db:generate` regenerates the branch's schema change under the next free number (the reference below does this in bash; follow the conventions of the existing `scripts/migrations/*.ts`, run with `npx tsx`).
- [x] The three proofs as one command: (1) the regenerated SQL is statement-identical to the branch's SQL, except a hand-written block the generator cannot produce (ticket 39's backfill), which the command reports so it is re-appended; (2) a second `npm run db:generate` reports no schema changes; (3) the whole snapshot chain resolves as a program: every `prevId` is another snapshot's `id`, and only the known pre-existing gaps (0018, 0021, 0024) may dangle; plus the destructive-DDL checker on the new file.
- [x] Ticket-file conflicts (`.scratch/**/*.md`) resolve by union (both sides kept); any other conflict is reported, never auto-resolved.
- [x] Tests in `tests/tooling/` on a small fixture of drizzle files: a clean renumber; a branch whose number `main` took; a dangling `prevId` outside the known gaps fails; a hand-written block is reported.
- [x] `docs/agents/orchestration.md` and `docs/agents/project-instructions.md` name the command; the merge thread then renumbers itself (remove "stop and report").

Reference (coordinator's scratchpad, as used for tickets 35, 39, 46–58):

```bash
# merge-mig.sh
#!/bin/bash
# usage: merge-mig.sh <branch>   (run in /home/user/merge-stack2 on merge-batch3)
set -u
B=$1; S=<scratchpad>/mig-$B; rm -rf $S; mkdir -p $S
BASE=$(git rev-parse HEAD)
mine=$(git diff --name-only --diff-filter=A origin/main...origin/$B -- 'drizzle/*.sql')
for f in $mine; do git show origin/$B:$f > $S/$(basename $f); done
git merge --no-commit --no-ff origin/$B >/dev/null 2>&1
# resolve non-drizzle conflicts by union only for ticket md; report others
for f in $(git diff --name-only --diff-filter=U); do
  case $f in
    drizzle/*) : ;;
    .scratch/*.md) python3 <scratchpad>/union.py $f; git add $f;;
    *) echo "CODE CONFLICT: $f";;
  esac
done
# drop the branch's own migrations and snapshots, restore HEAD's meta by name
for f in $mine; do git rm -q -f --cached $f 2>/dev/null; rm -f $f; n=$(basename $f | cut -c1-4); done
for snap in $(git diff --name-only origin/main...origin/$B -- 'drizzle/meta/*_snapshot.json'); do git rm -q -f --cached $snap 2>/dev/null; rm -f $snap; done
git checkout $BASE -- drizzle/meta/_journal.json
for snap in $(git ls-tree --name-only $BASE drizzle/meta/ | grep snapshot); do git checkout $BASE -- $snap; done
echo "remaining unmerged:"; git diff --name-only --diff-filter=U
```

```bash
# proof.sh
#!/bin/bash
# usage: proof.sh <new sql> <branch sql copy>
cd /home/user/merge-stack2
echo "diff vs branch sql:"; diff "$1" "$2" && echo IDENTICAL
echo "second generate:"; npm run db:generate 2>&1 | grep -i "nothing to migrate\|No schema changes\|Your SQL"
node -e '
const fs=require("fs");const d="drizzle/meta/";const ids={},prev={};
for(const f of fs.readdirSync(d).filter(f=>/_snapshot.json$/.test(f))){const j=JSON.parse(fs.readFileSync(d+f));ids[j.id]=f;prev[f]=j.prevId}
const dang=Object.keys(prev).filter(f=>!ids[prev[f]]).map(f=>f.slice(0,4)).sort();
console.log("dangling:",dang.join(","));
const sql=fs.readdirSync("drizzle").filter(f=>f.endsWith(".sql")).length;
const jr=JSON.parse(fs.readFileSync(d+"_journal.json")).entries.length;
console.log("sql",sql,"journal",jr);'
npx tsx scripts/migrations/check-destructive-ddl.ts "$1"; echo "ddl exit=$?"
git status --short drizzle
```

```python
# union.py (ticket-file conflicts: keep both sides)
import sys,re
for p in sys.argv[1:]:
    s=open(p).read()
    s=re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n",lambda m:m.group(2)+m.group(1),s,flags=re.S)
    open(p,"w").write(s)
```

## Added (2026-10-03, owner decision: the orchestration as repo skills, after the merge-time scripts)

- [ ] `.claude/skills/makam-thread/SKILL.md`: the role checklists a thread follows (builder, reviewer, merge thread), so a thread brief says "run the `makam-thread` skill, role builder" instead of carrying the rules in its appended system prompt; it points to `AGENTS.md` and `docs/agents/orchestration.md` rather than copying them.
- [ ] `.claude/skills/makam-coordinator/SKILL.md`: starting a thread, the report-back line, a fix pass into the same session by Routine, watching and the status update each poll, decisions by notification then the option tool, writers to `main`, archiving; the without-Projects mechanics marked temporary, with their fallback.
- [ ] Built after the merge-time scripts land; tested with the `skill-creator` evals (does each skill trigger when it should, and only then) and on the next ticket; reviewed and merged like any change. `docs/agents/project-instructions.md` and `orchestration.md` then name the skills.

## Added (2026-10-03, owner decisions D5 and recommendation 1: enforcement in settings)

- [ ] `.claude/hooks/session-start.sh` reinstalls dependencies when the lockfile's hash differs from the installed one, so a thread's gate never runs on stale `node_modules`.
- [ ] A PreToolUse hook on `^mcp__.*__create_session$` refuses a call without a `model`, and the model hook covers `Agent` calls by role (the matrix in the analysis); the message names the tier rule.
- [ ] `permissions.deny` in `.claude/settings.json` for the GitHub MCP tools that open, merge or update pull requests and that write files or branches through the API.
- [ ] `.claude/hooks/guard-git.sh` (PreToolUse on Bash), fail-closed with a message that says how to proceed: refuses `gh pr create` and any pull-request creation; refuses a push to `main` unless the session is the merge thread or the coordinator pushing docs, by a rule you can test and document; runs gitleaks on the outgoing commits before a push where it can, and says so plainly where it cannot.
- [ ] Tests for every hook decision (allowed and refused cases); `docs/agents/orchestration.md` and `AGENTS.md` name the hooks; the instruction lines stay.

## Comments

- 2026-09-27 — **Owner decision: keep the vendored copies** (asked and answered this session). The evidence now says the plugin covers them: `.claude/settings.json` registers the `mattpocock` marketplace and enables `mattpocock-skills@mattpocock`, and in this session `ask-matt` and `resolving-merge-conflicts` both resolved from the plugin's synced path (`~/.agents/skills/…`), never from `.claude/skills/`. The owner still wants `.claude/skills/` in the repo as a fallback, so this acceptance criterion stays open on purpose — not because the plugin is missing. Delete the vendored copies (keeping `.claude/hooks/` and `.claude/settings.json`) and switch AGENTS.md to name `mattpocock-skills:<skill>` whenever the owner decides the fallback is no longer worth its drift.

### 2026-09-26 — first cloud trial (branch `ticket-87-cloud-trial`)

- **mattpocock-skills plugin: not loaded.** `ListPlugins` returns nothing and no `mattpocock-skills:*` skill is listed; the only synced plugin is Anthropic's `session-start-hook`. The skills the session sees (`code-review`, `tdd`, …) come from the vendored `.claude/skills/`. Per the acceptance criterion the vendored copies **stay**, AGENTS.md unchanged. Re-check once the owner installs/enables the plugin for this environment.
- **Node:** `v22.22.2`, matches the Dockerfile's `node:22-bookworm-slim`. OK.
- **Docker:** the daemon runs (Server 29.3.1), but **no image is present**: the setup script's `docker pull postgres:18.6` could not reach Docker Hub (`registry-1.docker.io` → proxy 403).
- **`npm ci` in the hook failed:** `403 Host not in allowlist: registry.npmjs.org` (`/tmp/makam-npm-ci.log`). No `node_modules`, so **`npm run build` and `npm test` could not run** in this session.
- **Fonts:** `fonts.gstatic.com` is reachable, but `fonts.googleapis.com` is blocked (403). `next/font/google` (`src/app/layout.tsx`) fetches the CSS from `fonts.googleapis.com` first, so the build would fail even with npm fixed. The ticket's allowlist missed this host.
- **CHROMIUM_PATH: hook bug, fixed.** The cloud image has no system Chrome and no `~/.cache/ms-playwright`; Playwright's Chromium lives under `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`. The hook now looks there first (then `~/.cache/ms-playwright`, newest version per directory); a dry run with a temp `CLAUDE_ENV_FILE` exports `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. So the setup script's `playwright install` step is unnecessary (and `cdn.playwright.dev` / `playwright.download.prss.microsoft.com` can go).
- **Postgres 16 in the image stays unused:** the `16/main` cluster is installed but `down`; nothing starts it.
- **Real PdfRenderer test: not verified** (blocked with `npm test`), though `CHROMIUM_PATH` now resolves.
- **CLAUDE.md → AGENTS.md import works:** `@AGENTS.md` puts the working agreements, including model tiering, in the session context. Applied on this branch's review: one `sonnet` reviewer (diff under 300 lines) with separate Standards and Spec sections. It found that `ls` sorts its arguments, so `~/.cache` could win over `PLAYWRIGHT_BROWSERS_PATH`; fixed with an ordered loop. Tiering is followed by the orchestrator, not enforced by config (no `.claude/agents/`; the vendored `code-review` skill names no model).
- **Conclusion — owner action needed:** the environment's network policy is effectively not "Trusted defaults". Set Network access to **Trusted** (covers npm and Docker Hub) and add **`fonts.googleapis.com`** and `fonts.gstatic.com`; drop the Playwright install from the setup script. Then re-run this trial: `npm ci`, `npm run build`, `npm test`, and check the real PdfRenderer test runs with `CHROMIUM_PATH`.
- **Owner asked (2026-09-26) to fully apply model tiering and the Matt skills plugin**, so both now live in `.claude/settings.json`:
  - `extraKnownMarketplaces.mattpocock` (GitHub `mattpocock/skills`, reachable from the cloud container over git) and `enabledPlugins["mattpocock-skills@mattpocock"]`. **Next cloud session: check that `mattpocock-skills:*` skills load**; if they do, delete the vendored `.claude/skills/` copies and point AGENTS.md at the plugin. Cloud sessions have been reported to skip repo-declared plugins, so don't assume.
  - `PreToolUse` hook `.claude/hooks/require-subagent-model.sh` on `Agent|Task` blocks a subagent call unless `model` is `sonnet`, `haiku` or `opus`. Verified live in this session: a call without `model` was blocked with the tiering message.
- **Owner enabled the plugin on their claude.ai account** (2026-09-26, "Skills For Real Engineers", Anthropic Directory, v1.2.3, 38 skills, plugin id `58da2c13-5ed4-4485-9625-fb87b369e6b4`). Still not visible in this session (`ListPlugins` empty; account plugins sync at session start), so the check moves to the next cloud session. If that session shows the `mattpocock-skills:*` skills twice (account plugin plus the repo's `enabledPlugins`), drop the repo declaration and keep the account one; if it shows them once, delete the vendored `.claude/skills/` copies as planned.

### 2026-09-26 17:00 UTC — report after the session restart (branch at 154c649, CI green)

| Check | Result |
|---|---|
| CI on `ticket-87-cloud-trial` (154c649, push + PR) | ✅ green (lint, typecheck, Vitest, migration upgrade, gitleaks, build image) |
| Node 22 | ✅ v22.22.2, matches the Dockerfile |
| `CHROMIUM_PATH` from the hook | ✅ exported on restart: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |
| Model tiering | ✅ enforced by the `PreToolUse` hook; a call without `model` was blocked live |
| Postgres 16 in the image | ✅ unused (cluster `down`) |
| mattpocock-skills plugin | ❌ not loaded after restart: `ListPlugins` empty, `~/.claude/plugins/installed_plugins.json` has no plugins, no `mattpocock-skills:*` skill. Neither the account plugin (id `58da2c13-…`) nor the repo's `enabledPlugins` got installed. Vendored `.claude/skills/` stay. |
| `npm ci` in the hook | ❌ still `403 Host not in allowlist: registry.npmjs.org`; network policy unchanged |
| Docker in the hook | ❌ → fixed: on restart the hook's `dockerd` raced the setup script's `containerd` and died ("timeout waiting for containerd to start"); started by hand it runs. The hook now waits for an already-starting daemon before starting its own, and waits up to 60 s. |
| `npm run build` (fonts), `npm test`, real PdfRenderer test | ⏸ not run locally (no `node_modules`); CI runs them green, including the PdfRenderer test with Chromium |

Still open for the owner:
1. Environment network access: **Trusted** plus `fonts.googleapis.com` and `fonts.gstatic.com` (npm registry, Docker Hub, Google Fonts are blocked now).
2. Plugin: check whether the environment/session actually receives account plugins; if not, the vendored skills remain the source.
3. Then one more cloud session: `npm ci`, `npm run build`, `npm test` green, and the plugin check from the criterion above.
- 2026-09-26 — Orchestrator, cloud session 2: the environment's network policy blocks `registry.npmjs.org` (403 for every package, so `npm ci` fails) and Docker Hub (`registry-1.docker.io`); the owner must allow them under the environment's Network access. The hook's `dockerd` died with "timeout waiting for containerd" while a second manual start worked, so the hook should retry `dockerd` once. GitHub run-log ZIPs (`results-receiver.actions.githubusercontent.com`) are blocked too; `get_job_logs` works. The mattpocock-skills plugin still did not load (`ListPlugins` empty, synced bucket empty; cloud sessions ignore the repo's `enabledPlugins` per the docs), so the vendored `.claude/skills/` stay. Details in `handoff-cloud.md`.
- 2026-09-26 17:40 UTC — Orchestrator, cloud session 3: **still not ready.** `registry.npmjs.org` → 403 `x-deny-reason: host_not_allowed` ("Host not in allowlist"), so no `node_modules`; Docker Hub (`registry-1.docker.io`) → proxy CONNECT 403. Docker daemon itself is up (Server 29.3.1) this time, but without a Postgres image tests can't run. `mattpocock-skills:*` still absent (`installed_plugins.json` empty, synced bucket empty); vendored `.claude/skills/` stay. CI remains the only test loop; owner again asked to change the environment's Network access.
- 2026-09-26 17:50 UTC — Orchestrator, cloud session 3: owner asked to install the Matt skills from the official source. `ListPlugins` is still empty (the directory plugin "Skills For Real Engineers", `plugin_01KkxAY5pNrRrp5B5eT1Vbws`, shows `enabled: false` for this account; install card shown). Installed instead with the CLI from the official repo: `claude plugin marketplace add mattpocock/skills` + `claude plugin install mattpocock-skills@mattpocock --scope project` → v1.2.3 enabled, 38 SKILL.md in `~/.claude/plugins/cache/mattpocock`. It lives in this container only and the running session doesn't load it (`Skill mattpocock-skills:tdd` → unknown skill); it needs a session restart, and a fresh container needs it again (account enable or a hook step). The CLI's rewrite of `.claude/settings.json` was formatting only and was reverted. Vendored `.claude/skills/` stay until a session shows `mattpocock-skills:*`.
- 2026-10-03 — Cloud facts now settled by the docs (cloud-environments, re-checked 2026-10-03) and by ten cloud sessions of the Projects pilot: a cloud session does not install the plugins a repository turns on under `enabledPlugins`, so the vendored `.claude/skills/` stay (owner decision of 2026-09-27 stands); cloud sessions run `npm ci` through the SessionStart hook, build, and pass the full suite (332 files, 2998 tests on 2026-10-03). Owner decision 2026-10-03: this ticket also carries the merge-time migration scripts (Added section).
- 2026-10-03 — Owner decision (option tool): turn the orchestration plan into repo skills (`makam-thread`, `makam-coordinator`), not a plugin (a cloud session does not install a repository's `enabledPlugins`, and the content is makam's own), after the merge-time scripts; Added section above.

### 2026-10-03 — builder: merge-time migration scripts (branch `ticket-87-merge-scripts`)

- `scripts/migrations/renumber-merge.ts` (`renumberForMerge`): sets the branch's added `.sql` aside, merges `--no-commit --no-ff`, unions `.scratch/**/*.md` conflicts, reports every other conflict without touching it (exit 1), clears unmerged drizzle paths from the index *before* restoring main's journal and snapshots, and verifies the restore (throws instead of the silent failure).
- `scripts/migrations/merge-proofs.ts` (`runMergeProofs`): (1) statement-by-statement SQL compare, hand-written blocks (ticket 39's backfill) printed as "RE-APPEND", statements only the generator produced fail; (2) a second `npm run db:generate` must say "nothing to migrate / no schema changes"; (3) snapshot chain resolved as a program, only 0018, 0021, 0024 may dangle (the all-zero root `prevId` is the root, not a gap); plus the destructive-DDL check on the new files.
- Tests: `tests/tooling/merge-migrations.test.ts` (real git fixture repos: clean renumber, main took the number, ticket-file union, code conflict reported) and `merge-proofs.test.ts` (fixture drizzle folders). Docs: `orchestration.md` (renumbering bullet, third proof, Projects merge-thread line) and `project-instructions.md` name the commands; "stop and report" is replaced by stopping only on a code conflict or failed proof.
- Not exercised: the two CLIs were smoke-run for usage only, not against a real merge with a live `db:generate`. Red commits: the snapshot-chain pair and the SQL-compare pair each put two closely related cases in one red commit.

HANDOFF — head `3a9b723` (+ this entry's commit). `npx vitest run` on the two new files: 13 passed; `npm run lint` and `npm run typecheck` exit 0; full `npm test` (read off the whole log): Test Files 334 passed (334), Tests 3011 passed | 1 skipped (3012). Status untouched. Open: first real use by a merge thread.

### Two-axis review (2026-10-03, reviewer thread)

Branch `ticket-87-merge-scripts`, head 2be176f, fixed point `git merge-base origin/main HEAD` = 0fc45c2. Lint, typecheck and tests not re-run by the reviewer.

## Standards

- **blocking** — `scripts/migrations/renumber-merge.ts:65-69`: the bare `catch {}` swallows every `git merge` failure, not only conflicts (dirty tree, bad ref, merge already in progress). The helper then deletes and restores drizzle paths (`:88-94`), can clobber uncommitted drizzle edits and exits 0 with "Next: db:generate". Fix: after the catch require `git rev-parse -q --verify MERGE_HEAD`, otherwise rethrow the original error; refuse to start on a non-empty `git status --porcelain`; one test for each.
- **should-fix** — `merge-proofs.ts:94`: `sqlOk` ignores `handWritten`, so the proofs print "PROOFS OK" and exit 0 while ticket 39's backfill is missing from the migration. Fix: fail (or a distinct "RE-APPEND, then rerun" non-zero state) while `handWritten.length > 0`; test it.
- **should-fix** — `123a034` mixes two behaviours (destructive-DDL check and the whole CLI); the CLI exit codes (`renumber-merge.ts` code-conflict exit 1, `merge-proofs.ts` PROOFS FAILED) have no test. Fix: extract an exit-code function or spawn the CLI in a test.
- **should-fix** — `renumber-merge.ts:101-106`, `merge-proofs.ts:100`: no validation at the CLI boundary (`scripts/migrations/deployed-release.ts:19` uses Zod). A `branchRef` starting with `-` reaches `git merge` as an option. Fix: Zod or reject a leading `-`, and use `rev-parse --verify --end-of-options`.
- **nit** — CLI shape differs from `deployed-release.ts` (`import.meta.url` guard, `process.exitCode`, usage code 64) vs `require.main === module` and `process.exit`. `merge-proofs.ts:5` header says `<aside-dir>` while usage accepts `[base-ref]`; `:27` parses JSON unvalidated.
- Checked, fine: branch SQL copied aside before the merge (`:56-62`); no shell (`execFileSync` with arrays), no `|| true`; no scratchpad or home paths; no docker prune; tests use exported functions and assert outcomes; red/feat pairs are one behaviour each except `123a034`.

Standards: 5 findings (1 blocking, 3 should-fix, 1 nit group).

## Spec

Silent failure (unmerged path not restored): guarded — unmerged drizzle paths are cleared (`git rm --cached` + `rmSync`) before `git checkout base --`, and a `git diff --name-only base` check throws on any difference (`renumber-merge.ts:86-96`). The collision test covers the cleared path. Guard is **not tested** for failure and the throw is uncaught (no try/catch at the CLI, `:106`).

- **should-fix** — `renumber-merge.ts:96`: no test makes the restore fail, and the CLI does not catch/print and `exit(1)`. Fix: fixture where restore leaves a stray file, assert it throws; wrap the CLI.
- **should-fix** — `renumber-merge.ts:65-69`: same swallowed merge failure as the Standards blocking item (a loud, non-zero exit on any unresolved state is an Added AC, so it is blocking for the Spec too).
- **should-fix** — `merge-proofs.ts:195-209`: nothing asserts main's snapshots survived (the "32 merge" deletion the third proof is meant to catch). Fix: every `drizzle/meta/*_snapshot.json` in base must exist and be byte-equal in the tree.
- **should-fix** — `merge-proofs.ts:170,206`: `ok` ignores `identical`; a reordered or duplicated statement passes (set membership only). Fix: require the generated statements to match the branch's in order.
- **should-fix (docs)** — `orchestration.md:35` still says "byte-identical" next to the new statement-identical command; code compares normalised statements. Say "statement-identical (whitespace aside)".
- **nit** — `merge-proofs.ts:197-202` pairs new and aside files by sorted index; two migrations with random names can misorder. Pair by journal order.

AC status: renumber helper met (caveat: merge-failure swallowing); three proofs + destructive-DDL partly (reuses `unmarkedDestructiveStatements`, but snapshot-survival and ordering gaps); ticket-file union and other conflicts reported met; tests on a fixture partly (restore-failure guard and CLI exit codes untested); docs name commands and drop "stop and report" met (byte-identical wording aside). Data flow aside-dir → `db:generate` → `merge-proofs` works as documented. No horizontal slicing.

Spec: 6 findings (worst: should-fix; blocking via the shared merge-catch item).

### 2026-10-03 — Fix pass (builder, from head f49fa43)

Item → green commit (red commit just before it):
1. BLOCKING merge catch: rethrow unless MERGE_HEAD → `8c487d3`; refuse non-empty `git status --porcelain` → `33e384d`.
2. Hand-written block ends in a non-zero RE-APPEND state, never "PROOFS OK" → `802ddcc` (CLI prints the block: `a8adbd2`).
3. Restore failure: CLI catches, prints, exits 1 → `4bd9ffd`. The library-level throw test passed on arrival (guard existed, untested), so only the CLI half was red; stated in the red commit `e2fba1f`.
4. Exit codes tested through `renumberMergeCli` / `mergeProofsCli` (return the code): clean 0 `00f48b3`, code conflict 1 `6becd72`, usage 64 `19a4f1e`, proofs OK/FAILED `556ac33`, usage `935d731`.
5. Zod arguments, leading `-` rejected (64): `5d902bd`, `efe2f89`; refs resolved with `rev-parse --verify --end-of-options` and the commit ids used afterwards: `876c8d0`.
6. Every base snapshot must survive byte-equal: `7a21c63` (library), `004b3af` (CLI reads them from the base commit).
7. Statements compared as an ordered multiset (reordered or duplicated fails): `7c4469c` (+ test fix `aa9eae8`, a single-line fixture; the earlier green had one failing test of mine).
8. Nits: CLI shape (`import.meta.url` guard, `process.exitCode`, 64) with 3–5; header `35d0efb`; snapshot JSON validated with Zod `457f0f7`. **Pairing by journal order: not changed** (see below).
9. Docs: "statement-identical (whitespace aside)" `c32d098`.

**Spec gaps and decisions for the owner:** item 8's "pair by journal order" changes nothing in practice: drizzle tags are number-prefixed and journal order follows the number, so the existing number-first sort already pairs correctly whatever the random suffix; a characterization test (`35d0efb`, already green, not a red) pins it. Say so if you still want the journal read. The CLIs were also run for real under tsx (usage, exit 64) but not against a live merge with `db:generate`.

HANDOFF — head after this entry's commit. `npm run lint` and `npm run typecheck` exit 0; full `npm test`, read off the whole log: Test Files 335 passed (335), Tests 3033 passed | 1 skipped (3034). Status untouched.

### Re-review (2026-10-03, reviewer thread, sonnet)

Head c898419, diff `f49fa43..HEAD` (7 files). `npx vitest run tests/tooling`, read off the whole log: Test Files 19 passed (19), Tests 226 passed | 1 skipped (227), exit 0. Real CLI runs under tsx: no args, `-x` → usage + exit 64 (both scripts).

1. **Fixed.** `renumber-merge.ts` rethrows unless `MERGE_HEAD` exists after a failed merge; `git status --porcelain` non-empty is refused up front. Red `aa22ca1`/`44a175c` before green `8c487d3`/`33e384d`.
2. **Fixed.** `merge-proofs.ts` `runMergeProofs`: `ok` requires `reappend.length === 0`; CLI prints the block, "RE-APPEND … then rerun", exit 1. Red `bf5ae0b`→`802ddcc`, `0b4a921`→`a8adbd2`.
3. **Fixed.** `renumberMergeCli` catches, prints, returns 1. `e2fba1f` claim checked: the `could not restore` guard exists at f49fa43 (`renumber-merge.ts:96`), so the throw test was characterization; the CLI half was red (`renumberMergeCli` did not exist). Claim true.
4. **Fixed.** Exit 0/1/64 tested through `renumberMergeCli` and `mergeProofsCli` (`merge-migrations.test.ts:203-262`, `merge-proofs-cli.test.ts:58-104`). Each red precedes its fix.
5. **Fixed.** `refSchema` + `argsSchema` (Zod, no leading dash, ≤2 args) in both CLIs; refs resolved by `rev-parse --verify --end-of-options <ref>^{commit}` and the ids used afterwards.
6. **Fixed.** `baseSnapshots` byte-equal check, CLI reads them from the base commit (`7a21c63`, `004b3af`); the 32-merge deletion is covered.
7. **Fixed.** `compareMigrationSql` is an ordered multiset (`without`, `ordered`, `identical`); duplicates and reordering fail. `aa9eae8` was a fixture fix after the green, disclosed.
8. **Partly.** CLI shape, header, Zod JSON validation fixed. Pairing: kept sorted-by-number instead of journal order; sound, because drizzle tags are number-prefixed, and `35d0efb` is a true characterization test (test + header only, no logic change). Spec nit not literally followed, decision surfaced to the owner by the builder; non-blocking.
9. **Fixed.** `orchestration.md` now says "statement-identical (whitespace aside)", statement by statement and in order.

**New gaps (non-blocking):**
- `renumberForMerge` checks only `status --porcelain`: a leftover `MERGE_HEAD` with a clean index (earlier empty `--no-commit` merge) makes the new merge fail with "not concluded", which `mergeInProgress` then treats as a conflict and carries on. A pre-check "MERGE_HEAD absent" would close it. Narrow, and later proofs would still catch a wrong tree.
- `merge-proofs` base snapshots come from `[base-ref]` default HEAD; if the merge is committed before the proofs run, HEAD is the merge commit and the snapshot proof is vacuous. Header/doc should say "run before committing the merge".
- A bad `[base-ref]` in `merge-proofs` throws from `git ls-tree` (non-zero, stack trace, not 64). Fail-safe.
No path found that exits 0 with an unresolved state.

Blocking remaining: no. Standards: 1 partly (item 8, nit); Spec: clean.

- 2026-10-03 — Merged to main by the merge thread (scripts part). Two-axis review (f49fa43): 1 blocking and should-fix findings, fixed in c898419 and re-reviewed item by item on sonnet (311f34a, hard remaining no; item 8 partly: pairing by migration number kept, sound). Gate on the merged tree: typecheck, lint, build, full suite 335 files / 3033 tests, exit 0. The merge thread now renumbers itself with these commands.

- 2026-10-03 — **Orchestration compared with Projects and ultracode; owner decisions (option tool).** A coordinator workflow (9 agents; 12 load-bearing claims checked by skeptics: 9 confirmed, 2 refuted, 1 uncertain) compared the current plan (cloud threads plus Routines), the same plan in a claude.ai/code Project, and ultracode workflows. Decisions: keep the plan as the base; decide nothing on Projects until a day-one trial (access still waitlisted); ultracode only as an owner-typed, read-only review stage, with one trial on an already-reviewed branch (approved); the watcher wakes the coordinator only on a change and the hourly Routine posts the status (approved: in thread mode the coordinator was about 61% of the cost units, 64% of it wake-ups); the eight manual changes applied to `docs/agents/orchestration.md` (approved). The first hourly polling Routine had vanished by 08:22Z and was recreated. The repo-skills item above carries these rules when it is built.

- 2026-10-03 — **Orchestration optimization and the plan as skills: analysis** (branch `ticket-87-orchestration-analysis`, doc at 5fe608a: `docs/agents/orchestration-optimization.md`). Ran on Opus by owner decision (2026-10-03, an exception to the research tier). Four Opus analysts (cost and observability; speed and reliability; gates, enforcement and the owner; skills), then two Opus skeptics re-deriving every load-bearing claim from docs, `gh api`, platform reads and git: 57 verdicts, 42 confirmed, 3 refuted (all cost estimates, corrected), 12 uncertain (marked, none behind a top-ranked item). 17 ranked recommendations, 9 owner decisions. New finding: cloud sessions start from a filesystem snapshot and `session-start.sh` skips `npm ci` when `node_modules` exists, so this container was 41 packages behind the lockfile. The doc's B.9 is proposed to replace the "Added" checklist above once the owner decides. Decisions for the owner:
  - D1: gate before `main` — CI on `merge/**` with the next merge starting at the push (recommended) vs local gate.
  - D2: lockfile-only and docs-only diffs — one review agent with a checklist (recommended) vs two sub-agents always.
  - D3: coordinator — Opus, rotated at ~200k with a HANDOFF, effort high (recommended) vs a Sonnet coordinator (−21 to −25%).
  - D4: idle mode — backstop and watcher off when nothing is in flight (recommended) vs hourly status always.
  - D5: enforcement — `create_session` tier hook, deny GitHub MCP write/PR tools, fail-closed `main` push guard (recommended) vs tier hook only or instructions only.
  - D6: GitHub ruleset on `main` blocking force-push and deletion, plus push protection (recommended) vs nothing.
  - D7: batch up to 3 clean merges per merge thread (recommended) vs one per thread.
  - D8: `check-tdd-order.ts` blocking with `TDD-exempt:` trailers (recommended) vs advisory or review only.
  - D9: skills `makam-thread` + `makam-coordinator`, model-invocable, criteria B.9 (recommended) vs a third `makam-merge` or a single skill.

- 2026-10-03 — **Owner decisions on the orchestration analysis (option tool, one by one).** D1 CI on `merge/**` is the gate before `main` (the next merge starts at the push; the local gate stays as the fallback); D2 one agent with a checklist reviews lockfile-only or docs-only diffs, classified by a script; D3 the coordinator stays on Opus and rotates into a fresh session with a HANDOFF at about 200k tokens; D4 idle mode: with nothing running, the hourly Routine and the watcher stop and no status is posted; D5 enforcement in settings: a `create_session` model hook and an `Agent` model matrix, GitHub MCP write and PR tools denied, `guard-git.sh` fail-closed for PRs, pushes to `main` outside the merge thread and gitleaks before a push; D6 a GitHub ruleset on `main` (no force-push or deletion, push protection), set by the owner; D7 a merge thread may batch up to three clean branches, at most one migration, money code alone; D8 `check-tdd-order.ts` blocks in builder and merge threads, with a `TDD-exempt:` trailer. **D9 is replaced:** the skills are generic, `agent-coordinator` and `agent-thread` with role references, plus one profile file per project, kept in a separate repository `andrianm28/agent-orchestration-skills` (the owner creates it) and vendored into each project's `.claude/skills/` by a sync script (cloud sessions load repo skills, not plugins); makam is the first user. **Purpose (owner): the skills are an alternative to Claude Code Projects**: the coordinator conversation, threads, report-back, replies into a running thread, an overview, shared instructions and shared memory, each provided without Projects, plus what Projects lacks (one writer to `main`, the merge gate, the TDD and review rules, decisions by notification then the option tool). The analysis `docs/agents/orchestration-optimization.md` (771e355) is merged as the design input.
