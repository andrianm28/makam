import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(__dirname, "..", "..", "src", "app");

/**
 * Whether an App Router route has a page: `src/app/<route>/page.tsx`, or the
 * same path inside a route group (`(site)`), which never appears in the URL. So
 * a menu item that opens a page is checked against the filesystem, not against a
 * list somebody has to remember to update.
 */
export function pageExists(route: string): boolean {
  const segments = route.split("/").filter(Boolean);
  let dir = APP_DIR;
  for (const segment of segments) {
    const here = join(dir, segment);
    if (existsSync(join(here, "page.tsx"))) return true;
    // A route group adds no URL segment, so look inside every group at this level.
    const inGroup = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\(.*\)$/.test(entry.name))
      .some((entry) => existsSync(join(dir, entry.name, segment, "page.tsx")));
    if (inGroup) return true;
    dir = here;
  }
  return false;
}
