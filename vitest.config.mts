import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Tests run as the "test" environment: every release open (ADR 0006), unless a test sets RILIS_TERBUKA.
    env: { APP_ENV: "test" },
    include: ["src/**/*.test.ts", "tests/**/*.test.ts", "scripts/agents/*.test.ts"],
    environment: "node",
    // One Postgres for the whole run, migrated fresh; tests reset it between cases.
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
