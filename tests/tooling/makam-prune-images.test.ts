import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The host disk is shared with other projects, so makam-prune-images (deploy/bin)
// may only ever untag ghcr.io/andrianm28/makam sha-<commit> versions and must
// never touch another project's image. The fake `docker` here is the only way
// the script sees images, so every test is really a statement about which
// references that fake is asked to remove.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const pruneScript = path.join(repo, "deploy/bin/makam-prune-images");
const IMAGE = "ghcr.io/andrianm28/makam";

/** `sha-<40 hex>`, the only tag shape the script may remove. */
const version = (n: number): string => `sha-${String(n).repeat(40)}`;
/** The image id a container would hold for a version (docker compares ids, not tags). */
const idOf = (tag: string): string => `sha256:${tag.slice(4, 5).repeat(64)}`;
/** A `<repository> <tag> <id>` line, the way `docker image ls --format` prints one. */
const listed = (repository: string, tag: string, id = idOf(tag)): string => `${repository} ${tag} ${id}`;

type Environment = {
  name: "staging" | "prod";
  /** MAKAM_TAG of deployed.env: what the environment is running now. */
  running?: string;
  /** PREVIOUS_TAG of deployed.env: what a roll back would put back. */
  previous?: string;
  /** Versions in deploy.log, oldest first, as makam-deploy writes them. */
  history?: string[];
  /** An env file that does not name makam's own repository. */
  image?: string;
  /** An env file that is there at all. */
  installed?: boolean;
};

/**
 * A host with the environments given, each with the deployed.env and deploy.log
 * a real deploy leaves, and a fake `docker` holding an image inventory.
 */
function host(environments: Environment[]) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-prune-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  for (const env of environments) {
    if (env.installed === false) continue;
    const dir = path.join(root, env.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${env.name}.env`),
      `MAKAM_PROJECT=makam-${env.name}\nMAKAM_APP_ENV=${env.name === "prod" ? "production" : "staging"}\n${
        env.image ? `MAKAM_IMAGE=${env.image}\n` : ""
      }`,
    );
    if (env.running !== undefined) {
      const lines = [`MAKAM_TAG=${env.running}`];
      if (env.previous) lines.push(`PREVIOUS_TAG=${env.previous}`);
      writeFileSync(path.join(dir, "deployed.env"), `${lines.join("\n")}\n`);
    }
    const history = env.history ?? [];
    if (history.length > 0) {
      // The line makam-deploy logs for every deploy it makes.
      writeFileSync(
        path.join(dir, "deploy.log"),
        `${history
          .map((tag, i) => `2026-09-2${i}T10:00:00+07:00 [makam-${env.name}] deploy ${IMAGE}@${idOf(tag)} (${tag}, revision ${tag.slice(4)})`)
          .join("\n")}\n`,
      );
    }
  }
  const docker = path.join(bin, "docker");
  writeFileSync(
    docker,
    [
      "#!/usr/bin/env bash",
      'echo "docker $*" >> "$FAKE_DOCKER_LOG"',
      'if [ "${FAKE_DOCKER_DOWN:-0}" = 1 ]; then',
      '  echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock." >&2',
      "  exit 1",
      "fi",
      'case "$*" in',
      '  *"image ls"*) [ -r "$FAKE_DOCKER_IMAGES" ] && cat "$FAKE_DOCKER_IMAGES" ;;',
      '  *"ps -q"*) [ -r "$FAKE_DOCKER_RUNNING" ] && cat "$FAKE_DOCKER_RUNNING" ;;',
      '  *"inspect --format {{.Image}}"*)',
      '    awk -v c="${@: -1}" \'$1 == c { print $2 }\' "$FAKE_DOCKER_RUNNING" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(docker, 0o755);
  return { root, bin };
}

/**
 * Runs the prune against an image inventory (`<ref> <id>` per line) and a list
 * of running containers (`<container id> <image id>` per line), and reports
 * which references docker was actually asked to remove.
 */
function prune(
  world: ReturnType<typeof host>,
  inventory: string[],
  options: { running?: [string, string][]; env?: string } = {},
  extra: Record<string, string> = {},
) {
  const calls = path.join(world.root, "calls.log");
  writeFileSync(calls, "");
  writeFileSync(path.join(world.root, "images.txt"), `${inventory.join("\n")}\n`);
  writeFileSync(
    path.join(world.root, "running.txt"),
    `${(options.running ?? []).map(([container, image]) => `${container} ${image}`).join("\n")}\n`,
  );
  const env: NodeJS.ProcessEnv = {
    PATH: `${world.bin}:/usr/bin:/bin`,
    NODE_ENV: "test",
    MAKAM_ROOT: world.root,
    FAKE_DOCKER_LOG: calls,
    FAKE_DOCKER_IMAGES: path.join(world.root, "images.txt"),
    FAKE_DOCKER_RUNNING: path.join(world.root, "running.txt"),
    ...extra,
  };
  const result = spawnSync("bash", [pruneScript, "--env", options.env ?? "staging"], { encoding: "utf8", env });
  const log = readFileSync(calls, "utf8");
  return {
    code: result.status,
    output: `${result.stdout}${result.stderr}`,
    /** Every reference the script asked docker to remove, in order. */
    removed: log
      .split("\n")
      .map((line) => /^docker image rm (\S+)/.exec(line)?.[1])
      .filter((value): value is string => Boolean(value)),
    calls: log,
  };
}

describe("makam-prune-images", () => {
  it("keeps the last 3 versions of an environment and untags the older ones", () => {
    const world = host([
      { name: "staging", running: version(5), previous: version(4), history: [1, 2, 3, 4, 5].map(version) },
    ]);
    const result = prune(world, [1, 2, 3, 4, 5].map((n) => listed(IMAGE, version(n))));
    expect(result.code).toBe(0);
    expect(result.removed).toEqual([`${IMAGE}:${version(1)}`, `${IMAGE}:${version(2)}`]);
    expect(result.output).toContain("kept 3 of 5");
  });

  it("keeps the running version and the previous one whatever their age, so a roll back is possible", () => {
    // Staging moved on six deploys; production still runs the second of the
    // first two, so a staging retention set alone would untag what production
    // is running right now.
    const world = host([
      { name: "staging", running: version(6), previous: version(5), history: [1, 2, 3, 4, 5, 6].map(version) },
      { name: "prod", running: version(1), previous: version(2), history: [1, 2].map(version) },
    ]);
    const result = prune(world, [1, 2, 3, 4, 5, 6].map((n) => listed(IMAGE, version(n))));
    expect(result.removed).toEqual([`${IMAGE}:${version(3)}`]);
  });

  it("never removes an image another project on this host is running", () => {
    const world = host([{ name: "staging", running: version(4), previous: version(3), history: [1, 2, 3, 4].map(version) }]);
    // Version 1 is outside the retention set, and someone else's container runs
    // it: docker would refuse to remove it anyway, and the script never asks.
    const result = prune(
      world,
      [1, 2, 3, 4].map((n) => listed(IMAGE, version(n))),
      { running: [["other-ffi-container", idOf(version(1))]] },
    );
    expect(result.removed).toEqual([]);
    expect(result.output).toMatch(/in use/);
  });

  it("untags nothing but its own repository's sha-<commit> versions, whatever else the host holds", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(world, [
      listed(IMAGE, version(1)),
      listed(IMAGE, version(2)),
      // Another project on the same host, and makam's own other references.
      listed(IMAGE, "latest", `sha256:${"9".repeat(64)}`),
      listed(IMAGE, "v2026.09.27-1", `sha256:${"8".repeat(64)}`),
      listed("ghcr.io/someone-else/ffi", version(1), `sha256:${"a".repeat(64)}`),
      listed("makam-v1", "makam-t73-1a2b3c4d", `sha256:${"b".repeat(64)}`),
      listed("postgres", "18", `sha256:${"c".repeat(64)}`),
    ]);
    expect(result.removed).toEqual([]);
    expect(result.calls).not.toContain("ffi");
    expect(result.calls).not.toContain("makam-v1:");
    expect(result.calls).not.toContain("postgres");
  });

  it("untags a version of its own, but not a tag that only looks like one", () => {
    const world = host([
      { name: "staging", running: version(5), previous: version(4), history: [1, 2, 3, 4, 5].map(version) },
    ]);
    const result = prune(world, [
      listed(IMAGE, version(1)),
      listed(IMAGE, version(2)),
      listed(IMAGE, version(3)),
      listed(IMAGE, version(4)),
      listed(IMAGE, version(5)),
      // A tag that is almost, but not quite, a commit sha: not a candidate.
      listed(IMAGE, "sha-nothex", `sha256:${"7".repeat(64)}`),
    ]);
    expect(result.removed).toEqual([`${IMAGE}:${version(1)}`, `${IMAGE}:${version(2)}`]);
    expect(result.removed).not.toContain(`${IMAGE}:sha-nothex`);
  });

  it("refuses and removes nothing when the Docker daemon is unreachable", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(world, [1, 2].map((n) => listed(IMAGE, version(n))), {}, { FAKE_DOCKER_DOWN: "1" });
    expect(result.code).toBe(78);
    expect(result.removed).toEqual([]);
  });

  it("refuses an environment whose env file points at another project's image", () => {
    const world = host([
      { name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version), image: "ghcr.io/someone-else/ffi" },
    ]);
    const result = prune(world, [1, 2].map((n) => listed(IMAGE, version(n))));
    expect(result.code).toBe(78);
    expect(result.removed).toEqual([]);
    expect(result.output).toContain("ghcr.io/andrianm28/makam");
  });

  it("refuses when an environment's deployed.env does not say what it is running", () => {
    const world = host([{ name: "staging", running: "not-a-tag", history: [version(1)] }]);
    const result = prune(world, [listed(IMAGE, version(1))]);
    expect(result.code).toBe(78);
    expect(result.removed).toEqual([]);
    expect(result.output).toContain("deployed.env");
  });

  it("untags a version no environment claims, because the inventory is the only authority", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(world, [1, 2, 3].map((n) => listed(IMAGE, version(n))));
    expect(result.removed).toEqual([`${IMAGE}:${version(3)}`]);
  });

  it("keeps the number of versions the host is configured for", () => {
    const world = host([
      { name: "staging", running: version(4), previous: version(3), history: [1, 2, 3, 4].map(version) },
    ]);
    const result = prune(world, [1, 2, 3, 4].map((n) => listed(IMAGE, version(n))), {}, { MAKAM_KEEP_IMAGES: "4" });
    expect(result.removed).toEqual([]);
    expect(result.output).toContain("kept 4 of 4");
  });

  it("refuses a keep count that would drop the version a roll back needs", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(world, [1, 2].map((n) => listed(IMAGE, version(n))), {}, { MAKAM_KEEP_IMAGES: "1" });
    expect(result.code).toBe(78);
    expect(result.removed).toEqual([]);
  });

  it("refuses an environment it does not know, and touches nothing", () => {
    const world = host([{ name: "staging", running: version(1), history: [version(1)] }]);
    const result = prune(world, [listed(IMAGE, version(1))], { env: "qa" });
    expect(result.code).toBe(64);
    expect(result.removed).toEqual([]);
  });
});
