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
# Not `sudo deploy/install-host.sh`, and not as any other user. The script
# refuses a root run now (see "refusing: this script must not run as root"
# below), but here is why, both measured on this host:
#
#   * `git status` refreshes .git/index and writes it back, so a root run left
#     the caller's index owned by root and every later git command by that user
#     failed with "fatal: .git/index: index file open failed: Permission
#     denied". The scratch index below means a root run can no longer do that.
#   * `install -m 0600` as root leaves $ROOT/<env>/compose.yml owned by root, and
#     the units that read it run as User=ubuntu, so the next deploy refuses with
#     "missing $DIR/compose.yml" (exit 78) until someone chowns it back. This
#     one the script cannot repair: a chown of a host tree is the owner's call,
#     not something a deploy tool does on its way past.
#
# $ROOT is ubuntu's — the units are granted write access to it — and the sudo
# lines below are only for /etc and systemd, which are root's. Nothing in this
# script writes under $ROOT with sudo, cosign public keys included: they are
# world-readable by design, and a root-owned file in a tree the deploy units
# read as ubuntu is the failure above waiting to happen.
#
# A run made under sudo before this refusal existed leaves $ROOT partly
# root-owned; repair it once, by hand, with
# `sudo chown -R ubuntu:ubuntu /opt/makam-v1`, then run this as ubuntu. That
# chown does not repair .git/index, which is the other failure above and is not
# what it targets.
#
# cosign public keys: the private keys never leave GitHub (CI signs with them),
# so the public halves live on the host only and are NOT in this repository.
# Point MAKAM_COSIGN_PUB_STAGING and MAKAM_COSIGN_PUB_PROD at files this user can
# read, or leave them unset and drop the files in by hand:
#
#   install -m 0644 cosign.pub /opt/makam-v1/staging/cosign.pub
#   install -m 0644 cosign-prod.pub /opt/makam-v1/prod/cosign.pub
#
# No sudo there either. If a key is somewhere only root can read, copy it
# somewhere this user can read first (`sudo cp /root/cosign.pub /tmp/`, then
# `sudo chown "$(id -un)" /tmp/cosign.pub`) rather than reaching for sudo here.
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
dd if=/dev/zero of="$git_dir/index"
fi

branch=$(git -C "$REPO" rev-parse --abbrev-ref HEAD)
if [ "$ALLOW_BRANCH" = 0 ]; then
  [ "$branch" = main ] || { echo "refusing: $REPO is on '$branch', not main (use --allow-branch only for testing)" >&2; exit 1; }
  [ -z "$(git -C "$REPO" status --porcelain)" ] || { echo "refusing: $REPO has uncommitted changes" >&2; exit 1; }
else
  echo "WARNING: installing from '$branch' at $(git -C "$REPO" rev-parse --short HEAD) (--allow-branch)" >&2
fi

# The header's second damage mode, refused here because this is the last point
# before the first install and because the remedy is the owner's to run. Run as
# root, every `install` below lands in $ROOT owned by root, and the units that
# read $ROOT/<env>/compose.yml run as User=ubuntu and refuse it (exit 78). Run
# as ubuntu against a $ROOT that a root run already owns, the same thing. Both
# are refusals, not repairs: `sudo chown -R ubuntu:ubuntu /opt/makam-v1` is one
# line the owner runs once, and a deploy tool that silently chowns a host tree
# is doing a destructive thing the operator never asked for.
[ "$(id -u)" != 0 ] || {
  echo "refusing: this script must not run as root (id -u is 0). Run it as ubuntu: deploy/install-host.sh — the sudo lines below are the only ones that need root, and a root run writes $ROOT/<env>/compose.yml as root, which the deploy units read as User=ubuntu (they refuse it with exit 78). A run already made under sudo is repaired by hand with 'sudo chown -R ubuntu:ubuntu $ROOT'; that does not touch .git" >&2
  exit 1
}
# $ROOT that is not ours and not writable is the same failure, one run late. It
# is allowed not to exist: the `install -d` below is what creates it, as this
# user, and a first run has nothing to be refused by.
[ ! -d "$ROOT" ] || [ -w "$ROOT" ] || {
  echo "refusing: $ROOT exists but is not writable by $(id -un). The deploy units run as User=ubuntu and read compose.yml out of it, so a root-owned $ROOT makes every deploy refuse with exit 78. Repair it with 'sudo chown -R ubuntu:ubuntu $ROOT' and run this again as ubuntu" >&2
  exit 1
}

# The compose file has no default project name; each env file must name its own.
for env in staging prod; do
  file="$ROOT/$env/$env.env"
  [ -r "$file" ] || continue
  grep -qx "MAKAM_PROJECT=makam-$env" "$file" || { echo "refusing: add MAKAM_PROJECT=makam-$env to $file" >&2; exit 1; }
done

# Everything under $ROOT is ubuntu's on purpose and is deliberately not sudo:
# the deploy units run as User=ubuntu, read compose.yml out of $ROOT and are
# granted write access to it. The sudo lines further down are the ones that
# need root, and they write to /etc and to systemd. Nothing here writes under
# $ROOT with sudo — not even the cosign public keys, which are world-readable
# by design, and a root-owned file in a tree those units read as ubuntu is the
# exit 78 above all over again.
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
    # No sudo: the key is a public half, world-readable by design, and the tree
    # it lands in is ubuntu's. The runbook used to say `sudo install` here, and
    # that was the same contradiction in prose — see docs/ops/runbook.md.
    install -m 0644 "$source_file" "$ROOT/$env/cosign.pub"
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
