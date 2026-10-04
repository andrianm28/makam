import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A host deploys only an image digest that carries this environment's cosign
// signature (deploy/bin/makam-verify-image, called by makam-deploy before
// `migrate`). The fakes here stand in for cosign, docker and curl, so the
// scripts run anywhere with bash: what matters is the exit code the timer sees
// and the lines that land in deploy.log.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const verifyScript = path.join(repo, "deploy/bin/makam-verify-image");
const deployScript = path.join(repo, "deploy/bin/makam-deploy");
const releaseScript = path.join(repo, "deploy/bin/makam-glitchtip-release");
const pruneScript = path.join(repo, "deploy/bin/makam-prune-images");
const IMAGE = "ghcr.io/andrianm28/makam";
const DIGEST = `sha256:${"a".repeat(64)}`;
const TAG_ONE = "sha-1111111111111111111111111111111111111111";
const TAG_TWO = "sha-2222222222222222222222222222222222222222";
const TAG_OLD = "sha-9999999999999999999999999999999999999999";
const TAG_OLDER = "sha-8888888888888888888888888888888888888888";
/** What the fake image says its revision is: the commit the GlitchTip release is named after. */
const REVISION = "0123456789abcdef0123456789abcdef01234567";

/**
 * A host root with one environment's env file, compose file, cosign public key
 * and a `bin` directory holding the real verify and release scripts plus fakes
 * for cosign and docker, so PATH resolution inside the scripts works as on a
 * real host. `extra` adds env-file settings, e.g. the GlitchTip token.
 */
function host(env: "staging" | "prod" = "staging", extra = "") {
  const root = mkdtempSync(path.join(tmpdir(), "makam-host-"));
  const bin = path.join(root, "bin");
  mkdirSync(path.join(root, env), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path.join(root, env, `${env}.env`),
    `MAKAM_PROJECT=makam-${env}\nMAKAM_APP_ENV=${env === "prod" ? "production" : "staging"}\nMAKAM_WEB_PORT=3100\n${extra}`,
  );
  writeFileSync(path.join(root, env, "compose.yml"), "services: {}\n");
  copyFileSync(verifyScript, path.join(bin, "makam-verify-image"));
  copyFileSync(releaseScript, path.join(bin, "makam-glitchtip-release"));
  copyFileSync(pruneScript, path.join(bin, "makam-prune-images"));
  return { root, bin, env };
}

/** A fake `cosign`: signed unless FAKE_COSIGN_SIGNED=0. It records what it verified. */
function fakeCosign() {
  return [
    "#!/usr/bin/env bash",
    'echo "cosign $*" >> "$FAKE_DOCKER_LOG"',
    'if [ "${FAKE_COSIGN_SIGNED:-1}" = 1 ]; then exit 0; fi',
    "echo 'no matching signatures' >&2",
    "exit 1",
    "",
  ].join("\n");
}

/**
 * A fake `docker`: records every call and answers the three things the deploy
 * script asks of an image (its revision label, its digest, whether it is there).
 * A digest is derived from the ref, so two tags are two digests. `up` counts its
 * calls, so a test can let the first `up` succeed and the roll back's fail.
 */
function fakeDocker() {
  return [
    "#!/usr/bin/env bash",
    'echo "docker $*" >> "$FAKE_DOCKER_LOG"',
    'case "$*" in',
    "  *'image inspect'*'org.opencontainers.image.revision'*) echo '0123456789abcdef0123456789abcdef01234567' ;;",
    "  *'image inspect'*'RepoDigests'*)",
    '    ref="${*##* }"',
    "    echo \"$IMAGE@sha256:$(printf '%s' \"$ref\" | sha256sum | cut -c1-64)\" ;;",
    "  *'image inspect'*) exit 0 ;;",
    "  *'ps --status running -q'*) echo 'container-id' ;;",
    // FAKE_PULL_FAIL_FIRST=N fails the first N pulls (of refs containing FAKE_PULL_FAIL_MATCH, all by default), as ghcr's TLS handshake timeout does now and then.
    "  'pull '*)",
    '    case "$*" in',
    '      *"${FAKE_PULL_FAIL_MATCH:-}"*)',
    '        n=$(cat "$FAKE_DOCKER_LOG.pulls" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$FAKE_DOCKER_LOG.pulls"',
    '        [ "$n" -gt "${FAKE_PULL_FAIL_FIRST:-0}" ] || { echo "Error response from daemon: net/http: TLS handshake timeout" >&2; exit 1; } ;;',
    "    esac ;;",
    "  *'image ls'*) [ -r \"${FAKE_DOCKER_IMAGES:-/nonexistent}\" ] && cat \"$FAKE_DOCKER_IMAGES\" ;;",
    '  *"run --rm --quiet-pull migrate"*) [ "${FAKE_MIGRATE_OK:-1}" = 1 ] || exit 1 ;;',
    '  *"up -d --wait"*)\n'
      + '    up=$(cat "$FAKE_DOCKER_LOG.up" 2>/dev/null || echo 0); up=$((up + 1)); echo "$up" > "$FAKE_DOCKER_LOG.up"\n'
      + '    [ "${FAKE_UP_OK:-1}" = 1 ] || exit 1\n'
      + '    [ "${FAKE_UP_FAIL_AFTER:-0}" -eq 0 ] 2>/dev/null || [ "$up" -le "${FAKE_UP_FAIL_AFTER:-0}" ] || exit 1 ;;',
    "  *) exit 0 ;;",
    "esac",
    "",
  ]
    .join("\n")
    .replaceAll("$IMAGE", IMAGE);
}

/**
 * A fake `curl`: the health check answers FAKE_HEALTH_OK, and a GlitchTip
 * release POST answers a body and a status code (FAKE_GLITCHTIP_CODE, or nothing
 * at all when FAKE_GLITCHTIP_DOWN says GlitchTip is unreachable).
 */
function fakeCurl() {
  return [
    "#!/usr/bin/env bash",
    'echo "curl $*" >> "$FAKE_DOCKER_LOG"',
    'case "$*" in',
    "  *'/releases/'*)",
    '    [ "${FAKE_GLITCHTIP_DOWN:-0}" = 1 ] && exit 7',
    '    printf \'%s\\n%s\' "${FAKE_GLITCHTIP_BODY:-a release}" "${FAKE_GLITCHTIP_CODE:-201}" ;;',
    "  *)",
    '    [ "${FAKE_HEALTH_OK:-1}" = 1 ] || exit 22 ;;',
    "esac",
    "exit 0",
    "",
  ].join("\n");
}

/**
 * A fake `sleep`: it records every call, returns at once for the 10 s and 30 s
 * pull backoffs, and really sleeps for the health loop's one-second naps.
 */
function fakeSleep() {
  return [
    "#!/usr/bin/env bash",
    'echo "sleep $*" >> "$FAKE_DOCKER_LOG"',
    '[ "${1:-0}" -lt 10 ] 2>/dev/null && exec /usr/bin/sleep "$@"',
    "exit 0",
    "",
  ].join("\n");
}

function install(bin: string, name: string, body: string): void {
  writeFileSync(path.join(bin, name), body);
  chmodSync(path.join(bin, name), 0o755);
}

/** Runs a script with only the fakes on PATH, and returns its code, output and calls. */
function run(
  script: string,
  args: string[],
  world: { root: string; env: string },
  extra: Record<string, string> = {},
) {
  const log = path.join(world.root, "calls.log");
  writeFileSync(log, "");
  // The fake `up` counter counts within one run, so a test can say "the first up
  // works, the roll back's does not" without counting the previous deploy.
  rmSync(`${log}.up`, { force: true });
  rmSync(`${log}.pulls`, { force: true });
  const env: NodeJS.ProcessEnv = {
    PATH: `${path.join(world.root, "bin")}:/usr/bin:/bin`,
    MAKAM_ROOT: world.root,
    FAKE_DOCKER_LOG: log,
    HOME: world.root,
    NODE_ENV: "test",
    // A host waits 180 s; a test does not need to.
    MAKAM_HEALTH_WAIT: "2",
    MAKAM_HEALTH_INTERVAL: "1",
    ...extra,
  };
  const result = spawnSync("bash", [script, ...args], { encoding: "utf8", env });
  const deployLog = (): string => {
    try {
      return readFileSync(path.join(world.root, world.env, "deploy.log"), "utf8");
    } catch {
      return "";
    }
  };
  return { code: result.status, output: `${result.stdout}${result.stderr}`, calls: readFileSync(log, "utf8"), deployLog };
}

describe("makam-verify-image", () => {
  function staging(): ReturnType<typeof host> {
    const world = host();
    writeFileSync(path.join(world.root, world.env, "cosign.pub"), "-----BEGIN PUBLIC KEY-----\nfake\n");
    install(world.bin, "cosign", fakeCosign());
    return world;
  }

  it("accepts a digest the environment's public key signed", () => {
    const world = staging();
    const result = run(verifyScript, ["--env", world.env, "--image", IMAGE, "--digest", DIGEST], world);
    expect(result.code).toBe(0);
  });

  it("refuses an unsigned digest with its own exit code, so a deploy can tell it from a broken host", () => {
    const world = staging();
    const result = run(verifyScript, ["--env", world.env, "--image", IMAGE, "--digest", DIGEST], world, {
      FAKE_COSIGN_SIGNED: "0",
    });
    expect(result.code).toBe(77);
    expect(result.output).toContain(DIGEST);
  });

  it("refuses when the public key is not installed, and says where it belongs", () => {
    const world = staging();
    rmSync(path.join(world.root, world.env, "cosign.pub"));
    const result = run(verifyScript, ["--env", world.env, "--image", IMAGE, "--digest", DIGEST], world);
    expect(result.code).toBe(78);
    expect(result.output).toContain("cosign.pub");
  });

  it("refuses when cosign is not installed, rather than reading that as a pass", () => {
    const world = host();
    writeFileSync(path.join(world.root, world.env, "cosign.pub"), "-----BEGIN PUBLIC KEY-----\nfake\n");
    const result = run(verifyScript, ["--env", world.env, "--image", IMAGE, "--digest", DIGEST], world);
    expect(result.code).toBe(78);
    expect(result.output).toMatch(/cosign/);
  });

  it("verifies the digest itself, not the tag it was reached through", () => {
    const world = staging();
    const result = run(verifyScript, ["--env", world.env, "--image", IMAGE, "--digest", DIGEST], world);
    expect(result.calls).toContain(`cosign verify --key ${world.root}/${world.env}/cosign.pub ${IMAGE}@${DIGEST}`);
  });

  it("refuses an unknown environment, a missing digest and a tag in place of a digest", () => {
    const world = staging();
    expect(run(verifyScript, ["--env", "qa", "--image", IMAGE, "--digest", DIGEST], world).code).toBe(64);
    expect(run(verifyScript, ["--env", world.env, "--image", IMAGE], world).code).toBe(64);
    expect(run(verifyScript, ["--env", world.env, "--image", IMAGE, "--digest", TAG_ONE], world).code).toBe(64);
  });
});

describe("makam-deploy", () => {
  /** A host whose docker, curl and cosign are fakes. */
  function staging(extra = ""): ReturnType<typeof host> & { env: string } {
    const world = host("staging", extra);
    writeFileSync(path.join(world.root, world.env, "cosign.pub"), "-----BEGIN PUBLIC KEY-----\nfake\n");
    install(world.bin, "cosign", fakeCosign());
    install(world.bin, "docker", fakeDocker());
    install(world.bin, "curl", fakeCurl());
    install(world.bin, "sleep", fakeSleep());
    return world;
  }

  it("refuses an unsigned image before it runs migrate, leaving the running release alone", () => {
    const world = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, { FAKE_COSIGN_SIGNED: "0" });
    expect(result.code).toBe(77);
    expect(result.calls).not.toContain("migrate");
    expect(result.deployLog()).toMatch(/signature/i);
    expect(readFileSync(path.join(world.root, world.env, "deployed.env"), "utf8")).not.toContain(TAG_ONE);
  });

  it("deploys the verified digest, not the tag, and records both", () => {
    const world = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world);
    expect(result.code).toBe(0);
    const deployed = readFileSync(path.join(world.root, world.env, "deployed.env"), "utf8");
    expect(deployed).toContain(`MAKAM_TAG=${TAG_ONE}`);
    expect(deployed).toMatch(/MAKAM_DIGEST=sha256:[0-9a-f]{64}/);
    expect(deployed).toMatch(new RegExp(`MAKAM_DEPLOY_REF=:${TAG_ONE}@sha256:[0-9a-f]{64}`));
    expect(result.calls).toContain("run --rm --quiet-pull migrate");
  });

  it("takes a production snapshot before migrate, and never for staging", () => {
    const prod = host("prod");
    writeFileSync(path.join(prod.root, "prod", "cosign.pub"), "-----BEGIN PUBLIC KEY-----\nfake\n");
    install(prod.bin, "cosign", fakeCosign());
    install(prod.bin, "docker", fakeDocker());
    install(prod.bin, "curl", fakeCurl());
    const result = run(deployScript, ["--env", "prod", "--tag", TAG_ONE], prod);
    expect(result.code).toBe(0);
    // A dump taken after the migration would be worthless.
    expect(result.calls.indexOf("pg_dump")).toBeGreaterThan(-1);
    expect(result.calls.indexOf("pg_dump")).toBeLessThan(result.calls.indexOf("migrate"));

    const world = staging();
    const stagingRun = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world);
    expect(stagingRun.code).toBe(0);
    expect(stagingRun.calls).not.toContain("pg_dump");
  });

  it("rolls back to the previous digest when the new one never becomes healthy, and says so with exit 1", () => {
    const world = staging();
    expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
    const second = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, { FAKE_HEALTH_OK: "0" });
    // 1, not 2: it recovered by itself, the previous digest is running again.
    expect(second.code).toBe(1);
    expect(second.deployLog()).toMatch(/rolled back to sha-1111111111111111111111111111111111111111/);
    // The database is forward-only, so the running image is the previous one.
    expect(readFileSync(path.join(world.root, world.env, "deployed.env"), "utf8")).toContain(`MAKAM_TAG=${TAG_ONE}`);
  });

  it("exits 2 when the roll back fails too, because the new digest is what is left running", () => {
    const world = staging();
    expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
    // The health check never passes and the roll back's own `up` fails.
    const second = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, {
      FAKE_HEALTH_OK: "0",
      FAKE_UP_FAIL_AFTER: "1",
    });
    expect(second.code).toBe(2);
    expect(second.deployLog()).toMatch(/roll back to sha256:[0-9a-f]{64} failed/);
  });

  it("exits 2 on a first deploy that never becomes healthy: there is nothing to roll back to", () => {
    const world = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, { FAKE_HEALTH_OK: "0" });
    expect(result.code).toBe(2);
    expect(result.deployLog()).toMatch(/no previous digest recorded/);
  });

  it("leaves the old release running when migrate fails, and does not roll back over it", () => {
    const world = staging();
    expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
    const second = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, { FAKE_MIGRATE_OK: "0" });
    expect(second.code).toBe(1);
    expect(second.calls).not.toContain("up -d --wait");
    expect(readFileSync(path.join(world.root, world.env, "deployed.env"), "utf8")).toContain(`MAKAM_TAG=${TAG_ONE}`);
  });

  it("does nothing when the digest it would deploy is already the running one", () => {
    const world = staging();
    expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
    const again = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world);
    expect(again.output).toContain("already on");
    expect(again.calls).not.toContain("migrate");
  });

  it("refuses a local image for production", () => {
    const world = host("prod");
    writeFileSync(path.join(world.root, "prod", "cosign.pub"), "-----BEGIN PUBLIC KEY-----\nfake\n");
    install(world.bin, "cosign", fakeCosign());
    install(world.bin, "docker", fakeDocker());
    install(world.bin, "curl", fakeCurl());
    const result = run(deployScript, ["--env", "prod", "--tag", TAG_ONE, "--local"], world);
    expect(result.code).toBe(78);
  });

  it("creates the GlitchTip release for the commit it just made healthy", () => {
    const world = staging("MAKAM_GLITCHTIP_TOKEN=not-a-real-token\n");
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world);
    expect(result.code).toBe(0);
    expect(result.calls).toContain("https://errors.makam.co.id/api/0/organizations/makam/releases/");
    expect(result.calls).toContain(`{"version":"${REVISION}","projects":["makam-staging"],"ref":"${REVISION}"}`);
    expect(result.deployLog()).toMatch(new RegExp(`GlitchTip release ${REVISION} created`));
  });

  it("keeps a GlitchTip release from failing the deploy, however it goes", () => {
    const glitches: Record<string, string>[] = [{ FAKE_GLITCHTIP_DOWN: "1" }, { FAKE_GLITCHTIP_CODE: "403" }];
    for (const glitch of glitches) {
      const world = staging("MAKAM_GLITCHTIP_TOKEN=not-a-real-token\n");
      expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, glitch).code).toBe(0);
    }
  });

  it("asks GlitchTip for nothing when the env file has no token", () => {
    const world = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world);
    expect(result.code).toBe(0);
    expect(result.calls).not.toContain("/releases/");
  });

  it("bounds the image versions on the host once the new release is healthy", () => {
    const world = staging();
    expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
    // The host now runs TAG_ONE and holds two versions from before it.
    const inventory = path.join(world.root, "images.txt");
    writeFileSync(
      inventory,
      [TAG_ONE, TAG_TWO, TAG_OLD, TAG_OLDER]
        .map((tag) => `${IMAGE} ${tag} sha256:${tag.slice(4, 5).repeat(64)}`)
        .join("\n") + "\n",
    );
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, {
      FAKE_DOCKER_IMAGES: inventory,
    });
    expect(result.code).toBe(0);
    // The version it just deployed and the one it could roll back to stay.
    expect(result.calls).toContain(`image rm ${IMAGE}:${TAG_OLD}`);
    expect(result.calls).toContain(`image rm ${IMAGE}:${TAG_OLDER}`);
    expect(result.calls).not.toContain(`image rm ${IMAGE}:${TAG_ONE}`);
    expect(result.deployLog()).toMatch(/kept 2 of 4/);
  });

  it("leaves every image on the host alone when the deploy did not come up", () => {
    const world = staging();
    const inventory = path.join(world.root, "images.txt");
    writeFileSync(inventory, `${IMAGE} ${TAG_OLD} sha256:${"9".repeat(64)}\n`);
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, {
      FAKE_DOCKER_IMAGES: inventory,
      FAKE_MIGRATE_OK: "0",
    });
    expect(result.code).toBe(1);
    expect(result.calls).not.toContain("image rm");
  });

  describe("a ghcr pull that fails now and then (a TLS handshake timeout)", () => {
    const backoffs = (calls: string) => calls.match(/^sleep (?:10|30)$/gm) ?? [];
    const pulls = (calls: string) => calls.match(/^docker pull /gm) ?? [];

    it("is tried again after 10 s and then after 30 s, and the deploy goes on when the third pull works, however the target is named", () => {
      for (const target of [[], ["--tag", TAG_ONE], ["--digest", DIGEST]]) {
        const world = staging();
        const result = run(deployScript, ["--env", world.env, ...target], world, { FAKE_PULL_FAIL_FIRST: "2" });
        const how = target.join(" ") || "the timer's :latest";
        expect(result.code, how).toBe(0);
        expect(pulls(result.calls), how).toHaveLength(3);
        expect(result.calls, how).toMatch(/docker pull [^\n]*\nsleep 10\ndocker pull [^\n]*\nsleep 30\ndocker pull /);
        expect(result.calls, how).toContain("run --rm --quiet-pull migrate");
        expect(result.deployLog(), how).toMatch(/WARNING pull \S+ failed \(try 1 of 3\); trying again in 10s/);
        expect(result.deployLog(), how).toMatch(/WARNING pull \S+ failed \(try 2 of 3\); trying again in 30s/);
      }
    });

    it("gives up after the third pull with the message it has always had, and touches nothing", () => {
      const world = staging();
      const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, { FAKE_PULL_FAIL_FIRST: "99" });
      expect(result.code).toBe(1);
      expect(pulls(result.calls)).toHaveLength(3);
      // Two waits for three tries: nothing is waited for after the last one.
      expect(backoffs(result.calls)).toEqual(["sleep 10", "sleep 30"]);
      expect(result.deployLog()).toContain(`ERROR pull ${IMAGE}:${TAG_ONE} failed; nothing changed`);
      expect(result.calls).not.toContain("migrate");
      expect(readFileSync(path.join(world.root, world.env, "deployed.env"), "utf8")).not.toContain(TAG_ONE);
    });

    it("costs a healthy host no wait at all", () => {
      const world = staging();
      const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world);
      expect(result.code).toBe(0);
      expect(pulls(result.calls)).toHaveLength(1);
      expect(backoffs(result.calls)).toEqual([]);
    });

    it("is also tried three times when the roll back pulls the previous digest, and the roll back works on the third pull", () => {
      const world = staging();
      expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
      // Only a pull by digest fails: the new tag's own pull and the health check are as usual.
      const second = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, {
        FAKE_HEALTH_OK: "0",
        FAKE_PULL_FAIL_MATCH: "@sha256:",
        FAKE_PULL_FAIL_FIRST: "2",
      });
      expect(second.code).toBe(1);
      expect(second.deployLog()).toMatch(/rolled back to sha-1111111111111111111111111111111111111111/);
      expect(second.calls.match(/^docker pull -q \S+@sha256:/gm)).toHaveLength(3);
      expect(backoffs(second.calls)).toEqual(["sleep 10", "sleep 30"]);
    });

    it("leaves the unhealthy release running and exits 2 when all three pulls of the roll back fail, with the roll back's own message", () => {
      const world = staging();
      expect(run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world).code).toBe(0);
      const second = run(deployScript, ["--env", world.env, "--tag", TAG_TWO], world, {
        FAKE_HEALTH_OK: "0",
        FAKE_PULL_FAIL_MATCH: "@sha256:",
        FAKE_PULL_FAIL_FIRST: "99",
      });
      expect(second.code).toBe(2);
      expect(second.calls.match(/^docker pull -q \S+@sha256:/gm)).toHaveLength(3);
      expect(backoffs(second.calls)).toEqual(["sleep 10", "sleep 30"]);
      expect(second.deployLog()).toMatch(/ERROR roll back to sha256:[0-9a-f]{64} failed; sha-2222222222222222222222222222222222222222 \(sha256:[0-9a-f]{64}\) is still running/);
    });
  });
});

describe("makam-deploy reports to GitHub through makam-deploy-status", () => {
  const statusScript = path.join(repo, "deploy/bin/makam-deploy-status");
  /** A fake curl that records the body of every GitHub call; FAKE_GITHUB_CODE=422 makes GitHub refuse. */
  const githubCurl = [
    "#!/usr/bin/env bash",
    'case "$*" in',
    "  *api.github.com*)",
    '    body=$(cat); echo "$*" "$body" >> "$FAKE_DOCKER_LOG.github"',
    '    if [ "${FAKE_GITHUB_CODE:-201}" != 201 ]; then echo "curl: (22) The requested URL returned error: ${FAKE_GITHUB_CODE}" >&2; exit 22; fi',
    "    echo '{\"id\":4242}' ;;",
    "  *) exit 0 ;;",
    "esac",
    "",
  ].join("\n");

  function staging() {
    const world = host("staging", "MAKAM_GITHUB_TOKEN=ghp_fake\n");
    writeFileSync(path.join(world.root, world.env, "cosign.pub"), "-----BEGIN PUBLIC KEY-----\nfake\n");
    install(world.bin, "cosign", fakeCosign());
    install(world.bin, "docker", fakeDocker());
    install(world.bin, "curl", githubCurl);
    copyFileSync(statusScript, path.join(world.bin, "makam-deploy-status"));
    chmodSync(path.join(world.bin, "makam-deploy-status"), 0o755);
    const sent = (): string[] => {
      try {
        return readFileSync(path.join(world.root, "calls.log.github"), "utf8").trim().split("\n");
      } catch {
        return [];
      }
    };
    return { world, sent };
  }

  it("needs jq on the machine that runs these tests", () => {
    expect(spawnSync("jq", ["--version"]).status, "install jq: makam-deploy-status needs it").toBe(0);
  });

  it("a healthy deploy leaves a Deployment on the bare commit SHA whose newest status is success", () => {
    const { world, sent } = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, {});
    expect(result.code).toBe(0);
    const calls = sent();
    expect(calls[0]).toContain("/deployments ");
    expect(calls[0]).toContain(`"ref":"${TAG_ONE.slice(4)}"`);
    expect(calls[0]).not.toContain('"ref":"sha-');
    expect(calls[0]).toContain('"image_digest":"sha256:');
    expect(calls.slice(1).map((c) => /"state":"(\w+)"/.exec(c)?.[1])).toEqual(["in_progress", "success"]);
    expect(calls.slice(1).every((c) => c.includes("/deployments/4242/statuses"))).toBe(true);
    expect(calls[2]).toContain("healthy");
    expect(result.deployLog()).not.toMatch(/usage|unknown argument/i);
  });

  it("a failed migrate records failure on the same Deployment", () => {
    const { world, sent } = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, { FAKE_MIGRATE_OK: "0" });
    expect(result.code).not.toBe(0);
    const states = sent().slice(1).map((c) => /"state":"(\w+)"/.exec(c)?.[1]);
    expect(states).toEqual(["in_progress", "failure"]);
    expect(sent()[2]).toContain("migrate failed");
  });

  it("GitHub refusing the Deployment changes neither the deploy's exit code nor leaves more than one reporting line", () => {
    const { world } = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, { FAKE_GITHUB_CODE: "422" });
    expect(result.code).toBe(0);
    const lines = result.deployLog().split("\n").filter((l) => /deploy-status|curl:|usage/i.test(l));
    expect(lines.filter((l) => l.includes("curl:"))).toEqual([]);
    expect(lines.filter((l) => l.includes("could not create the GitHub deployment"))).toHaveLength(1);
  });

  it("an unsigned image records no GitHub state, because there is no Deployment yet", () => {
    const { world, sent } = staging();
    const result = run(deployScript, ["--env", world.env, "--tag", TAG_ONE], world, { FAKE_COSIGN_SIGNED: "0" });
    expect(result.code).toBe(77);
    expect(sent()).toEqual([]);
  });
});

describe("makam-glitchtip-release", () => {
  /** A host with a GlitchTip token in the env file and a fake curl. */
  function withToken(env: "staging" | "prod" = "staging") {
    const world = host(env, "MAKAM_GLITCHTIP_TOKEN=not-a-real-token\n");
    install(world.bin, "curl", fakeCurl());
    return world;
  }

  it("creates the release in the environment's own GlitchTip project", () => {
    const prod = withToken("prod");
    const result = run(releaseScript, ["--env", "prod", "--release", REVISION], prod);
    expect(result.code).toBe(0);
    expect(result.calls).toContain(`"projects":["makam-prod"]`);
  });

  it("treats a release that already exists as done, and a GlitchTip that is down as a no-op", () => {
    const world = withToken();
    const existing = run(releaseScript, ["--env", "staging", "--release", REVISION], world, {
      FAKE_GLITCHTIP_CODE: "400",
      FAKE_GLITCHTIP_BODY: "['Release with this version already exists']",
    });
    expect(existing.code).toBe(0);
    expect(readFileSync(path.join(world.root, "staging", "deploy.log"), "utf8")).toMatch(/already exists/);

    const down = run(releaseScript, ["--env", "staging", "--release", REVISION], world, { FAKE_GLITCHTIP_DOWN: "1" });
    expect(down.code).toBe(0);
  });

  it("refuses a release name that is not a commit, before it reaches GlitchTip", () => {
    const world = withToken();
    expect(run(releaseScript, ["--env", "staging", "--release", "../../etc/passwd"], world).code).toBe(64);
    expect(run(releaseScript, ["--env", "qa", "--release", REVISION], world).code).toBe(64);
    const last = run(releaseScript, ["--env", "staging"], world);
    expect(last.code).toBe(64);
    expect(last.calls).toBe("");
  });
});
