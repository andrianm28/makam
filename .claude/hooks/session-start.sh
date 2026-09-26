#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (claude.ai/code).
# Runs only in the cloud container (CLAUDE_CODE_REMOTE=true); on the shared VPS it does nothing,
# because worktrees there use `npm run deps` and the shared `makam-testpg` (AGENTS.md).
set -uo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Dependencies (the cloud clone has no node_modules).
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/tmp/makam-npm-ci.log 2>&1 || echo "npm ci failed, see /tmp/makam-npm-ci.log" >&2
fi

# Docker: Vitest starts a Postgres 18 test container (the image's Postgres 16 is not used).
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then SUDO=sudo; else SUDO=""; fi
  ($SUDO dockerd >/tmp/makam-dockerd.log 2>&1 &) 
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || echo "Docker daemon did not start; tests need it (see /tmp/makam-dockerd.log)" >&2
fi
exit 0
