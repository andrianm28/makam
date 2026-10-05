import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readWorkflow } from "../support/workflow";

// Ticket 126: the main CI's image scan (Trivy) fails on any CRITICAL that has a
// fix, and the one that stopped every deploy since 2026-10-05 was perl-base in
// the Debian layer of the base image itself: node:22-bookworm-slim, still the
// newest digest of its tag, shipped 5.36.0-7+deb12u3 while bookworm-security
// had 5.36.0-7+deb12u4. A pin on the base image cannot move faster than the
// image's maintainers rebuild it, so the runtime image upgrades its own Debian
// packages when it is built. These tests read the Dockerfile the way
// types-node-pin.test.ts does; the scan itself runs only in CI.
//
// An upgrade in the Dockerfile is not enough on its own: CI builds with
// `cache-from: type=gha`, and BuildKit reuses a layer whose instruction and
// parent have not changed. The log of the failing build shows this very layer
// restored from that cache (a 210 MB blob, no package downloaded), so the
// upgrade would run only when the base digest moves, and the next fixable
// CRITICAL would stop the deploys again until it did. CI therefore passes the
// day of the build as a build argument that the layer sits behind.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const read = (p: string) => readFileSync(path.join(repo, p), "utf8");

interface Instruction {
  /** The stage it belongs to: the `AS` name of the FROM above it (the image itself when it has none). */
  stage: string;
  keyword: string;
  /** Everything after the keyword, with `\` continuations joined into one line. */
  args: string;
}

/**
 * The Dockerfile's instructions in order. Comment and blank lines are skipped,
 * also between the lines of a continued instruction (which Docker allows).
 */
function instructions(dockerfile: string): Instruction[] {
  const found: Instruction[] = [];
  let stage = "";
  let continued = "";
  for (const raw of dockerfile.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.endsWith("\\")) {
      continued = `${continued} ${line.slice(0, -1).trim()}`.trim();
      continue;
    }
    const text = `${continued} ${line}`.trim();
    continued = "";
    const [, keyword, args] = /^(\S+)\s*(.*)$/.exec(text)!;
    if (keyword.toUpperCase() === "FROM") {
      const from = /^(\S+)(?:\s+AS\s+(\S+))?$/i.exec(args)!;
      stage = from[2] ?? from[1];
    }
    found.push({ stage, keyword: keyword.toUpperCase(), args });
  }
  return found;
}

/** The base images the Dockerfile pulls: its FROM lines that do not name an earlier stage. */
function externalImages(dockerfile: string): string[] {
  const stages = new Set<string>();
  const images: string[] = [];
  for (const { args } of instructions(dockerfile).filter((i) => i.keyword === "FROM")) {
    const from = /^(\S+)(?:\s+AS\s+(\S+))?$/i.exec(args)!;
    if (!stages.has(from[1])) images.push(from[1]);
    stages.add(from[2] ?? from[1]);
  }
  return images;
}

/** The commands of the `runner` stage's one RUN that calls apt-get (`a && b && c` read as a, b, c). */
function aptCommands(dockerfile: string): string[] {
  const layers = instructions(dockerfile).filter((i) => i.stage === "runner" && i.keyword === "RUN" && /\bapt-get\b/.test(i.args));
  if (layers.length !== 1) throw new Error(`the runner stage has ${layers.length} RUN layers that call apt-get; the lists, the upgrade and the install belong in one`);
  return layers[0].args.split(/\s*&&\s*/);
}

/** Where, in that layer, the lists are refreshed, the installed packages upgraded and new ones installed (-1: nowhere). */
function aptOrder(dockerfile: string): { update: number; upgrade: number; install: number } {
  const commands = aptCommands(dockerfile);
  const at = (verb: RegExp) => commands.findIndex((command) => verb.test(command));
  return {
    update: at(/^apt-get update\b/),
    upgrade: at(/^apt-get (upgrade|dist-upgrade|full-upgrade)\b/),
    install: at(/^apt-get install\b/),
  };
}

/** The runner stage's apt layer as it was before ticket 126: it installs, and upgrades nothing. */
const BEFORE_TICKET_126 = `
FROM node:22-bookworm-slim@sha256:${"0".repeat(64)} AS base
FROM base AS runner
RUN apt-get update \\
 && apt-get install -y --no-install-recommends chromium-headless-shell fonts-dejavu-core \\
 && rm -rf /var/lib/apt/lists/*
`;

describe("the runtime image's Dockerfile", () => {
  const dockerfile = read("Dockerfile");

  it("upgrades the Debian packages of the runner stage, after refreshing the lists and before installing Chromium", () => {
    const { update, upgrade, install } = aptOrder(dockerfile);
    expect(update, "apt-get update").toBeGreaterThanOrEqual(0);
    expect(upgrade, "apt-get upgrade, so bookworm-security's fixes land at build time").toBeGreaterThan(update);
    expect(install, "apt-get install of Chromium and its font").toBeGreaterThan(upgrade);
    expect(aptCommands(dockerfile)[upgrade], "the upgrade asks no question").toMatch(/(^|\s)-y(\s|$)/);
  });

  it("installs Chromium and its font without a prompt and without recommended packages, and removes the package lists in the same layer", () => {
    const commands = aptCommands(dockerfile);
    const install = commands[aptOrder(dockerfile).install];
    expect(install, "the install asks no question").toMatch(/(^|\s)-y(\s|$)/);
    expect(install, "the install skips recommended packages").toContain("--no-install-recommends");
    expect(commands.at(-1), "the same layer removes the lists").toMatch(/^rm -rf \/var\/lib\/apt\/lists\/?\*?$/);
  });

  it("pins every base image by tag and digest (AGENTS.md: a new image by digest)", () => {
    const images = externalImages(dockerfile);
    expect(images.length, "the Dockerfile pulls at least one base image").toBeGreaterThan(0);
    for (const image of images) expect(image).toMatch(/^[a-z0-9][\w./-]*:[\w.-]+@sha256:[0-9a-f]{64}$/);
  });

  it("reports the apt layer as it was before ticket 126, which upgraded nothing", () => {
    const { update, upgrade, install } = aptOrder(BEFORE_TICKET_126);
    expect(update).toBe(0);
    expect(upgrade).toBe(-1);
    expect(install).toBe(1);
  });

  it("reads an instruction that continues over several lines, comments between the lines included", () => {
    const sample = ["# syntax=docker/dockerfile:1", "FROM node:22@sha256:abc AS base", "FROM base AS runner", "RUN a \\", "  # a comment inside the instruction", "  && b \\", "", "  && c", "USER node"].join("\n");
    expect(instructions(sample)).toEqual([
      { stage: "base", keyword: "FROM", args: "node:22@sha256:abc AS base" },
      { stage: "runner", keyword: "FROM", args: "base AS runner" },
      { stage: "runner", keyword: "RUN", args: "a && b && c" },
      { stage: "runner", keyword: "USER", args: "node" },
    ]);
    expect(externalImages(sample)).toEqual(["node:22@sha256:abc"]);
  });
});

describe("the runtime image's Debian layer in CI", () => {
  it("sits behind a build argument that carries the UTC day and the attempt of the CI build, so the upgrade runs again every day and not only when the base image moves", () => {
    const runner = instructions(read("Dockerfile")).filter((i) => i.stage === "runner");
    const apt = runner.findIndex((i) => i.keyword === "RUN" && /\bapt-get\b/.test(i.args));
    const keys = runner.slice(0, apt).filter((i) => i.keyword === "ARG");
    expect(keys, "one ARG of the runner stage, ahead of its apt layer").toHaveLength(1);
    const key = /^(\w+)=/.exec(keys[0].args)?.[1];
    expect(key, "an ARG with a default, so a build outside CI needs no argument").toBeDefined();

    const job = readWorkflow("ci.yml").job("image");
    const build = job.steps.find((step) => step.uses?.startsWith("docker/build-push-action@"));
    expect(build, "the image job builds with docker/build-push-action").toBeDefined();
    const value = new RegExp(`^\\s*${key}=(.+)$`, "m").exec(build!.text)?.[1];
    expect(value, `the build step passes ${key} in build-args`).toBeDefined();
    expect(value, "a re-run of all jobs is a new attempt: it rebuilds the layer at once").toContain("${{ github.run_attempt }}");

    const day = /\$\{\{\s*steps\.(\w+)\.outputs\.(\w+)\s*\}\}/.exec(value!);
    expect(day, "the day comes from a step output").not.toBeNull();
    const producer = job.steps.slice(0, job.steps.indexOf(build!)).find((step) => step.id === day![1]);
    expect(producer?.run, "a step before the build computes the day in UTC").toContain("date -u +%F");
    expect(producer?.run, "and publishes it under the name the build argument reads").toContain(`${day![2]}=$(date -u +%F)" >> "$GITHUB_OUTPUT"`);
  });
});
