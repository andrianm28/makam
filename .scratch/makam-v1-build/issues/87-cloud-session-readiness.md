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


## Comments

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
