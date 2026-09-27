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
const IMAGE = "ghcr.io/andrianm28/makam";
const DIGEST = `sha256:${"a".repeat(64)}`;
const TAG_ONE = "sha-1111111111111111111111111111111111111111";
const TAG_TWO = "sha-2222222222222222222222222222222222222222";
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
    '  *"run --rm --quiet-pull migrate"*) [ "${FAKE_MIGRATE_OK:-1}" = 1 ] || exit 1 ;;',
    '  *"up -d --wait"*)\n'
      + '    up=$(cat "$FAKE_DOCKER_LOG.up" 2>/dev/null || echo 0); up=$((up + 1)); echo "$up" > "$FAKE_DOCKER_LOG.up"\n'
      + '    [ "${FAKE_UP_OK:-1}" = 1 ] || exit 1\n'
      + '    [ "${FAKE_UP_FAIL_AFTER:-0}" -eq 0 ] 2>/dev/null || [ "$up" -le "${FAKE_UP_FAIL_AFTER:-0}" ] || exit 1 ;;',
    "  *'image ls'*) exit 0 ;;",
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
