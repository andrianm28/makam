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

