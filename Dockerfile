# syntax=docker/dockerfile:1
#
# One image, three commands:
#   web     node server.js          (Next.js standalone `next start`)
#   worker  node dist/worker.mjs    (pg-boss consumers and schedules)
#   migrate node dist/migrate.mjs   (Drizzle migrations + pg-boss schema; run before restarting)

# Pinned by digest; Dependabot (docker) proposes updates.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No environment here, at all: one image serves staging and production, so the
# browser GlitchTip DSN is a runtime value served to the browser in the page
# (src/app/layout.tsx), never a build argument baked into the bundle.
RUN npm run build && npm run build:worker

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
USER node
EXPOSE 3000
CMD ["node", "server.js"]
