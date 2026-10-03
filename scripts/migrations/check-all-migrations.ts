import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unmarkedDestructiveStatements, type DestructiveStatement } from "./destructive-ddl";

export interface UnmarkedInFile extends DestructiveStatement {
  file: string;
}

/** Unmarked destructive statements in every `NNNN_*.sql` of a folder. */
export function unmarkedInMigrationsAfter(dir: string, _after: number): UnmarkedInFile[] {
  return readdirSync(dir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort()
    .flatMap((file) =>
      unmarkedDestructiveStatements(readFileSync(join(dir, file), "utf8")).map((found) => ({ file, ...found })),
    );
}
