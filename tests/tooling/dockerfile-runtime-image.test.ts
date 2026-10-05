import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Ticket 126: the main CI's image scan (Trivy) fails on any CRITICAL that has a
// fix, and the one that stopped every deploy since 2026-10-05 was perl-base in
// the Debian layer of the base image itself: node:22-bookworm-slim, still the
// newest digest of its tag, shipped 5.36.0-7+deb12u3 while bookworm-security
// had 5.36.0-7+deb12u4. A pin on the base image cannot move faster than the
// image's maintainers rebuild it, so the runtime image upgrades its own Debian
// packages when it is built. These tests read the Dockerfile the way
// types-node-pin.test.ts does; the scan itself runs only in CI.
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
    const [, keyword, args] = /^(\S+)\s*(.*)$/s.exec(text)!;
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
