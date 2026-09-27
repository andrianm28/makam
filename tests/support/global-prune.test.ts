import { describe, expect, it } from "vitest";
import { globalPrunes, type ScannableFile } from "./global-prune";

// This is the guard for the one rule a shared host cannot survive breaking: no
// cleanup that reaches beyond makam's own objects. The file list is what the
// ticket's Standards review found wrong the first time round — an extension
// filter that skipped every extension-less executable in deploy/bin, which is
// where the prune lives — so each case below names a place a prune could hide
// and that place has to be caught.
const file = (path: string, text: string, mode = "100644"): ScannableFile => ({ path, mode, text });

describe("a Docker cleanup that has no name", () => {
  it("is found in a shell script, whether or not the file has an extension", () => {
    const prune = "docker image rm ghcr.io/andrianm28/makam:sha-x\ndocker image prune\n";
    expect(globalPrunes(file("deploy/bin/makam-prune-images", prune, "100755"))).toEqual([
      "deploy/bin/makam-prune-images:2: docker image prune",
    ]);
    expect(globalPrunes(file("scripts/something.sh", prune))).toEqual(["scripts/something.sh:2: docker image prune"]);
    expect(globalPrunes(file(".claude/hooks/require-model.sh", prune, "100755"))).toEqual([
      ".claude/hooks/require-model.sh:2: docker image prune",
    ]);
  });

  it("is found in a TypeScript file, a workflow, a compose file and package.json", () => {
    for (const path of ["src/lib/thing.ts", "e2e/smoke.spec.ts", ".github/workflows/ci.yml", "docker-compose.yml", "package.json"]) {
      expect(globalPrunes(file(path, 'run("docker system prune -a")\n'))).toEqual([`${path}:1: docker system prune -a`]);
    }
  });

  it("is found whatever it is called", () => {
    const cases = [
      "docker system prune",
      "docker image prune",
      "docker volume prune",
      "docker network prune",
      "docker builder prune",
      "docker system prune -a --volumes",
      "docker image prune --all",
      "docker container prune",
    ];
    expect(globalPrunes(file("deploy/bin/makam-prune-images", `${cases.join("\n")}\n`, "100755"))).toHaveLength(cases.length);
  });

  it("is found when it is a bare prune with an -a, which is the same reach", () => {
    expect(globalPrunes(file("scripts/clean.mts", "await run(`docker system prune -af`);\n"))).toEqual([
      "scripts/clean.mts:1: docker system prune -af",
    ]);
    expect(globalPrunes(file("scripts/clean.mts", "run('prune -a')\n"))).toEqual(["scripts/clean.mts:1: prune -a"]);
  });

  it("is not a false alarm on a comment in either language", () => {
    // The runbook and AGENTS.md are full of these words, and so is a script
    // explaining why it does not do it.
    const text = [
      "# never `docker image prune` here: the host is shared",
      "// docker image prune would reach another project's images",
      "/* docker system prune -a */",
      "docker image rm makam-v1:makam-t73-236e8dde   # never a prune without a name",
    ].join("\n");
    expect(globalPrunes(file("deploy/bin/makam-prune-images", text, "100755"))).toEqual([]);
    expect(globalPrunes(file("scripts/lib/docker.ts", text))).toEqual([]);
  });

  it("is not a false alarm on the selective cleanups this repository is allowed to do", () => {
    const allowed = [
      'run("docker", ["image", "rm", tag])',
      'run("docker", ["rm", "-f", "-v", ...containers])',
      'run("docker", ["volume", "rm", id])',
      'run("docker", ["network", "rm", id])',
      'run("docker", ["image", "ls", "ghcr.io/andrianm28/makam"])',
      "docker rmi --no-prune ghcr.io/andrianm28/makam:sha-abc",
    ].join("\n");
    expect(globalPrunes(file("scripts/clean.mts", allowed))).toEqual([]);
  });

  it("is not looked for in files that cannot run anything", () => {
    // Documentation names these commands constantly, and prose runs nothing.
    const prose = "Never run `docker system prune` on this host.\n";
    expect(globalPrunes(file("AGENTS.md", prose))).toEqual([]);
    expect(globalPrunes(file("docs/ops/runbook.md", prose))).toEqual([]);
    expect(globalPrunes(file(".scratch/makam-v1-build/issues/73-image-retention-and-host-disk.md", prose))).toEqual([]);
    expect(globalPrunes(file("CONTEXT.md", prose))).toEqual([]);
  });

  it("is not looked for in a file git does not track or does not have as text", () => {
    expect(globalPrunes(file("node_modules/left-pad/index.js", "docker system prune\n"))).toEqual([]);
    expect(globalPrunes(file(".next/server/app.js", "docker system prune\n"))).toEqual([]);
    expect(globalPrunes(file("package-lock.json", '{"name":"x"}'))).toEqual([]);
  });

  it("names the file and the line, so the failure says where to look", () => {
    const text = ["#!/usr/bin/env bash", "set -euo pipefail", "docker volume prune", ""].join("\n");
    expect(globalPrunes(file("deploy/bin/makam-backup-db", text, "100755"))).toEqual([
      "deploy/bin/makam-backup-db:3: docker volume prune",
    ]);
  });
});
