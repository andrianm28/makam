/**
 * CI: fails when a migration file names destructive DDL without a
 * `-- contract: <reason>` marker (see destructive-ddl.ts).
 *
 *   npx tsx scripts/migrations/check-destructive-ddl.ts drizzle/0010_x.sql ...
 *
 * CI passes only the migrations the running release has not applied yet.
 */
import { readFileSync } from "node:fs";
import { unmarkedDestructiveStatements } from "./destructive-ddl";

const files = process.argv.slice(2);
let failed = false;
for (const file of files) {
  for (const found of unmarkedDestructiveStatements(readFileSync(file, "utf8"))) {
    failed = true;
    console.error(`${file}:${found.line}: ${found.reason} without "-- contract: <reason>": ${found.statement}`);
  }
}
if (failed) {
  console.error(
    "Destructive DDL breaks the release still running on this schema (expand/contract, ADR 0002). " +
      "Split it: expand now, contract in a later release, marked with a comment line `-- contract: <why nothing running needs it>` directly above the statement.",
  );
  process.exit(1);
}
console.log(`No unmarked destructive DDL in ${files.length} new migration file(s).`);
