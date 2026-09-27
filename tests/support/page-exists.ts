import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = join(__dirname, "..", "..", "src", "app");

/** A route group adds no URL segment, so its directory may sit anywhere in the chain. */
function routeGroupsIn(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\(.*\)$/.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** `dir` and every directory reachable from it by descending through route groups only. */
function containersAt(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return [dir, ...routeGroupsIn(dir).flatMap((group) => containersAt(join(dir, group)))];
}

/**
 * Whether an App Router route has a page of its own: `src/app/<route>/page.tsx`,
 * or the same path inside route groups (`(site)`, nested ones too), which never
 * appear in the URL.
 *
 * A `page.tsx` is accepted **only on the last segment**. A directory halfway down
 * holding a page is a *prefix* page — `/staf/page.tsx` is the staff area's own
 * page, not the page of `/staf/admin-platform/antrean` — so returning true for
 * the first segment that happens to have a page would make every route beneath it
 * look real, and a menu link to a page nobody wrote would pass unchecked. Where a
 * level has route groups, the walk descends into them and keeps going, so the
 * check stays on the route's last segment.
 */
export function pageExists(route: string): boolean {
  const segments = route.split("/").filter(Boolean);
  let containers = containersAt(APP_DIR);
  for (const segment of segments) {
    const next: string[] = [];
    for (const dir of containers) {
      next.push(join(dir, segment));
      for (const group of routeGroupsIn(dir)) next.push(join(dir, group, segment));
    }
    containers = next.flatMap(containersAt);
    if (containers.length === 0) return false;
  }
  return containers.some((dir) => existsSync(join(dir, "page.tsx")));
}
