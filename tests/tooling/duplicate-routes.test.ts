import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// One URL, one page: the guard `pageExists` cannot be.
//
// `tests/support/page-exists.ts:48` answers a boolean — `containers.some((dir)
// => existsSync(join(dir, "page.tsx")))` — so two `page.tsx` claiming one URL
// answer `true` exactly as one does, and the function has never been able to
// say "exactly one".
//
// What it cannot catch has bitten twice. Tickets 26 and 43 each created a page
// in two places — one at `src/app/<route>/page.tsx`, one inside the `(site)`
// route group — and a route group is invisible in a URL, so two files claimed
// one route. Typecheck passed, every test passed, and only `npm run build`
// failed, on Next 16.3.6's own check
// (`next-app-loader/index.js:520`): "You cannot have two parallel pages that
// resolve to the same path". This test is the early warning for that, and it
// names the two files instead of only failing.
//
// It does **not** catch a missing page; `pageExists` does that. It does not
// check that a page is reachable, exported or correct, and it says nothing
// about `route.ts` or `layout.tsx` — only that no two `page.tsx` files resolve
// to one path.
const appDir = fileURLToPath(new URL("../../src/app", import.meta.url));

/** A route group contributes nothing to the URL, so `(site)` is not a segment. */
const isRouteGroup = (segment: string): boolean => /^\(.*\)$/.test(segment);

/**
 * A parallel route slot, as the Next loader sees one: `rest[0].startsWith('@')`
 * at `next-app-loader/index.js:491`, and the subtree skipped at line 547.
 * None exists under `src/app` as of 2026-09-28, and the rule is here anyway —
 * the day one appears it must not be a false alarm.
 */
const isParallelRoute = (segment: string): boolean => segment.startsWith("@");

/** Every file under `dir`, as a path relative to it, always with `/` separators. */
function filesIn(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...filesIn(join(dir, entry.name)).map((path) => `${entry.name}/${path}`));
    } else {
      found.push(entry.name);
    }
  }
  return found;
}

/** Every directory under `dir` whose own name is `name`, as paths relative to `dir`. */
function directoriesNamed(dir: string, name: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const here = join(dir, entry.name);
    if (entry.name === name) found.push(relative(appDir, here).split(sep).join("/"));
    found.push(...directoriesNamed(here, name));
  }
  return found;
}

/**
 * The URL a page file claims, from its path relative to `src/app`: the last
 * segment (`page.tsx`) is the file, not a route, so it is dropped, and then
 * every route group is dropped with it — a page inside `(site)` claims the same
 * URL as the same page one level up, which is exactly the collision.
 *
 * `null` for a page inside a parallel route slot: the loader skips the whole
 * subtree, because a slot's page fills the slot and not the URL. Dropping only
 * the `@slot` segment instead would let `@modal/page.tsx` and `page.tsx` both
 * claim `/` — legal code that this test would then call a duplicate.
 */
function urlOf(path: string): string | null {
  const segments = path.split("/").slice(0, -1);
  if (segments.some(isParallelRoute)) return null;
  const route = segments.filter((segment) => !isRouteGroup(segment)).join("/");
  return `/${route}`;
}

/**
 * Every `page.tsx` in the tree, with the URL each one claims. The match is on
 * the exact file name: `src/app/(site)/makam-keluarga/page.test.ts` is a
 * colocated test, not a route, and a `page.*` match would count it as one.
 */
function pagesInTheTree(): { file: string; url: string }[] {
  return filesIn(appDir)
    .filter((path) => path === "page.tsx" || path.endsWith("/page.tsx"))
    .flatMap((path) => {
      const url = urlOf(path);
      return url === null ? [] : [{ file: path, url }];
    });
}

describe("the URLs the App Router pages in src/app claim", () => {
  it("are claimed by exactly one page each, naming every file when one is not", () => {
    const claimedByUrl = new Map<string, string[]>();
    for (const { file, url } of pagesInTheTree()) {
      claimedByUrl.set(url, [...(claimedByUrl.get(url) ?? []), file]);
    }
    // Written as sentences rather than as a count, because "expected 1, got 2"
    // tells whoever has to fix it nothing: which route, and which two files.
    const duplicated = [...claimedByUrl]
      .filter(([, files]) => files.length > 1)
      .map(
        ([url, files]) =>
          `${url} is claimed by ${files.length} pages: ${files.join(" and ")} — a route group is invisible in a URL, so two files claiming it is what \`npm run build\` rejects with "You cannot have two parallel pages that resolve to the same path"`,
      );
    expect(duplicated).toEqual([]);
  });

  it("are found by a walk that really walked, not one that found nothing", () => {
    // The guard above would pass vacuously on a walk that stopped descending or
    // matched the wrong file name, which is the failure mode worth naming: a
    // test that cannot fail is worse than no test. 60 pages measured under
    // src/app on 2026-09-28; the floor is 40, far enough below that deleting a
    // third of the site has to be somebody's decision rather than an accident,
    // and near enough that a walk which stopped descending trips it today.
    expect(pagesInTheTree().length).toBeGreaterThanOrEqual(40);
  });

  it("give a page sitting directly in src/app the root URL, and not an empty one", () => {
    // The one shape where the dropped `page.tsx` leaves nothing behind. The root
    // page is inside `(site)` today, and a second `src/app/page.tsx` would claim
    // the same `/` — the same collision as any other route.
    expect(urlOf("page.tsx")).toBe("/");
    expect(urlOf("(site)/page.tsx")).toBe("/");
  });

  it("drop route groups and skip parallel route slots, as the Next loader does", () => {
    // Fixtures, because no `@slot` exists in the tree: a rule that is only ever
    // exercised by its own absence is a rule nobody has run. The slot's page
    // fills the slot, not the URL, so it is skipped whole.
    expect(urlOf("(site)/faq/page.tsx")).toBe("/faq");
    expect(urlOf("(a)/(b)/faq/page.tsx")).toBe("/faq");
    expect(urlOf("@modal/x/page.tsx")).toBeNull();
    expect(urlOf("(site)/@modal/x/page.tsx")).toBeNull();
    expect(urlOf("@modal/page.tsx")).toBeNull();
  });
});

describe("the page files under src/app", () => {
  it("are files, and none of them is a directory named page.tsx", () => {
    // The URL rule drops the last segment because it is the *file* `page.tsx`.
    // A directory of that name would break that assumption quietly: the walk
    // would descend into it, the page inside would be found with `page.tsx`
    // still in its path, and no URL would ever collide. None exists; if one
    // appears it is named here rather than left to the URL rule.
    expect(directoriesNamed(appDir, "page.tsx")).toEqual([]);
    const found = pagesInTheTree();
    expect(found.every((page) => page.file.split("/").pop() === "page.tsx")).toBe(true);
  });

  it("include the route groups and dynamic segments the URL keeps and drops", () => {
    // What the walk above is being asked to read, so a change to the tree that
    // made it a different set is visible here rather than in a failing count.
    const files = pagesInTheTree().map((page) => page.file);
    expect(files).toContain("(site)/page.tsx");
    expect(files).toContain("(site)/pesanan/[nomor]/page.tsx");
    expect(files).toContain("staf/admin-platform/tpu/[tpuId]/page.tsx");
    expect(files.some((file) => file.includes("page.test.ts"))).toBe(false);
  });
});
