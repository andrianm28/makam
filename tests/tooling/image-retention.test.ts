import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The host this repository deploys to is shared with other projects, so nothing
// in here may ever clean Docker up globally: a prune without a name reaches
// images, volumes and networks that belong to somebody else. Retention is by
// name and by label only (deploy/bin/makam-prune-images, scripts/clean.mts).
const repo = fileURLToPath(new URL("../..", import.meta.url));
const retention = readFileSync(path.join(repo, ".github/workflows/image-retention.yml"), "utf8");

/** Every tracked source file a prune could hide in. */
function sources(dir: string): string[] {
  return readdirSync(path.join(repo, dir)).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(path.join(repo, full)).isDirectory()) return sources(full);
    return /\.(ts|mts|mjs|sh|yml|yaml)$/.test(entry) ? [full] : [];
  });
}

describe("the shared host's Docker objects", () => {
  it("are never cleaned up by a prune that has no name", () => {
    const forbidden = [
      /docker\s+system\s+prune/,
      /docker\s+image\s+prune/,
      /docker\s+volume\s+prune/,
      /docker\s+network\s+prune/,
      /docker\s+builder\s+prune/,
      /\bprune\s+(-a|--all)\b/,
    ];
    const found = ["deploy", "scripts", ".github"].flatMap(sources).filter((file) => {
      const text = readFileSync(path.join(repo, file), "utf8");
      // Only what a shell or a docker CLI would run, not a word in a comment.
      return forbidden.some((pattern) => pattern.test(text.replace(/^\s*#.*$/gm, "")));
    });
    expect(found).toEqual([]);
  });
});

describe("the monthly image retention run", () => {
  it("runs once a month", () => {
    expect(retention).toMatch(/cron:\s*"[\d*\/ ]+ [\d*\/]+ 1 \* \*"/);
  });

  it("asks which versions have expired, so the deletion is the tested one", () => {
    expect(retention).toContain("scripts/images/expired-versions.ts");
  });

  it("deletes version by version, never a tag or a wildcard", () => {
    expect(retention).toMatch(/gh api --method DELETE "[^"]*versions\/\$\{?[A-Za-z_]+\}?"/);
  });

  it("may be started by hand, and can be asked to only report", () => {
    expect(retention).toContain("workflow_dispatch");
    expect(retention).toContain("dry_run");
  });
});
