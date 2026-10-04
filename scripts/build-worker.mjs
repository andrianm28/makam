// Bundles the non-Next entry points (worker, migrate, ops CLIs) into self-contained ESM
// files in dist/, so the runtime image needs no node_modules for them.
import { build } from "esbuild";
import { cp, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src", import.meta.url));

await build({
  entryPoints: {
    worker: "src/worker/main.ts",
    migrate: "src/cli/migrate.ts",
    "seed-admin": "src/cli/seed-admin.ts",
    "seed-tagihan": "src/cli/seed-tagihan.ts",
    "seed-saat-duka": "src/cli/seed-saat-duka.ts",
    "seed-contoh-publik": "src/cli/seed-contoh-publik.ts",
    "data-contoh": "src/cli/data-contoh.ts",
    "reset-totp": "src/cli/reset-totp.ts",
    "verify-email": "src/cli/verify-email.ts",
    "sentry-check": "src/cli/sentry-check.ts",
    "email-check": "src/cli/email-check.ts",
    "env-check": "src/cli/env-check.ts",
    "pdf-check": "src/cli/pdf-check.ts",
    "import-katalog-lama": "src/cli/import-katalog-lama.ts",
    "import-data-peluncuran": "src/cli/import-data-peluncuran.ts",
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

// seed-contoh-publik's fixture() (and so data-contoh's, which reuses it) resolves its Kunjungan Verifikasi JPEGs relative to
// its own file's import.meta.url, so once bundled to dist/seed-contoh-publik.mjs it
// reads them from dist/fixtures/contoh-publik, not from src/cli/fixtures/contoh-publik
// (the source layout, which the runtime image never gets: only dist/ is copied in).
// Only the .jpg fixtures are copied — the fixtures directory's own PHOTOS.md is
// documentation for the source tree, nothing the command reads.
const fixturesSrc = fileURLToPath(new URL("../src/cli/fixtures/contoh-publik", import.meta.url));
const fixturesDest = fileURLToPath(new URL("../dist/fixtures/contoh-publik", import.meta.url));
const photos = (await readdir(fixturesSrc)).filter((name) => name.endsWith(".jpg"));
await mkdir(fixturesDest, { recursive: true });
await Promise.all(photos.map((name) => cp(`${fixturesSrc}/${name}`, `${fixturesDest}/${name}`)));
console.log(`Copied ${photos.length} JPEG fixture(s) to dist/fixtures/contoh-publik`);
