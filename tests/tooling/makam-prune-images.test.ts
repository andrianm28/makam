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
/**
 * The two shapes docker prints an image id in, which are **not** the same
 * string: `docker image ls --format {{.ID}}` is the 12 character short form,
 * and `docker inspect --format {{.Image}}` is the full `sha256:<64 hex>`.
 * Comparing them as they come would never match, so a running container's
 * image would be offered to docker for deletion. The fake below answers each
 * call in the shape real docker does, and these are those answers.
 */
const fullDigest = (tag: string): string => `sha256:${tag.slice(4, 5).repeat(64)}`;
const shortId = (tag: string): string => fullDigest(tag).replace("sha256:", "").slice(0, 12);
/** A `<repository> <tag> <id>` line, the way `docker image ls --format` prints one. */
const listed = (repository: string, tag: string, id = shortId(tag)): string => `${repository} ${tag} ${id}`;

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
          .map((tag, i) => `2026-09-2${i}T10:00:00+07:00 [makam-${env.name}] deploy ${IMAGE}@${fullDigest(tag)} (${tag}, revision ${tag.slice(4)})`)
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
      // `docker ps -q` prints container ids only; the file holds
      // `<container id> <image id>` pairs, so the second field is the inspect's.
      '  *"ps -q"*) [ -r "$FAKE_DOCKER_RUNNING" ] && awk \'{ print $1 }\' "$FAKE_DOCKER_RUNNING" ;;',
      '  *"inspect --format {{.Image}}"*)',
      '    awk -v c="${@: -1}" \'$1 == c { print $2 }\' "$FAKE_DOCKER_RUNNING" ;;',
      // FAKE_DOCKER_RM_FAILS is a tag, or "all": docker refusing, as it does for
      // an image a stopped container still holds.
      '  *"image rm"*)',
      '    if [ "${FAKE_DOCKER_RM_FAILS:-}" = all ] || [ "${FAKE_DOCKER_RM_FAILS:-}" = "${*##*:}" ]; then',
      '      echo "conflict: unable to delete $2 (must be forced) - image is being used by stopped container" >&2',
      "      exit 1",
      "    fi ;;",
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
  options: { running?: [string, string][]; env?: string; dryRun?: boolean } = {},
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
  const result = spawnSync("bash", [pruneScript, "--env", options.env ?? "staging", ...(options.dryRun ? ["--dry-run"] : [])], {
    encoding: "utf8",
    env,
  });
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
    // The container side is the full `sha256:` digest and the inventory side is
    // the 12 character short id, because that is what each docker call prints.
    const result = prune(
      world,
      [1, 2, 3, 4].map((n) => listed(IMAGE, version(n))),
      { running: [["other-ffi-container", fullDigest(version(1))]] },
    );
    expect(result.removed).toEqual([]);
    expect(result.output).toMatch(/in use/);
  });

  it("protects a running container's image when the two ids it was given are not the same string", () => {
    // The regression this ticket's Standards review found: comparing
    // `docker inspect {{.Image}}` (sha256:<64 hex>) with `docker image ls
    // {{.ID}}` (12 characters) as they come can never match, so the image a
    // running container holds would be offered to docker for deletion. Same
    // image here, in the two shapes docker actually prints it, one on each
    // side, and it is outside the retention set so only the check can save it.
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(
      world,
      [1, 2, 3].map((n) => listed(IMAGE, version(n))),
      { running: [["a-container-of-another-project", fullDigest(version(3))]] },
    );
    expect(result.removed).toEqual([]);
    expect(result.output).toMatch(/in use/);
    expect(result.output).toContain(shortId(version(3)));
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

  it("reports a previous version it cannot read, instead of quietly dropping it", () => {
    const world = host([
      { name: "staging", running: version(3), previous: "not-a-version", history: [1, 2, 3].map(version) },
    ]);
    const result = prune(world, [1, 2, 3].map((n) => listed(IMAGE, version(n))), { dryRun: true });
    // Reported in the log, and the running version is still honoured; the
    // unreadable one is simply not part of the retention set.
    expect(result.output).toMatch(/WARNING .*PREVIOUS_TAG/);
    expect(result.output).not.toContain(`would remove ${IMAGE}:${version(3)}`);
  });

  it("refuses when a running container's image id is not an id at all", () => {
    // Docker would have to misprint for this: an id with no hex after the
    // prefix, or in the wrong case, is not something this script may guess at.
    // It is a deleting script, so an id it cannot normalise means it does not
    // know what anything is running, and it removes nothing.
    for (const held of ["sha256:", "SHA256:aaaaaaaaaaaaaaaa", `sha256:${"A".repeat(64)}`, "not-an-id", "sha256:zz"]) {
      const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
      const result = prune(world, [1, 2, 3].map((n) => listed(IMAGE, version(n))), { running: [["a-container", held]] });
      expect(result.code, `held=${held}`).toBe(78);
      expect(result.removed, `held=${held}`).toEqual([]);
      expect(result.output, `held=${held}`).toMatch(/image id/);
    }
  });

  it("keeps a version whose own id is not an id, rather than guessing it is free", () => {
    // The same misprint on the inventory side is not fatal: it is about this one
    // version, and keeping it is the safe answer. Reported, not silent.
    for (const id of [`SHA256:${"a".repeat(64)}`, "not-an-id", "sha256:"]) {
      const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
      const result = prune(world, [listed(IMAGE, version(1)), listed(IMAGE, version(2)), listed(IMAGE, version(3), id)]);
      expect(result.removed, `id=${id}`).toEqual([]);
      expect(result.output, `id=${id}`).toMatch(/no usable id/);
    }
  });

  it("refuses an environment it does not know, and touches nothing", () => {
    const world = host([{ name: "staging", running: version(1), history: [version(1)] }]);
    const result = prune(world, [listed(IMAGE, version(1))], { env: "qa" });
    expect(result.code).toBe(64);
    expect(result.removed).toEqual([]);
  });

  it("lists exactly what it would remove, and removes nothing, on a dry run", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(world, [1, 2, 3].map((n) => listed(IMAGE, version(n))), { dryRun: true });
    expect(result.code).toBe(0);
    expect(result.output).toContain(`would remove ${IMAGE}:${version(3)}`);
    expect(result.removed).toEqual([]);
    expect(result.calls).not.toContain("image rm");
  });

  it("keeps a version whose id docker did not give, because it cannot tell it is free", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    // A listing line with no id at all: nothing to compare against the containers.
    const result = prune(world, [listed(IMAGE, version(1)), listed(IMAGE, version(2)), `${IMAGE} ${version(3)}`]);
    expect(result.removed).toEqual([]);
    expect(result.output).toMatch(/no usable id/);
  });

  it("says so with its own exit code when a version it should have removed stayed", () => {
    const world = host([{ name: "staging", running: version(2), previous: version(1), history: [1, 2].map(version) }]);
    const result = prune(world, [1, 2, 3].map((n) => listed(IMAGE, version(n))), {}, { FAKE_DOCKER_RM_FAILS: "all" });
    // 1, not 0: the space is not free, and "0" has to keep meaning "enforced".
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/could not remove/);
    expect(result.output).toMatch(/kept 2 of 3/);
  });
});
