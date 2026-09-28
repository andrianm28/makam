#!/usr/bin/env bash
# Installs the deploy tooling from a checkout of this repo onto the host.
# Re-run after changing docker-compose.prod.yml, deploy/glitchtip/compose.yml,
# deploy/bin/*, deploy/systemd/* or deploy/nginx/makam-staging-proxy.conf (on
# main). It never touches env files, secrets, nginx sites or running
# containers. It installs the nginx proxy snippet and runs `nginx -t`, but
# never reloads nginx.
#
# One way to run it, and this header used to name it without saying it was the
# only one that worked:
#
#   deploy/install-host.sh                  # as ubuntu, from a clean checkout of main
#   deploy/install-host.sh --allow-branch   # testing only: any branch, dirty tree allowed
#
# Not `sudo deploy/install-host.sh`, and not as any other user. Two things
# break, both measured on this host:
#
#   * `git status` refreshes .git/index and writes it back, so a root run left
#     the caller's index owned by root and every later git command by that user
#     failed with "fatal: .git/index: index file open failed: Permission
#     denied". The scratch index below means a root run can no longer do that.
#   * `install -m 0600` as root leaves $ROOT/<env>/compose.yml owned by root, and
#     the units that read it run as User=ubuntu, so the next deploy refuses with
#     "missing $DIR/compose.yml" (exit 78) until someone chowns it back.
#
# $ROOT is ubuntu's — the units are granted write access to it — and the sudo
# lines below are only for /etc and systemd, which are root's. A run made under
# sudo leaves $ROOT partly root-owned; repair it once with
# `sudo chown -R ubuntu:ubuntu /opt/makam-v1` before running this as ubuntu.
#
# cosign public keys: the private keys never leave GitHub (CI signs with them),
# so the public halves live on the host only and are NOT in this repository.
# Point MAKAM_COSIGN_PUB_STAGING and MAKAM_COSIGN_PUB_PROD at the files holding
# them, or leave them unset and drop the files in by hand:
#
#   sudo install -m 0644 cosign.pub /opt/makam-v1/staging/cosign.pub
#   sudo install -m 0644 cosign-prod.pub /opt/makam-v1/prod/cosign.pub
#
# Without a key for an environment its deploys are refused (exit 78), never
# silently run unverified.
set -euo pipefail

ALLOW_BRANCH=0
case "${1:-}" in
  "") ;;
  --allow-branch) ALLOW_BRANCH=1 ;;
  *) echo "usage: $0 [--allow-branch]" >&2; exit 64 ;;
esac

REPO=$(cd "$(dirname "$0")/.." && pwd)
ROOT=${MAKAM_ROOT:-/opt/makam-v1}

# `git status` refreshes the index and writes it back, which is how a root run
# of this script left the caller's .git/index owned by root. So every git call
# below runs against a copy of that index in a temporary directory: the copy is
# what git refreshes, and the trap throws it away. The real .git/index is read
# once, by cp, and never opened for writing. The copy is byte-identical, so a
# dirty tree still reads dirty and both refusals below fire exactly as before —
# only the file git writes is a throwaway. $git_dir is asked of git rather than
# assumed, because .git is a file, not a directory, in a linked worktree.
git_dir=$(git -C "$REPO" rev-parse --absolute-git-dir)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export GIT_INDEX_FILE="$scratch/index"
if [ -f "$git_dir/index" ]; then
  cp "$git_dir/index" "$GIT_INDEX_FILE" || { echo "refusing: cannot copy $git_dir/index" >&2; exit 1; }
fi

branch=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
if [ "$ALLOW_BRANCH" = 0 ]; then
  [ "$branch" = main ] || { echo "refusing: $REPO is on '$branch', not main (use --allow-branch only for testing)" >&2; exit 1; }
  [ -z "$(git -C "$REPO" status --porcelain)" ] || { echo "refusing: $REPO has uncommitted changes" >&2; exit 1; }
else
  echo "WARNING: installing from '$branch' at $(git -C "$REPO" rev-parse --short HEAD) (--allow-branch)" >&2
fi

# The compose file has no default project name; each env file must name its own.
for env in staging prod; do
  file="$ROOT/$env/$env.env"
  [ -r "$file" ] || continue
  grep -qx "MAKAM_PROJECT=makam-$env" "$file" || { echo "refusing: add MAKAM_PROJECT=makam-$env to $file" >&2; exit 1; }
done

# Everything under $ROOT is ubuntu's on purpose and is deliberately not sudo:
# the deploy units run as User=ubuntu, read compose.yml out of $ROOT and are
# granted write access to it. The sudo lines further down are the ones that
# need root, and they write to /etc and to systemd.
install -d -m 0700 "$ROOT/bin" "$ROOT/staging" "$ROOT/prod" "$ROOT/glitchtip" "$ROOT/nginx-backups"
install -m 0755 "$REPO/deploy/bin/makam-deploy" "$REPO/deploy/bin/makam-verify-image" \
  "$REPO/deploy/bin/makam-deploy-status" "$REPO/deploy/bin/makam-glitchtip-release" \
  "$REPO/deploy/bin/makam-prune-images" \
  "$REPO/deploy/bin/makam-healthcheck" "$REPO/deploy/bin/makam-diskcheck" \
  "$REPO/deploy/bin/makam-backup-files" \
  "$REPO/deploy/bin/makam-backup-db" "$REPO/deploy/bin/makam-restore-test" "$ROOT/bin/"
# Sourced by the two backup scripts, never run: 0644, beside them in $ROOT/bin.
install -m 0644 "$REPO/deploy/bin/makam-backup-lib" "$ROOT/bin/"
install -m 0600 "$REPO/docker-compose.prod.yml" "$ROOT/staging/compose.yml"
install -m 0600 "$REPO/docker-compose.prod.yml" "$ROOT/prod/compose.yml"
install -m 0600 "$REPO/deploy/glitchtip/compose.yml" "$ROOT/glitchtip/compose.yml"

# The cosign public keys. Never in the repository, never replaced silently: a
# key that is already installed stays until the rotation in the runbook says
# otherwise, so a re-run of this script cannot make a new image acceptable.
for env in staging prod; do
  var="MAKAM_COSIGN_PUB_$(echo "$env" | tr '[:lower:]-' '[:upper:]_')"
  source_file=${!var:-}
  if [ -n "$source_file" ] && [ -r "$source_file" ]; then
    sudo install -m 0644 "$source_file" "$ROOT/$env/cosign.pub"
    echo "installed the $env cosign public key from $source_file"
  elif [ -r "$ROOT/$env/cosign.pub" ]; then
    echo "kept the existing $env cosign public key ($ROOT/$env/cosign.pub)"
  else
    echo "WARNING: no cosign public key for $env; its deploys will be refused until one is installed" >&2
  fi
done

sudo install -o root -g root -m 0644 "$REPO/deploy/nginx/makam-staging-proxy.conf" /etc/nginx/snippets/makam-staging-proxy.conf
sudo nginx -t

for unit in "$REPO"/deploy/systemd/*.service "$REPO"/deploy/systemd/*.timer; do
  sudo install -m 0644 "$unit" /etc/systemd/system/
done
sudo systemctl daemon-reload
# The database Dump is encrypted with a passphrase of the operator's own making
# (docs/ops/runbook.md); this script never makes or stores one. Without it the
# backup timer refuses every night rather than writing a Dump nobody can read.
for env in staging prod; do
  [ -d "$ROOT/$env" ] || continue
  [ -s "$ROOT/$env/backup-passphrase" ] || echo "NOTE: $ROOT/$env/backup-passphrase is missing; the $env database backup will refuse until you create one (docs/ops/runbook.md)" >&2
done

sudo systemctl enable --now makam-staging-deploy.timer makam-staging-health.timer makam-staging-files-backup.timer \
  makam-staging-db-backup.timer makam-staging-restore-test.timer
# makam-prod-deploy.timer is installed but NOT enabled: production follows an
# explicit digest until the owner turns it on (runbook, "Production").
systemctl list-timers 'makam-*' --no-pager
