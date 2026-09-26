import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Every `.ts`/`.tsx` file under `dir`, recursively, skipping test files
 * (`*.test.ts`, `*.test.tsx`). Shared by the source-scanning guard tests:
 * dependency direction, no internal ticket numbers, the ops-only email
 * verification path, and the design tokens.
 */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}
