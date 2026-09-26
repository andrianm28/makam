import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg-boss and pg are server-only Node packages; keep them out of the bundle.
  serverExternalPackages: ["pg", "pg-boss"],
  headers() {
    // A Tagihan / Bukti page's link is its only key: never leak it as a referrer, never index it.
    return [
      {
        source: "/dokumen/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
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
