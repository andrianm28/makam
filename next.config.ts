import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg-boss and pg are server-only Node packages; keep them out of the bundle.
  serverExternalPackages: ["pg", "pg-boss"],
};

// No org/project/auth token: source maps are not uploaded (yet); the SDK still runs.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
});
