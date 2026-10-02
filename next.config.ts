import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { sentryBuildSettings } from "./src/lib/observability/sentry-build";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg-boss and pg are server-only Node packages; keep them out of the bundle.
  serverExternalPackages: ["pg", "pg-boss"],
  headers() {
    return [
      // A Tagihan / Bukti page's link is its only key: never leak it as a referrer, never index it.
      {
        source: "/dokumen/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // The Surat Kuasa render page is opened by headless Chromium with a signed two-minute link: never cached, never a referrer.
      {
        source: "/pengurusan/:nomor/surat-kuasa/render",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // Keyless Google Maps embed on the public Lokasi page (spec, "Maps on public pages"): frame-src only, no
      // default-src, so nothing else on the page is restricted.
      {
        source: "/lokasi/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-src https://www.google.com" }],
      },
    ];
  },
  experimental: {
    // Pindah Nomor uploads a KTP check of up to 10 MB (KTP_CHECK_MAX_BYTES) plus multipart overhead.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

// Error monitoring, build-time half (ticket 72): the release (the commit) and
// the source maps. The build generates the maps and the debug ids and uploads
// nothing: scripts/ci/upload-sourcemaps.sh sends them to GlitchTip from the
// pushed image with a token that only exists as a GitHub secret, so no token can
// reach an image layer. The browser DSN stays a runtime value (src/lib/env.ts),
// because one image serves both environments.
const sentryBuild = sentryBuildSettings();

export default withSentryConfig(
  { ...nextConfig, productionBrowserSourceMaps: sentryBuild.productionBrowserSourceMaps },
  {
    silent: !process.env.CI,
    telemetry: false,
    org: sentryBuild.org,
    project: sentryBuild.project,
    authToken: sentryBuild.authToken,
    sentryUrl: sentryBuild.sentryUrl,
    sourcemaps: sentryBuild.sourcemaps,
    release: sentryBuild.release,
  },
);
