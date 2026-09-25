#!/usr/bin/env bash
# Installs the deploy tooling from a checkout of this repo onto the host.
# Re-run after changing docker-compose.prod.yml, deploy/glitchtip/compose.yml,
# deploy/bin/* or deploy/systemd/* (on main). It never touches env files,
# secrets, nginx, or running containers.
#
#   deploy/install-host.sh            # from the repo root, as ubuntu
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
ROOT=${MAKAM_ROOT:-/opt/makam-v1}

install -d -m 0700 "$ROOT/bin" "$ROOT/staging" "$ROOT/glitchtip" "$ROOT/nginx-backups"
install -m 0755 "$REPO/deploy/bin/makam-deploy" "$REPO/deploy/bin/makam-healthcheck" "$ROOT/bin/"
install -m 0600 "$REPO/docker-compose.prod.yml" "$ROOT/staging/compose.yml"
install -m 0600 "$REPO/deploy/glitchtip/compose.yml" "$ROOT/glitchtip/compose.yml"

for unit in "$REPO"/deploy/systemd/*.service "$REPO"/deploy/systemd/*.timer; do
  sudo install -m 0644 "$unit" /etc/systemd/system/
done
sudo systemctl daemon-reload
sudo systemctl enable --now makam-staging-deploy.timer makam-staging-health.timer
systemctl list-timers 'makam-*' --no-pager
