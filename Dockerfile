# syntax=docker/dockerfile:1
#
# One image, three commands:
#   web     node server.js          (Next.js standalone `next start`)
#   worker  node dist/worker.mjs    (pg-boss consumers and schedules)
#   migrate node dist/migrate.mjs   (Drizzle migrations + pg-boss schema; run before restarting)

# Pinned by digest; Dependabot (docker) proposes updates.
FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS base
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
RUN apt-get update \
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
