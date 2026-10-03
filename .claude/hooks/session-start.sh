#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (claude.ai/code).
# Runs only in the cloud container (CLAUDE_CODE_REMOTE=true); on the shared VPS it does nothing,
# because worktrees there use `npm run deps` and the shared `makam-testpg` (AGENTS.md).
set -uo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Dependencies. The cloud clone starts from a snapshot whose node_modules can lag the lockfile, so
# a thread's gate would run on stale packages: reinstall when the lockfile's hash differs from the
# one recorded at the last install (a missing node_modules or a missing record counts as different).
lock_hash=""
[ -f package-lock.json ] && lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat node_modules/.makam-lock-hash 2>/dev/null)" != "$lock_hash" ]; then
  if npm ci --no-audit --no-fund >/tmp/makam-npm-ci.log 2>&1; then
    [ -n "$lock_hash" ] && echo "$lock_hash" > node_modules/.makam-lock-hash
  else
    echo "npm ci failed, see /tmp/makam-npm-ci.log" >&2
  fi
fi

# Docker: Vitest starts a Postgres 18 test container (the image's Postgres 16 is not used).
# The environment's setup script may already be starting dockerd/containerd: wait for it first,
# because a second dockerd races it and dies with "timeout waiting for containerd to start".
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  if pgrep -x dockerd >/dev/null 2>&1 || pgrep -x containerd >/dev/null 2>&1; then
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
fi
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then SUDO=sudo; else SUDO=""; fi
  ($SUDO dockerd >/tmp/makam-dockerd.log 2>&1 &)
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || echo "Docker daemon did not start; tests need it (see /tmp/makam-dockerd.log)" >&2
fi
# Chromium for the real PdfRenderer test and Playwright: prefer a headless-shell build
# (production's chromium-headless-shell, and the Playwright one Chromium's own image installs),
# since the full Chrome browser build spins up background services (component updater, SODA,
# safe browsing) that retry network calls this sandbox blocks and can hang well past the
# test's timeout instead of failing fast, as it does on CI's unrestricted runners.
if [ -z "${CHROMIUM_PATH:-}" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  chrome="$(command -v chromium-headless-shell || true)"
  if [ -z "$chrome" ]; then
    # The cloud image ships Playwright's Chromium under PLAYWRIGHT_BROWSERS_PATH (/opt/pw-browsers);
    # prefer it, then ~/.cache/ms-playwright; within a directory take the newest version.
    for dir in ${PLAYWRIGHT_BROWSERS_PATH:+"$PLAYWRIGHT_BROWSERS_PATH"} "$HOME/.cache/ms-playwright"; do
      chrome="$(ls -d "$dir"/chromium_headless_shell-*/chrome-headless-shell-linux*/chrome-headless-shell 2>/dev/null | sort -V | tail -n 1 || true)"
      [ -n "$chrome" ] && break
    done
  fi
  if [ -z "$chrome" ]; then
    # No headless-shell build found anywhere: fall back to a full browser, which is what CI
    # does too (its runners have real internet, so the same background probes fail fast there).
    chrome="$(command -v google-chrome || command -v chromium || true)"
    if [ -z "$chrome" ]; then
      for dir in ${PLAYWRIGHT_BROWSERS_PATH:+"$PLAYWRIGHT_BROWSERS_PATH"} "$HOME/.cache/ms-playwright"; do
        chrome="$(ls -d "$dir"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -n 1 || true)"
        [ -n "$chrome" ] && break
      done
    fi
  fi
  [ -n "$chrome" ] && echo "export CHROMIUM_PATH=\"$chrome\"" >> "$CLAUDE_ENV_FILE"
fi
exit 0
