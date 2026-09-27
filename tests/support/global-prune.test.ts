import { describe, expect, it } from "vitest";
import { globalPrunes, type ScannableFile } from "./global-prune";

// This is the guard for the one rule a shared host cannot survive breaking: no
// cleanup that reaches beyond makam's own objects. The file list is what the
// reviews found wrong, twice: an extension filter that skipped every
// extension-less executable in deploy/bin (where the prune lives), and then a
// mode check that skipped two more scripts git records as 100644, plus the
// Dockerfile and the systemd units. So each case below names a place a prune
// could hide and that place has to be caught.
const file = (path: string, text: string): ScannableFile => ({ path, text });

describe("a Docker cleanup that has no name", () => {
  it("is found in a shell script, whether or not the file has an extension", () => {
    const prune = "docker image rm ghcr.io/andrianm28/makam:sha-x\ndocker image prune\n";
    for (const path of [
      "deploy/bin/makam-prune-images",
      "deploy/bin/makam-deploy-status",
      "deploy/bin/makam-backup-lib",
      "scripts/something.sh",
      ".claude/hooks/require-model.sh",
    ]) {
      expect(globalPrunes(file(path, prune)), path).toEqual([`${path}:2: docker image prune`]);
    }
  });

  it("is found in a file whose name says nothing about what it is", () => {
    // No suffix, and git records these as 100644 even though the host installs
    // two of them as 0755. A rule that looked at the mode or the suffix would
    // have skipped every one of them.
    for (const path of ["Dockerfile", "deploy/systemd/makam-staging-health.service", "deploy/systemd/makam-staging-health.timer", "deploy/nginx/makam.conf"]) {
      expect(globalPrunes(file(path, "RUN docker volume prune\n"))).toEqual([`${path}:1: docker volume prune`]);
    }
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
    expect(globalPrunes(file("deploy/bin/makam-prune-images", `${cases.join("\n")}\n`))).toHaveLength(cases.length);
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
      "docker image rm makam-v1:makam-makam-t73-236e8dde   # never a prune without a name",
    ].join("\n");
    expect(globalPrunes(file("deploy/bin/makam-prune-images", text))).toEqual([]);
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

  it("is not looked for in documentation, which cannot run a command", () => {
    // Prose names these commands constantly, and this file is where the rule
    // and the reason it exists are written down.
    const prose = "Never run `docker system prune` on this host.\n";
    for (const path of ["AGENTS.md", "docs/ops/runbook.md", "CONTEXT.md", ".scratch/makam-v1-build/issues/73.md", "notes.txt"]) {
      expect(globalPrunes(file(path, prose)), path).toEqual([]);
    }
  });

  it("is not looked for in a build directory or a lock file", () => {
    expect(globalPrunes(file("node_modules/left-pad/index.js", "docker system prune\n"))).toEqual([]);
    expect(globalPrunes(file(".next/server/app.js", "docker system prune\n"))).toEqual([]);
    expect(globalPrunes(file("package-lock.json", '{"name":"x"}'))).toEqual([]);
  });

  it("names the file and the line, so the failure says where to look", () => {
    const text = ["#!/usr/bin/env bash", "set -euo pipefail", "docker volume prune", ""].join("\n");
    expect(globalPrunes(file("deploy/bin/makam-backup-db", text))).toEqual(["deploy/bin/makam-backup-db:3: docker volume prune"]);
  });
});
