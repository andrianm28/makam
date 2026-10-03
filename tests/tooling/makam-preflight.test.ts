import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  writeFileSync(path.join(root, "prod", "backup-passphrase"), "fake-backup-passphrase\n", { mode: 0o600 });
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
      '  pull) exit "${FAKE_PULL:-0}" ;;',
      "  login) cat > /dev/null ;;",
      '  image) echo "${FAKE_REVISION:-' + REVISION + '}" ;;',
      '  run) case "$*" in',
      '        *env-check.mjs*) echo "${FAKE_ENVCHECK_OUT:-environment is complete for production}"; exit "${FAKE_ENVCHECK_CODE:-0}" ;;',
      '        *email-check.mjs*) echo "${FAKE_EMAIL_OUT:-Email uji accepted}"; exit "${FAKE_EMAIL_CODE:-0}" ;;',
      "      esac ;;",
      '  compose) exit "${FAKE_DOCKER_COMPOSE:-0}" ;;',
      "esac",
      "exit 0",
    ].join("\n"),
  );
  copyFileSync(path.join(repo, "deploy/bin/makam-diskcheck"), path.join(w.bin, "makam-diskcheck"));
  install(
    w.bin,
    "df",
    'printf "Filesystem 1K-blocks Used Available Use%% Mounted on\\n/dev/root 100 50 50 ${FAKE_DF_USE:-40}%% /\\n"',
  );
  install(w.bin, "logger", "exit 0");
  install(
    w.bin,
    "free",
    'printf "total used free shared buff/cache available\\nMem: 8000 3000 2000 100 3000 ${FAKE_MEM_AVAILABLE_MB:-4000}\\nSwap: 0 0 0\\n"',
  );
  install(w.bin, "getent", 'echo "${FAKE_DNS_IP:-103.92.214.243} STREAM $3"');
  install(
    w.bin,
    "openssl",
    [
      'case "$*" in',
      '  s_client*) echo CERTIFICATE ;;',
      '  *-checkend*) cat > /dev/null; exit "${FAKE_CERT_CHECKEND:-0}" ;;',
      '  *-enddate*) cat > /dev/null; echo "notAfter=${FAKE_CERT_END:-Jan  1 00:00:00 2027 GMT}" ;;',
      "esac",
    ].join("\n"),
  );
  copyFileSync(path.join(repo, "deploy/bin/makam-verify-image"), path.join(w.bin, "makam-verify-image"));
  writeFileSync(path.join(w.root, "prod", "cosign.pub"), "fake public key\n");
  install(
    w.bin,
    "cosign",
    'if [ "${FAKE_COSIGN_SIGNED:-1}" = 1 ]; then exit 0; fi; echo "no matching signatures" >&2; exit 1',
  );
  install(
    w.bin,
    "aws",
    [
      'echo "  as key=${AWS_ACCESS_KEY_ID:-none} region=${AWS_DEFAULT_REGION:-none}" >> "$FAKE_LOG"',
      'obj="$FAKE_LOG.object"',
      'case "$2" in',
      '  put-object) [ "${FAKE_S3_PUT:-0}" = 0 ] || { echo "An error occurred (AccessDenied)" >&2; exit 1; }',
      '    while [ $# -gt 0 ]; do [ "$1" = --body ] && cp "$2" "$obj"; shift; done ;;',
      '  get-object) [ "${FAKE_S3_GET:-0}" = 0 ] || exit 1; cp "$obj" "${@: -1}" ;;',
      '  delete-object) exit "${FAKE_S3_DELETE:-0}" ;;',
      '  head-bucket) exit "${FAKE_S3_HEAD:-0}" ;;',
      '  get-public-access-block) [ "${FAKE_S3_SETTINGS_DENIED:-0}" = 0 ] || { echo "An error occurred (AccessDenied)" >&2; exit 254; }',
      '    echo "${FAKE_S3_PUBLIC:-true true true true}" ;;',
      '  get-bucket-versioning) echo "${FAKE_S3_VERSIONING:-Enabled}" ;;',
      '  get-bucket-encryption) [ "${FAKE_S3_ENCRYPTION:-1}" = 1 ] && echo AES256 || { echo "ServerSideEncryptionConfigurationNotFoundError" >&2; exit 254; } ;;',
      "esac",
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

  it("fails when makam-diskcheck warns about the root disk or the free memory is below the minimum", () => {
    const full = preflight(healthy(world()), [], { FAKE_DF_USE: "91" });
    expect(full.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*disk.*85/));

    const tight = preflight(healthy(world()), [], { FAKE_MEM_AVAILABLE_MB: "300" });
    expect(tight.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*memory.*300/));

    const fine = preflight(healthy(world()));
    expect(fine.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02\].*disk/));
    expect(fine.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02\].*memory.*4000/));
  });

  it("fails when makam.co.id or www do not point at this host, or the certificate expires within 14 days", () => {
    const moved = preflight(healthy(world()), [], { FAKE_DNS_IP: "203.0.113.9" });
    expect(moved.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*dns makam\.co\.id.*203\.0\.113\.9.*103\.92\.214\.243/));
    expect(moved.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*dns www\.makam\.co\.id/));

    const expiring = preflight(healthy(world()), [], { FAKE_CERT_CHECKEND: "1", FAKE_CERT_END: "Oct 10 00:00:00 2026 GMT" });
    expect(expiring.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02\].*certificate makam\.co\.id.*Oct 10 00:00:00 2026 GMT/));

    const fine = preflight(healthy(world()));
    expect(fine.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02\].*dns makam\.co\.id/));
    expect(fine.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02\].*certificate www\.makam\.co\.id.*Jan  1 00:00:00 2027 GMT/));
  });

  it("pulls the released digest with the ghcr read token, and fails when there is no digest or the pull is refused", () => {
    const none = preflight(healthy(world()));
    expect(none.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[72\].*ghcr pull.*--digest/));

    const refused = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_PULL: "1" });
    expect(refused.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02, 72\].*ghcr pull.*ghcr\.io\/andrianm28\/makam@sha256:b{64}/));

    const pulled = preflight(healthy(world()), ["--digest", DIGEST]);
    expect(pulled.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02, 72\].*ghcr pull/));
    expect(pulled.calls).toContain("docker login ghcr.io");
    expect(pulled.calls).toContain(`docker pull ghcr.io/andrianm28/makam@${DIGEST}`);
    expect(pulled.calls).not.toContain(SECRETS.GHCR_READ_TOKEN);
    expect(pulled.output).not.toContain(SECRETS.GHCR_READ_TOKEN);
  });

  it("runs makam-verify-image on the pulled digest and fails an image the production key did not sign", () => {
    const unsigned = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_COSIGN_SIGNED: "0" });
    expect(unsigned.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[72\].*image signature.*production.*unsigned/));

    const signed = preflight(healthy(world()), ["--digest", DIGEST]);
    expect(signed.lines).toContainEqual(expect.stringMatching(/^PASS .*\[72\].*image signature/));
    expect(signed.calls).toMatch(new RegExp(`cosign verify --key \\S+/prod/cosign\\.pub ghcr\\.io/andrianm28/makam@${DIGEST}`));

    const notPulled = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_PULL: "1" });
    expect(notPulled.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[72\].*image signature.*pull/));
  });

  it("validates the env file inside the image with the app's own env schema, naming what is missing and no value", () => {
    const missing = preflight(healthy(world()), ["--digest", DIGEST], {
      FAKE_ENVCHECK_CODE: "1",
      FAKE_ENVCHECK_OUT: "[env-check] environment is not valid for production; check: SUMOPOD_API_KEY, TOTP_ENCRYPTION_KEY",
    });
    expect(missing.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[02, 04, 72\].*env schema.*SUMOPOD_API_KEY, TOTP_ENCRYPTION_KEY/));

    const complete = preflight(healthy(world()), ["--digest", DIGEST]);
    expect(complete.lines).toContainEqual(expect.stringMatching(/^PASS .*\[02, 04, 72\].*env schema/));
    expect(complete.calls).toContain(
      `docker run --rm --env-file ${complete.calls.match(/--env-file (\S+)/)?.[1]} -e APP_ENV=production ghcr.io/andrianm28/makam@${DIGEST} node dist/env-check.mjs production`,
    );
    expect(complete.calls).toMatch(/--env-file \S+\/prod\/prod\.env/);

    const notPulled = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_PULL: "1" });
    expect(notPulled.lines).toContainEqual(expect.stringMatching(/^SKIP .*env schema.*pull/));
  });

  it("puts, reads and deletes a probe object in the files bucket with the app's key, and removes it even when the read fails", () => {
    const ok = preflight(healthy(world()));
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 probe.*makam-prod-files/));
    expect(ok.calls).toMatch(/aws s3api put-object --bucket makam-prod-files --key makam-preflight-probe-/);
    expect(ok.calls).toMatch(/aws s3api get-object --bucket makam-prod-files --key makam-preflight-probe-/);
    expect(ok.calls).toMatch(/aws s3api delete-object --bucket makam-prod-files --key makam-preflight-probe-/);
    expect(ok.calls).toContain("as key=AKIAFILES region=ap-southeast-3");

    const unreadable = preflight(healthy(world()), [], { FAKE_S3_GET: "1" });
    expect(unreadable.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 probe.*read/));
    expect(unreadable.calls).toMatch(/aws s3api delete-object/);

    const refused = preflight(healthy(world()), [], { FAKE_S3_PUT: "1" });
    expect(refused.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 probe.*put/));
    expect(refused.output).not.toContain(SECRETS.S3_SECRET_ACCESS_KEY);
  });

  it("fails the S3 checks naming the missing settings, and skips them only when --skip-s3 is passed", () => {
    const noS3 = ENV_FILE.split("\n").filter((line) => !line.startsWith("S3_")).join("\n");
    const missing = preflight(healthy(world({ envFile: noS3 })));
    expect(missing.lines).toContainEqual(
      expect.stringMatching(/^FAIL .*\[03\].*s3 settings.*S3_BUCKET_FILES.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/),
    );
    expect(missing.calls).not.toContain("aws ");

    const skipped = preflight(healthy(world({ envFile: noS3 })), ["--skip-s3"]);
    expect(skipped.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[03\].*s3.*--skip-s3.*beta.*without S3/));
    expect(skipped.lines.filter((line) => line.startsWith("FAIL") && line.includes("[03]"))).toEqual([]);
    expect(skipped.calls).not.toContain("aws ");
  });

  it("reads the files bucket's settings where the key allows it: public access blocked, versioning, encryption", () => {
    const good = preflight(healthy(world()));
    expect(good.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 public access.*makam-prod-files/));
    expect(good.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 versioning.*Enabled/));
    expect(good.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 encryption.*AES256/));

    const open = preflight(healthy(world()), [], { FAKE_S3_PUBLIC: "true false true true" });
    expect(open.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 public access/));

    const unversioned = preflight(healthy(world()), [], { FAKE_S3_VERSIONING: "None" });
    expect(unversioned.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 versioning.*None/));

    const plain = preflight(healthy(world()), [], { FAKE_S3_ENCRYPTION: "0" });
    expect(plain.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 encryption/));

    const denied = preflight(healthy(world()), [], { FAKE_S3_SETTINGS_DENIED: "1" });
    expect(denied.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[03\].*s3 public access.*cannot read.*console/));
  });

  it("checks that the backups bucket answers to the backups key and that the backup encryption key is present and private", () => {
    const ok = preflight(healthy(world()));
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 backups bucket.*makam-prod-backups/));
    expect(ok.calls).toContain("aws s3api head-bucket --bucket makam-prod-backups");
    expect(ok.calls).toContain("as key=AKIABACKUPS");
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*backup encryption key/));

    const gone = preflight(healthy(world()), [], { FAKE_S3_HEAD: "1" });
    expect(gone.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 backups bucket/));

    const noKey = healthy(world());
    rmSync(path.join(noKey.root, "prod", "backup-passphrase"));
    expect(preflight(noKey).lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*backup encryption key.*backup-passphrase/));

    const looseKey = healthy(world());
    chmodSync(path.join(looseKey.root, "prod", "backup-passphrase"), 0o644);
    expect(preflight(looseKey).lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*backup encryption key.*0644/));

    const skipped = preflight(healthy(world()), ["--skip-s3"]);
    expect(skipped.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*backup encryption key/));
  });
});
