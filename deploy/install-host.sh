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

install -d -m 0700 "$ROOT/bin" "$ROOT/staging" "$ROOT/glitchtip" "$ROOT/nginx-backups"
install -m 0755 "$REPO/deploy/bin/makam-deploy" "$REPO/deploy/bin/makam-healthcheck" "$REPO/deploy/bin/makam-backup-files" \
  "$REPO/deploy/bin/makam-backup-db" "$REPO/deploy/bin/makam-restore-test" "$ROOT/bin/"
# Sourced by the two backup scripts, never run: 0644, beside them in $ROOT/bin.
install -m 0644 "$REPO/deploy/bin/makam-backup-lib" "$ROOT/bin/"
install -m 0600 "$REPO/docker-compose.prod.yml" "$ROOT/staging/compose.yml"
install -m 0600 "$REPO/deploy/glitchtip/compose.yml" "$ROOT/glitchtip/compose.yml"

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
systemctl list-timers 'makam-*' --no-pager
