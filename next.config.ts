import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

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

// No org/project/auth token: source maps are not uploaded (yet); the SDK still runs.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
});
