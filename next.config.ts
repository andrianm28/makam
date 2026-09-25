import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg-boss and pg are server-only Node packages; keep them out of the bundle.
  serverExternalPackages: ["pg", "pg-boss"],
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
