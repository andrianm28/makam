// Bundles the non-Next entry points (worker, migrate, ops CLIs) into self-contained ESM
// files in dist/, so the runtime image needs no node_modules for them.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src", import.meta.url));

await build({
  entryPoints: {
    worker: "src/worker/main.ts",
    migrate: "src/cli/migrate.ts",
    "seed-admin": "src/cli/seed-admin.ts",
    "reset-totp": "src/cli/reset-totp.ts",
    "sentry-check": "src/cli/sentry-check.ts",
    "email-check": "src/cli/email-check.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  alias: { "@": src },
  // Optional native bindings that pg and Sentry probe for at runtime.
  external: ["pg-native", "@sentry/profiling-node"],
  // Let bundled CommonJS dependencies call require(), __dirname, __filename.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
});
