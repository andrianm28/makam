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

- [ ] `scripts/migrations/` gains a merge-time renumber helper: given a branch, it sets aside the branch's added `drizzle/*.sql`, drops the branch's migrations and snapshots from the merge, restores `main`'s journal and snapshots, so `npm run db:generate` regenerates the branch's schema change under the next free number (the reference below does this in bash; follow the conventions of the existing `scripts/migrations/*.ts`, run with `npx tsx`).
- [ ] The three proofs as one command: (1) the regenerated SQL is statement-identical to the branch's SQL, except a hand-written block the generator cannot produce (ticket 39's backfill), which the command reports so it is re-appended; (2) a second `npm run db:generate` reports no schema changes; (3) the whole snapshot chain resolves as a program: every `prevId` is another snapshot's `id`, and only the known pre-existing gaps (0018, 0021, 0024) may dangle; plus the destructive-DDL checker on the new file.
- [ ] Ticket-file conflicts (`.scratch/**/*.md`) resolve by union (both sides kept); any other conflict is reported, never auto-resolved.
- [ ] Tests in `tests/tooling/` on a small fixture of drizzle files: a clean renumber; a branch whose number `main` took; a dangling `prevId` outside the known gaps fails; a hand-written block is reported.
- [ ] `docs/agents/orchestration.md` and `docs/agents/project-instructions.md` name the command; the merge thread then renumbers itself (remove "stop and report").

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

### 2026-10-03 — builder: merge-time migration scripts (branch `ticket-87-merge-scripts`)

- `scripts/migrations/renumber-merge.ts` (`renumberForMerge`): sets the branch's added `.sql` aside, merges `--no-commit --no-ff`, unions `.scratch/**/*.md` conflicts, reports every other conflict without touching it (exit 1), clears unmerged drizzle paths from the index *before* restoring main's journal and snapshots, and verifies the restore (throws instead of the silent failure).
- `scripts/migrations/merge-proofs.ts` (`runMergeProofs`): (1) statement-by-statement SQL compare, hand-written blocks (ticket 39's backfill) printed as "RE-APPEND", statements only the generator produced fail; (2) a second `npm run db:generate` must say "nothing to migrate / no schema changes"; (3) snapshot chain resolved as a program, only 0018, 0021, 0024 may dangle (the all-zero root `prevId` is the root, not a gap); plus the destructive-DDL check on the new files.
- Tests: `tests/tooling/merge-migrations.test.ts` (real git fixture repos: clean renumber, main took the number, ticket-file union, code conflict reported) and `merge-proofs.test.ts` (fixture drizzle folders). Docs: `orchestration.md` (renumbering bullet, third proof, Projects merge-thread line) and `project-instructions.md` name the commands; "stop and report" is replaced by stopping only on a code conflict or failed proof.
- Not exercised: the two CLIs were smoke-run for usage only, not against a real merge with a live `db:generate`. Red commits: the snapshot-chain pair and the SQL-compare pair each put two closely related cases in one red commit.

HANDOFF — head `3a9b723` (+ this entry's commit). `npx vitest run` on the two new files: 13 passed; `npm run lint` and `npm run typecheck` exit 0; full `npm test` (read off the whole log): Test Files 334 passed (334), Tests 3011 passed | 1 skipped (3012). Status untouched. Open: first real use by a merge thread.
