import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The ci.yml step that puts an image's source maps into GlitchTip, driven
 * against a fake `docker` so the script's own decisions are what is under test:
 * which host it may talk to, and that it stays quiet when the secret is not
 * there yet. Sentry's own default is sentry.io, so "not sentry.io" is the
 * assertion that matters (ADR 0002: error data, and therefore source, stays on
 * this host).
 */
const repo = fileURLToPath(new URL("../..", import.meta.url));
const uploadScript = path.join(repo, "scripts/ci/upload-sourcemaps.sh");
const IMAGE = `ghcr.io/andrianm28/makam@sha256:${"a".repeat(64)}`;
const RELEASE = "0123456789abcdef0123456789abcdef01234567";
const GLITCHTIP = "https://errors.makam.co.id";

/** A fake `docker`: records every call, and pretends the image carries maps. */
function fakeDocker() {
  return [
    "#!/usr/bin/env bash",
    'echo "docker $*" >> "$FAKE_DOCKER_LOG"',
    'case "$1" in',
    "  create) echo 'container-id' ;;",
    '  cp)',
    '    [ "${FAKE_NO_MAPS:-0}" = 1 ] || { mkdir -p "${@: -1}"; echo "{}" > "${@: -1}/chunk.js.map"; } ;;',
    "esac",
    "exit 0",
    "",
  ].join("\n");
}

function run(env: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-upload-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "docker"), fakeDocker());
  chmodSync(path.join(bin, "docker"), 0o755);
  const log = path.join(root, "calls.log");
  writeFileSync(log, "");
  const result = spawnSync("bash", [uploadScript], {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, NODE_ENV: "test", IMAGE, RELEASE, FAKE_DOCKER_LOG: log, ...env },
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}`, calls: readFileSync(log, "utf8") };
}

const withToken = {
  SENTRY_URL: GLITCHTIP,
  SENTRY_ORG: "makam",
  SENTRY_PROJECT: "makam-staging,makam-prod",
  SENTRY_AUTH_TOKEN: "not-a-real-token",
};

describe("the source maps of one image", () => {
  it("go to the GlitchTip the app reports to, under the image's own release, once per project", () => {
    const result = run(withToken);
    expect(result.code).toBe(0);
    expect(result.calls).toContain(`--url ${GLITCHTIP} sourcemaps upload --org makam --project makam-staging --release ${RELEASE} /work`);
    expect(result.calls).toContain(`--project makam-prod --release ${RELEASE} /work`);
    // The maps come out of the pushed image, not out of a rebuild of it.
    expect(result.calls).toContain(`cp container-id:/app/dist/sourcemaps`);
    // The token travels in the environment, never on the command line.
    expect(result.calls).toContain("-e SENTRY_AUTH_TOKEN ");
    expect(result.calls).not.toContain("not-a-real-token");
  });

  it("go nowhere at all without a token, instead of failing the build that made the image", () => {
    const result = run({ ...withToken, SENTRY_AUTH_TOKEN: "" });
    expect(result.code).toBe(0);
    expect(result.calls).toBe("");
    expect(result.output).toContain("GLITCHTIP_AUTH_TOKEN");
  });

  it("go nowhere at all without an https GlitchTip URL, and never to sentry.io", () => {
    const missing = run({ ...withToken, SENTRY_URL: "" });
    expect(missing.code).toBe(0);
    expect(missing.calls).toBe("");

    const plain = run({ ...withToken, SENTRY_URL: "http://glitchtip-web:8000" });
    expect(plain.code).toBe(1);
    expect(plain.calls).toBe("");
  });

  it("need an image and a release name, or the step is a usage error", () => {
    expect(run({ ...withToken, IMAGE: "" }).code).toBe(64);
    expect(run({ ...withToken, RELEASE: "" }).code).toBe(64);
  });

  it("fail loudly on an image that carries no maps, rather than pretending the upload happened", () => {
    const result = run({ ...withToken, FAKE_NO_MAPS: "1" });
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/has no \/app\/dist\/sourcemaps/);
    expect(result.calls).not.toContain("sourcemaps upload");
  });
});
