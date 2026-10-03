#!/usr/bin/env bash
# Installs the deploy tooling from a checkout of this repo onto the host.
# Re-run after changing docker-compose.prod.yml, deploy/glitchtip/compose.yml,
# deploy/bin/*, deploy/systemd/* or deploy/nginx/makam-staging-proxy.conf (on
# main). It never touches env files, secrets, nginx sites or running
# containers. It installs the nginx proxy snippet and runs `nginx -t`, but
# never reloads nginx.
#
#   deploy/install-host.sh                  # from a clean checkout of main, as ubuntu
#   deploy/install-host.sh --allow-branch   # testing only: any branch, dirty tree allowed
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

install -d -m 0700 "$ROOT/bin" "$ROOT/staging" "$ROOT/prod" "$ROOT/glitchtip" "$ROOT/nginx-backups"
install -m 0755 "$REPO/deploy/bin/makam-deploy" "$REPO/deploy/bin/makam-verify-image" \
  "$REPO/deploy/bin/makam-deploy-status" "$REPO/deploy/bin/makam-glitchtip-release" \
  "$REPO/deploy/bin/makam-prune-images" \
  "$REPO/deploy/bin/makam-healthcheck" "$REPO/deploy/bin/makam-diskcheck" \
  "$REPO/deploy/bin/makam-backup-files" \
  "$REPO/deploy/bin/makam-backup-db" "$REPO/deploy/bin/makam-restore-test" \
  "$REPO/deploy/bin/makam-preflight" "$ROOT/bin/"
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
