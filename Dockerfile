# syntax=docker/dockerfile:1
#
# One image, three commands:
#   web     node server.js          (Next.js standalone `next start`)
#   worker  node dist/worker.mjs    (pg-boss consumers and schedules)
#   migrate node dist/migrate.mjs   (Drizzle migrations + pg-boss schema; run before restarting)

# Pinned by digest; Dependabot (docker) proposes updates.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build
# The release is the commit this image is built from: a build-time fact (the
# Sentry SDK injects it into the bundle), never a secret. ci.yml's `sourcemaps`
# job uploads the source maps under the same name.
ARG SENTRY_RELEASE=""
ENV SENTRY_RELEASE=$SENTRY_RELEASE
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No environment here, at all: one image serves staging and production, so the
# browser GlitchTip DSN is a runtime value served to the browser in the page
# (src/app/layout.tsx), never a build argument baked into the bundle.
# The source maps the build leaves behind are moved out of .next/static, which
# the web server serves, into /app/dist/sourcemaps, which nothing serves: CI
# uploads them from the image, and no browser can read the source through them.
RUN npm run build && npm run build:worker && node scripts/collect-sourcemaps.mjs

FROM base AS runner
# The live PdfRenderer ("Unduh PDF" on every Tagihan / Bukti) prints document
# pages with Debian's chromium-headless-shell: the headless-only build, far
# smaller than the full chromium package and with no Node dependency. DejaVu
# covers any glyph the page's own web fonts do not.
#
# The same layer first upgrades every Debian package already installed (ticket
# 126). The base image is only as fresh as its maintainers' last rebuild, and
# CI's image scan (Trivy) fails a `main` build on any CRITICAL that has a fix:
# perl-base 5.36.0-7+deb12u3 stopped every deploy on 2026-10-05 while
# bookworm-security already shipped 5.36.0-7+deb12u4, and the newest digest of
# the base tag still carried the old one. Refreshing the lists, upgrading and
# installing share one layer, so the lists are fresh for all three and leave
# with it.
#
# The layer sits behind an ARG that no command reads. BuildKit reuses a layer
# whose instruction and parent are unchanged, and CI keeps layers between builds
# (cache-from type=gha), so without the ARG the upgrade would run again only
# when the base digest moves, and a fix published in between would never land.
# ci.yml passes the UTC day and the attempt of the run: the layer is rebuilt by
# the first build of each day, or at once by "Re-run all jobs". A build outside
# CI leaves it empty.
ARG DEBIAN_PACKAGES_AS_OF=""
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && apt-get install -y --no-install-recommends chromium-headless-shell fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium-headless-shell
ENV NODE_ENV=production \
    TZ=Asia/Jakarta \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# The FileStore volume's mount point (FILES_ROOT, ticket 60). It must exist in
# the image and belong to `node`: a named volume created on first mount copies
# this directory's ownership, and without it Docker creates the mount point as
# root, so every upload fails with berkas_gagal_disimpan.
RUN mkdir -p /data/files && chown node:node /data/files
USER node
EXPOSE 3000
CMD ["node", "server.js"]
