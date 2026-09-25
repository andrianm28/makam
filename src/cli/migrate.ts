/**
 * `npm run migrate` / `node dist/migrate.mjs`: the separate migration step that
 * runs before `web` and `worker` are (re)started.
 */
import { migrateDatabase } from "@/db/migrate";
import { readRuntimeEnv } from "@/lib/env";

async function main() {
  const env = readRuntimeEnv();
  console.log("[migrate] applying Drizzle migrations and pg-boss schema");
  await migrateDatabase(env.DATABASE_URL);
  console.log("[migrate] done");
}

main().catch((error: unknown) => {
  console.error("[migrate] failed", error);
  process.exit(1);
});
