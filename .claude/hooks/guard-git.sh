#!/usr/bin/env bash
# PreToolUse hook on Bash: the git and GitHub rules of AGENTS.md as a gate (ticket 87).
# Exit 2 blocks the command and shows stderr to the agent; every denial says how to proceed.
# Fail-closed: if the hook itself cannot decide, the command is refused, not let through.
if ! command -v node >/dev/null 2>&1; then
  echo "guard-git: node is not on PATH, so the git guard cannot run and the command is refused (fail-closed). Install Node (npm run deps, or the session-start hook) and retry." >&2
  exit 2
fi
exec node "$(dirname "${BASH_SOURCE[0]}")/guard-git.mjs"
