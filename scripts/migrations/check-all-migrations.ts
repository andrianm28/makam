import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unmarkedDestructiveStatements, type DestructiveStatement } from "./destructive-ddl";

export interface UnmarkedInFile extends DestructiveStatement {
  file: string;
}

/** Unmarked destructive statements in every `NNNN_*.sql` of a folder numbered after `after`. */
export function unmarkedInMigrationsAfter(dir: string, after: number): UnmarkedInFile[] {
  return readdirSync(dir)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) > after)
    .sort()
    .flatMap((file) =>
      unmarkedDestructiveStatements(readFileSync(join(dir, file), "utf8")).map((found) => ({ file, ...found })),
    );
}
