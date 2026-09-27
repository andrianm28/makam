import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The build step that keeps the source maps the ci.yml upload needs, and keeps
 * them out of the directory Next serves: a map under .next/static is a public
 * copy of the source.
 */
const repo = fileURLToPath(new URL("../..", import.meta.url));
const collectScript = path.join(repo, "scripts/collect-sourcemaps.mjs");

/** A build output: two chunks, each pointing at a map named after something else. */
function buildOutput() {
  const root = mkdtempSync(path.join(tmpdir(), "makam-build-"));
  mkdirSync(path.join(root, ".next/static/chunks"), { recursive: true });
  // Turbopack names a map after its own hash, not after the chunk that uses it.
  writeFileSync(path.join(root, ".next/static/chunks/app.js"), 'console.log(1)\n//# debugId=an-id\n//# sourceMappingURL=3d78ivwk78zej.js.map\n');
  writeFileSync(path.join(root, ".next/static/chunks/3d78ivwk78zej.js.map"), '{"version":3}');
  writeFileSync(path.join(root, ".next/static/chunks/app.css"), "body{}\n/*# sourceMappingURL=7g2h8k.js.map */\n");
  writeFileSync(path.join(root, ".next/static/chunks/7g2h8k.js.map"), '{"version":3}');
  return root;
}

function collect(root: string) {
  return spawnSync("node", [collectScript], { encoding: "utf8", cwd: root });
}

describe("the source maps of a build", () => {
  it("end up where CI can upload them, and not where the web server serves them", () => {
    const root = buildOutput();
    const result = collect(root);
    expect(result.status).toBe(0);
    expect(existsSync(path.join(root, "dist/sourcemaps/chunks/3d78ivwk78zej.js.map"))).toBe(true);
    expect(existsSync(path.join(root, "dist/sourcemaps/chunks/7g2h8k.js.map"))).toBe(true);
    expect(existsSync(path.join(root, ".next/static/chunks/3d78ivwk78zej.js.map"))).toBe(false);
    expect(existsSync(path.join(root, ".next/static/chunks/7g2h8k.js.map"))).toBe(false);
  });

  it("lose the sourceMappingURL comment, so no browser asks for a map that is not there", () => {
    const root = buildOutput();
    collect(root);
    // The debug id line stays: that is how the upload matches a map to a chunk.
    expect(readFileSync(path.join(root, ".next/static/chunks/app.js"), "utf8")).toBe("console.log(1)\n//# debugId=an-id\n");
    expect(readFileSync(path.join(root, ".next/static/chunks/app.css"), "utf8")).toBe("body{}\n");
  });

  it("fail the build when there are none, rather than deploying an image that can never be symbolicated", () => {
    const root = buildOutput();
    rmSync(path.join(root, ".next/static/chunks"), { recursive: true });
    mkdirSync(path.join(root, ".next/static/chunks"), { recursive: true });
    const result = collect(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/No source map/);
  });
});
