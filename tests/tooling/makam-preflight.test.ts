import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// deploy/bin/makam-preflight is run by the owner on the VPS before the
// production rehearsal: one line per prerequisite of tickets 02, 03, 04 and 72,
// PASS / FAIL / SKIP, exit non-zero on any FAIL. The fakes here stand in for
// every external command (docker, curl, aws, openssl, getent, df, free,
// cosign), so what is asserted is what the owner sees: the lines, the exit code,
// and that no secret value is ever printed.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const preflightScript = path.join(repo, "deploy/bin/makam-preflight");
const DIGEST = `sha256:${"b".repeat(64)}`;
const REVISION = "0123456789abcdef0123456789abcdef01234567";
/** Fake secret values: none of them may ever appear in the output. */
const SECRETS = {
  AUTH_SECRET: "secret-auth-0123456789abcdef0123456789abcdef",
  POSTGRES_PASSWORD: "secret-postgres-pw",
  SMTP_PASSWORD: "secret-smtp-pw",
  SUMOPOD_API_KEY: "secret-sumopod-key",
  SUMOPOD_WEBHOOK_SECRET: "whsec_secretwebhook",
  S3_SECRET_ACCESS_KEY: "secret-s3-key",
  S3_BACKUPS_SECRET_ACCESS_KEY: "secret-s3-backups-key",
  MAKAM_GITHUB_TOKEN: "ghp_secretgithubtoken",
  GHCR_READ_TOKEN: "ghp_secretghcrtoken",
};

const ENV_FILE = [
  "MAKAM_PROJECT=makam-prod",
  "MAKAM_APP_ENV=production",
  "MAKAM_WEB_PORT=3100",
  "APP_BASE_URL=https://makam.co.id",
  ...Object.entries(SECRETS).map(([key, value]) => `${key}=${value}`),
  "SMTP_USER=smtp-user",
  "S3_REGION=ap-southeast-3",
  "S3_BUCKET_FILES=makam-prod-files",
  "S3_BUCKET_BACKUPS=makam-prod-backups",
  "S3_ACCESS_KEY_ID=AKIAFILES",
  "S3_BACKUPS_ACCESS_KEY_ID=AKIABACKUPS",
  "",
].join("\n");

/** A fake command: logs "name args" to $FAKE_LOG, then the body runs. */
function install(bin: string, name: string, body: string): void {
  const file = path.join(bin, name);
  writeFileSync(file, `#!/usr/bin/env bash\necho "${name} $*" >> "$FAKE_LOG"\n${body}\n`);
  chmodSync(file, 0o755);
}

function world(options: { envFile?: string | null; envMode?: number } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-preflight-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(path.join(root, "prod", "backups", "db"), { recursive: true });
  if (options.envFile !== null) {
    writeFileSync(path.join(root, "prod", "prod.env"), options.envFile ?? ENV_FILE);
    chmodSync(path.join(root, "prod", "prod.env"), options.envMode ?? 0o600);
  }
  writeFileSync(path.join(root, "log"), "");
  return { root, bin };
}

/**
 * Every fake answers like a healthy host unless the test turns a FAKE_* switch.
 * One function per command keeps a test about one prerequisite short.
 */
function healthy(w: ReturnType<typeof world>) {
  install(
    w.bin,
    "docker",
    [
      'case "$1" in',
      '  info) exit "${FAKE_DOCKER_INFO:-0}" ;;',
      '  compose) exit "${FAKE_DOCKER_COMPOSE:-0}" ;;',
      "esac",
      "exit 0",
    ].join("\n"),
  );
  return w;
}

function preflight(w: ReturnType<typeof world>, args: string[] = [], extra: Record<string, string> = {}) {
  const result = spawnSync("bash", [preflightScript, "--env", "prod", ...args], {
    encoding: "utf8",
    env: {
      PATH: `${w.bin}:/usr/bin:/bin`,
      MAKAM_ROOT: w.root,
      FAKE_LOG: path.join(w.root, "log"),
      ...extra,
    },
  });
  const output = `${result.stdout}${result.stderr}`;
  return {
    code: result.status,
    output,
    lines: output.split("\n").filter((line) => /^(PASS|FAIL|SKIP)/.test(line)),
    calls: readFileSync(path.join(w.root, "log"), "utf8"),
  };
}

describe("makam-preflight", () => {
  it("fails the production env file check, naming tickets 02 and 72, when the file is not there", () => {
    const w = healthy(world({ envFile: null }));
    const result = preflight(w);
    expect(result.code).toBe(1);
    expect(result.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02, 72\].*env file.*prod\.env/));
  });

  it("fails the env file check when other users can read the file, and passes a 0600 one", () => {
    const loose = preflight(healthy(world({ envMode: 0o644 })));
    expect(loose.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02, 72\].*env file.*0644/));

    const private_ = preflight(healthy(world()));
    expect(private_.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02, 72\].*env file/));
  });

  it("fails when the Docker daemon is down or the compose plugin is missing", () => {
    const down = preflight(healthy(world()), [], { FAKE_DOCKER_INFO: "1" });
    expect(down.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*docker daemon/));

    const noCompose = preflight(healthy(world()), [], { FAKE_DOCKER_COMPOSE: "1" });
    expect(noCompose.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*compose plugin/));

    const fine = preflight(healthy(world()));
    expect(fine.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02\].*docker daemon/));
    expect(fine.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02\].*compose plugin/));
  });
});
