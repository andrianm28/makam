#!/usr/bin/env bash
# Uploads one image's browser source maps to GlitchTip (ticket 72, ADR 0002),
# and to nothing else: the URL is the instance the app reports its errors to,
# and without one this uploads nothing at all rather than falling back to
# sentry.io.
#
#   IMAGE=ghcr.io/andrianm28/makam@sha256:... RELEASE=<commit> \
#     scripts/ci/upload-sourcemaps.sh
#
# The maps are not in the repository: `next build` leaves them in the image (see
# scripts/collect-sourcemaps.mjs), because a build cannot hold the token. The
# debug ids the SDK injects match each artifact to its map, so the same release
# name (RELEASE, which must be the SENTRY_RELEASE build argument of that image)
# is all the upload needs.
#
# Needs, from the workflow's environment:
#   SENTRY_AUTH_TOKEN  a repository *secret*: a GlitchTip auth token with
#                      "project:releases" and "project:source_maps" write in the
#                      `makam` organisation (docs/ops/runbook.md)
#   SENTRY_URL         a repository *variable*: https://errors.makam.co.id
#   SENTRY_ORG         a repository variable: makam
#   SENTRY_PROJECT     a repository variable, comma separated: makam-staging,makam-prod
#                      (one image serves both environments, so both get them)
#
# A missing token or URL is a warning and exit 0: source maps are how readable a
# stack trace is, and a build that has not been given the secret yet must still
# produce an image. (This is the opposite of COSIGN_STAGING_PRIVATE_KEY, which
# the `sign` job refuses to do without: an unsigned image is a supply-chain
# hole, minified JavaScript is not.) A token that is there and an upload that
# then fails is an error, because that is a real misconfiguration to look at.
#
# Exit codes: 0 uploaded, or nothing to upload; 64 usage; 1 the upload failed.
set -euo pipefail

if [ -z "${IMAGE:-}" ] || [ -z "${RELEASE:-}" ]; then
  echo "usage: IMAGE=<image reference> RELEASE=<commit> scripts/ci/upload-sourcemaps.sh" >&2
  exit 64
fi

skip() {
  echo "::warning title=source maps::$*"
  exit 0
}

# Sentry's own default host is sentry.io, and source is source: without an
# explicit https URL, or with one that is not https, nothing is sent anywhere.
case "${SENTRY_URL:-}" in
  https://*) ;;
  "") skip "SENTRY_URL is not set, so the source maps are not uploaded (set the repository variable to https://errors.makam.co.id)" ;;
  *) echo "refusing: SENTRY_URL must be an https URL, got '$SENTRY_URL'" >&2; exit 1 ;;
esac
[ -n "${SENTRY_AUTH_TOKEN:-}" ] || skip "the GLITCHTIP_AUTH_TOKEN secret is not set on this repository, so the source maps of this image are not uploaded (GlitchTip keeps showing minified JavaScript)"
[ -n "${SENTRY_ORG:-}" ] || skip "SENTRY_ORG is not set, so the source maps are not uploaded"
[ -n "${SENTRY_PROJECT:-}" ] || skip "SENTRY_PROJECT is not set, so the source maps are not uploaded"

# Where the build put them: /app/dist/sourcemaps, moved out of .next/static so the
# web server never serves them.
MAPS_IN_IMAGE=/app/dist/sourcemaps
SENTRY_CLI=${SENTRY_CLI:-ghcr.io/getsentry/sentry-cli:2.46.0@sha256:03db524ab5066f720a66aaeae46820e41fbcf4a6c0f60d326c81cb59aa0df6ee}
work=$(mktemp -d)
container=""
# A created container that is never started still holds the image's layers.
cleanup() { [ -n "$container" ] && docker rm -f "$container" > /dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

docker pull --quiet "$IMAGE" > /dev/null
container=$(docker create "$IMAGE")
docker cp "$container:$MAPS_IN_IMAGE" "$work/maps" > /dev/null
[ -d "$work/maps" ] || { echo "refusing: $IMAGE has no $MAPS_IN_IMAGE" >&2; exit 1; }
echo "Source maps out of $IMAGE: $(find "$work/maps" -name '*.map' | wc -l) file(s) for release $RELEASE"

# -e without a value: the token travels in the environment, never in the command
# line, and it is the only thing that ever leaves this job as a secret.
IFS=',' read -ra projects <<< "$SENTRY_PROJECT"
for project in "${projects[@]}"; do
  echo "Uploading to $SENTRY_ORG/$project on $SENTRY_URL"
  docker run --rm -e SENTRY_AUTH_TOKEN -v "$work/maps:/work:ro" --entrypoint sentry-cli "$SENTRY_CLI" \
    sourcemaps upload --url "$SENTRY_URL" --org "$SENTRY_ORG" --project "$project" --release "$RELEASE" /work
done
echo "Uploaded the source maps of $RELEASE"
