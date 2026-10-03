import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * Shell for a fake that simulates Ctrl-C: it sends SIGTERM to the running
 * makam-preflight (found by walking up the parent processes), as an interrupt
 * would, when FAKE_INTERRUPT names this step.
 */
const INTERRUPT_AT = (step: string) =>
  [
    `if [ "\${FAKE_INTERRUPT:-}" = ${step} ] && [ ! -e "$FAKE_LOG.interrupted" ]; then`,
    '  touch "$FAKE_LOG.interrupted"',
    "  p=$PPID; top=",
    '  while [ -n "$p" ] && [ "$p" != 1 ]; do',
    '    if grep -qa makam-preflight "/proc/$p/cmdline" 2> /dev/null; then top=$p; elif [ -n "$top" ]; then break; fi',
    '    p=$(ps -o ppid= -p "$p" | tr -d " ")',
    "  done",
    '  kill -TERM "$top"',
    "fi",
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
  mkdirSync(path.join(root, "tmp"));
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
      `  pull) ${INTERRUPT_AT("pull")}; exit "\${FAKE_PULL:-0}" ;;`,
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
      `  get-object) ${INTERRUPT_AT("get-object")}; [ "\${FAKE_S3_GET:-0}" = 0 ] || exit 1; cp "$obj" "\${@: -1}" ;;`,
      '  delete-object) exit "${FAKE_S3_DELETE:-0}" ;;',
      '  head-bucket) exit "${FAKE_S3_HEAD:-0}" ;;',
      '  get-public-access-block) [ "${FAKE_S3_SETTINGS_DENIED:-0}" = 0 ] || { echo "An error occurred (AccessDenied)" >&2; exit 254; }',
      '    echo "${FAKE_S3_PUBLIC:-true true true true}" ;;',
      '  get-bucket-versioning) echo "${FAKE_S3_VERSIONING:-Enabled}" ;;',
      '  get-bucket-encryption) [ "${FAKE_S3_ENCRYPTION:-1}" = 1 ] && echo AES256 || { echo "ServerSideEncryptionConfigurationNotFoundError" >&2; exit 254; } ;;',
      "esac",
    ].join("\n"),
  );
  install(
    w.bin,
    "makam-backup-db",
    [
      '[ "${FAKE_BACKUP_CODE:-0}" = 0 ] || { echo "backup refused" >&2; exit "$FAKE_BACKUP_CODE"; }',
      `d="${w.root}/prod/backups/db"`,
      'echo dump > "$d/makam-20261003T000000Z.dump.enc"; echo counts > "$d/makam-20261003T000000Z.counts.enc"',
    ].join("\n"),
  );
  install(
    w.bin,
    "curl",
    [
      'out=""; data=""; method=GET; url=""',
      "while [ $# -gt 0 ]; do",
      '  case "$1" in -o) out=$2; shift ;; --data) data=$2; shift ;; -X) method=$2; shift ;; http*) url=$1 ;; esac',
      "  shift",
      "done",
      'body=""; code=000',
      'case "$url" in',
      '  *api-pay*) code=${FAKE_SUMOPOD_CODE:-404} ;;',
      '  *webhooks*) code=${FAKE_WEBHOOK_CODE:-401} ;;',
      "  *api.github.com*)",
      '    case "$method $url" in',
      '      "POST "*/deployments)',
      '        # GitHub wants a branch, tag or commit SHA as ref; the image tag sha-<sha> is none of them.',
      "        shaRef=0; case \"$data\" in *'\"ref\":\"sha-'*) shaRef=1 ;; esac",
      '        if [ "${FAKE_GH_REJECT_SHA_PREFIX:-0}" = 1 ] && [ "$shaRef" = 1 ]; then',
      "          code=422; body='{\"message\":\"No ref found for: sha-0123\"}'",
      "        else code=${FAKE_GITHUB_CODE:-201}; body='{\"id\": 42}'; [ \"$code\" = 201 ] || body='{\"message\":\"Bad credentials\"}'; fi ;;",
      `      "POST "*/statuses) ${INTERRUPT_AT("statuses")}; code=\${FAKE_GH_STATUS_CODE:-201} ;;`,
      '      "DELETE "*) code=${FAKE_GH_DELETE_CODE:-204} ;;',
      "    esac ;;",
      "esac",
      '[ -z "$out" ] || [ "$out" = /dev/null ] || printf "%s" "$body" > "$out"',
      'printf "%s" "$code"',
    ].join("\n"),
  );
  install(w.bin, "makam-restore-test", 'exit "${FAKE_RESTORE_CODE:-0}"');
  return w;
}

function preflight(w: ReturnType<typeof world>, args: string[] = [], extra: Record<string, string> = {}) {
  const result = spawnSync("bash", [preflightScript, "--env", "prod", ...args], {
    encoding: "utf8",
    env: {
      PATH: `${w.bin}:/usr/bin:/bin`,
      NODE_ENV: "test",
      MAKAM_ROOT: w.root,
      FAKE_LOG: path.join(w.root, "log"),
      TMPDIR: path.join(w.root, "tmp"),
      ...extra,
    },
  });
  const output = `${result.stdout}${result.stderr}`;
  return {
    code: result.status,
    output,
    lines: output.split("\n").filter((line) => /^(PASS|FAIL|SKIP)/.test(line)),
    calls: readFileSync(path.join(w.root, "log"), "utf8"),
    leftovers: readdirSync(path.join(w.root, "tmp")),
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
    const ok = preflight(healthy(world()), ["--met-s3"]);
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 probe.*makam-prod-files/));
    expect(ok.calls).toMatch(/aws s3api put-object --bucket makam-prod-files --key makam-preflight-probe-/);
    expect(ok.calls).toMatch(/aws s3api get-object --bucket makam-prod-files --key makam-preflight-probe-/);
    expect(ok.calls).toMatch(/aws s3api delete-object --bucket makam-prod-files --key makam-preflight-probe-/);
    expect(ok.calls).toContain("as key=AKIAFILES region=ap-southeast-3");

    const unreadable = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_GET: "1" });
    expect(unreadable.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 probe.*read/));
    expect(unreadable.calls).toMatch(/aws s3api delete-object/);

    const refused = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_PUT: "1" });
    expect(refused.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 probe.*put/));
    expect(refused.output).not.toContain(SECRETS.S3_SECRET_ACCESS_KEY);
  });

  it("reads the files bucket's settings where the key allows it: public access blocked, versioning, encryption", () => {
    const good = preflight(healthy(world()), ["--met-s3"]);
    expect(good.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 public access.*makam-prod-files/));
    expect(good.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 versioning.*Enabled/));
    expect(good.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 encryption.*AES256/));

    const open = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_PUBLIC: "true false true true" });
    expect(open.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 public access/));

    const unversioned = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_VERSIONING: "None" });
    expect(unversioned.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 versioning.*None/));

    const plain = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_ENCRYPTION: "0" });
    expect(plain.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 encryption/));

    const denied = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_SETTINGS_DENIED: "1" });
    expect(denied.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[03\].*s3 public access.*cannot read.*console/));
  });

  it("checks that the backups bucket answers to the backups key and that the backup encryption key is present and private", () => {
    const ok = preflight(healthy(world()), ["--met-s3"]);
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*s3 backups bucket.*makam-prod-backups/));
    expect(ok.calls).toContain("aws s3api head-bucket --bucket makam-prod-backups");
    expect(ok.calls).toContain("as key=AKIABACKUPS");
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*backup encryption key/));

    const gone = preflight(healthy(world()), ["--met-s3"], { FAKE_S3_HEAD: "1" });
    expect(gone.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 backups bucket/));

    const noKey = healthy(world());
    rmSync(path.join(noKey.root, "prod", "backup-passphrase"));
    expect(preflight(noKey).lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*backup encryption key.*backup-passphrase/));

    const looseKey = healthy(world());
    chmodSync(path.join(looseKey.root, "prod", "backup-passphrase"), 0o644);
    expect(preflight(looseKey).lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*backup encryption key.*0644/));

    const skipped = preflight(healthy(world()));
    expect(skipped.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03\].*backup encryption key/));
  });

  it("takes a backup, restore-tests exactly that Dump, and leaves no Dump of its own behind", () => {
    const w = healthy(world());
    writeFileSync(path.join(w.root, "prod", "backups", "db", "makam-20261001T000000Z.dump.enc"), "last night");
    const ok = preflight(w);
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[03, 72\].*backup and restore/));
    expect(ok.calls).toContain("makam-backup-db --env prod");
    expect(ok.calls).toMatch(/makam-restore-test --env prod --dump \S+\/prod\/backups\/db\/makam-20261003T000000Z\.dump\.enc/);
    expect(readdirSync(path.join(w.root, "prod", "backups", "db"))).toEqual(["makam-20261001T000000Z.dump.enc"]);

    const noBackup = preflight(healthy(world()), [], { FAKE_BACKUP_CODE: "78" });
    expect(noBackup.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03, 72\].*backup and restore.*makam-backup-db.*78/));
    expect(noBackup.calls).not.toContain("makam-restore-test");

    const badRestore = healthy(world());
    const failed = preflight(badRestore, [], { FAKE_RESTORE_CODE: "1" });
    expect(failed.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03, 72\].*backup and restore.*makam-restore-test.*1/));
    expect(readdirSync(path.join(badRestore.root, "prod", "backups", "db"))).toEqual([]);
  });

  it("sends one email through the image's email-check to the address the owner passes, and skips with the instruction when none is passed", () => {
    const none = preflight(healthy(world()), ["--digest", DIGEST]);
    expect(none.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[04\].*smtp.*--email-to/));
    expect(none.calls).not.toContain("email-check");

    const sent = preflight(healthy(world()), ["--digest", DIGEST, "--email-to", "owner@example.test"]);
    expect(sent.lines).toContainEqual(expect.stringMatching(/^PASS .*\[04\].*smtp.*relay/));
    expect(sent.calls).toMatch(/docker run --rm --env-file \S+\/prod\/prod\.env -e APP_ENV=production ghcr\.io\/andrianm28\/makam@sha256:b{64} node dist\/email-check\.mjs owner@example\.test/);
    expect(sent.output).not.toContain("owner@example.test");

    const refused = preflight(healthy(world()), ["--digest", DIGEST, "--email-to", "owner@example.test"], {
      FAKE_EMAIL_CODE: "1",
      FAKE_EMAIL_OUT: "[email-check] Gagal kirim: rejected 550",
    });
    expect(refused.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[04\].*smtp.*Gagal kirim: rejected 550/));
    expect(refused.output).not.toContain("owner@example.test");
  });

  it("authenticates the SumoPod API key on a read-only call: a rejected key fails, a missing payment still proves the key", () => {
    const known = preflight(healthy(world()));
    expect(known.lines).toContainEqual(expect.stringMatching(/^PASS .*\[04\].*sumopod api key/));
    expect(known.calls).toMatch(/curl .* https:\/\/api-pay\.sumopod\.com\/api\/v1\/payments\/makam-preflight/);
    expect(known.calls).not.toMatch(/-X (POST|PUT|DELETE)[^\n]*api-pay/);
    expect(known.calls).not.toContain(SECRETS.SUMOPOD_API_KEY);
    expect(known.output).not.toContain(SECRETS.SUMOPOD_API_KEY);

    const rejected = preflight(healthy(world()), [], { FAKE_SUMOPOD_CODE: "401" });
    expect(rejected.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[04\].*sumopod api key.*401/));

    const down = preflight(healthy(world()), [], { FAKE_SUMOPOD_CODE: "502" });
    expect(down.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[04\].*sumopod api key.*502/));
  });

  it("fails when the SumoPod webhook secret is not set or is not a Svix secret, without printing it", () => {
    const set = preflight(healthy(world()));
    expect(set.lines).toContainEqual(expect.stringMatching(/^PASS .*\[04\].*sumopod webhook secret.*whsec_/));
    expect(set.output).not.toContain(SECRETS.SUMOPOD_WEBHOOK_SECRET);

    const without = ENV_FILE.split("\n").filter((line) => !line.startsWith("SUMOPOD_WEBHOOK_SECRET=")).join("\n");
    expect(preflight(healthy(world({ envFile: without }))).lines).toContainEqual(
      expect.stringMatching(/^FAIL .*\[04\].*sumopod webhook secret.*not set/),
    );

    const wrong = ENV_FILE.replace(SECRETS.SUMOPOD_WEBHOOK_SECRET, "plainsecret");
    const bad = preflight(healthy(world({ envFile: wrong })));
    expect(bad.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[04\].*sumopod webhook secret.*whsec_/));
    expect(bad.output).not.toContain("plainsecret");
  });

  it("posts a forged Svix signature to the webhook URL and fails unless it answers 401", () => {
    const refused = preflight(healthy(world()));
    expect(refused.lines).toContainEqual(expect.stringMatching(/^PASS .*\[04\].*webhook forged signature.*https:\/\/makam\.co\.id\/api\/webhooks\/pembayaran.*401/));
    expect(refused.calls).toMatch(/curl .*-X POST .*svix-signature: v1,[A-Za-z0-9+/=]+ .*https:\/\/makam\.co\.id\/api\/webhooks\/pembayaran/);

    const accepted = preflight(healthy(world()), [], { FAKE_WEBHOOK_CODE: "200" });
    expect(accepted.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[04\].*webhook forged signature.*200.*accepts forged/));

    const old = preflight(healthy(world()), [], { FAKE_WEBHOOK_CODE: "404" });
    expect(old.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[04\].*webhook forged signature.*404.*nginx switch/));

    const local = preflight(healthy(world()), ["--webhook-url", "http://127.0.0.1:3100/api/webhooks/pembayaran"]);
    expect(local.calls).toContain("http://127.0.0.1:3100/api/webhooks/pembayaran");
  });

  it("creates a probe GitHub Deployment as makam-deploy would, marks it inactive and deletes it again", () => {
    const ok = preflight(healthy(world()), ["--digest", DIGEST]);
    expect(ok.lines).toContainEqual(expect.stringMatching(/^PASS .*\[72\].*github deployments.*andrianm28\/makam/));
    expect(ok.calls).toMatch(/curl .*-X POST .*https:\/\/api\.github\.com\/repos\/andrianm28\/makam\/deployments(\s|$)/);
    expect(ok.calls).toMatch(/-X POST .*https:\/\/api\.github\.com\/repos\/andrianm28\/makam\/deployments\/42\/statuses/);
    expect(ok.calls).toMatch(/-X DELETE .*https:\/\/api\.github\.com\/repos\/andrianm28\/makam\/deployments\/42/);
    expect(ok.calls).not.toContain(SECRETS.MAKAM_GITHUB_TOKEN);
    expect(ok.output).not.toContain(SECRETS.MAKAM_GITHUB_TOKEN);

    const rejectedToken = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_GITHUB_CODE: "401" });
    expect(rejectedToken.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[72\].*github deployments.*401.*Bad credentials/));

    const noToken = ENV_FILE.split("\n").filter((line) => !line.startsWith("MAKAM_GITHUB_TOKEN=")).join("\n");
    const missing = preflight(healthy(world({ envFile: noToken })), ["--digest", DIGEST]);
    expect(missing.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[72\].*github deployments.*MAKAM_GITHUB_TOKEN.*invisible/));

    const notPulled = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_PULL: "1" });
    expect(notPulled.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[72\].*github deployments.*pull/));
  });

  it("explains why no Deployments are listed when GitHub accepts the commit SHA but not the sha-<sha> image tag makam-deploy-status sends", () => {
    const result = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_GH_REJECT_SHA_PREFIX: "1" });
    expect(result.lines).toContainEqual(
      expect.stringMatching(/^FAIL .*\[72\].*github deployments.*sha-0123456789abcdef.*not a branch, tag or commit SHA.*makam-deploy-status.*accepts the plain commit SHA/),
    );
    // The probe made with the plain SHA is cleaned up too.
    expect(result.calls).toMatch(/-X DELETE .*deployments\/42/);
  });

  it("lists the external uptime monitor and the nginx switch as manual steps, SKIP with the instruction", () => {
    const result = preflight(healthy(world()));
    expect(result.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[02\].*uptime monitor.*outside the VPS.*alert contact/));
    expect(result.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[72\].*nginx switch.*owner.*Production \(ticket 65\)/));
  });

  it("exits 0 with only PASS and SKIP lines on a ready host, exits 1 on any FAIL, and never prints a secret either way", () => {
    const args = ["--digest", DIGEST, "--email-to", "owner@example.test"];
    const ready = preflight(healthy(world()), args);
    expect(ready.code).toBe(0);
    expect(ready.lines.filter((line) => line.startsWith("FAIL"))).toEqual([]);
    expect(ready.lines.filter((line) => line.startsWith("SKIP"))).toHaveLength(3);

    const broken = preflight(healthy(world()), args, {
      FAKE_DOCKER_INFO: "1",
      FAKE_DF_USE: "99",
      FAKE_DNS_IP: "203.0.113.9",
      FAKE_PULL: "1",
      FAKE_S3_PUT: "1",
      FAKE_SUMOPOD_CODE: "401",
      FAKE_WEBHOOK_CODE: "200",
      FAKE_BACKUP_CODE: "78",
    });
    expect(broken.code).toBe(1);
    expect(broken.lines.filter((line) => line.startsWith("FAIL")).length).toBeGreaterThan(5);

    for (const result of [ready, broken]) {
      for (const secret of Object.values(SECRETS)) {
        expect(result.output).not.toContain(secret);
        expect(result.calls).not.toContain(secret);
      }
    }
  });

  it("is installed on the host by deploy/install-host.sh and documented in the runbook next to the rehearsal, and the ticket's Rehearsal item names it as the first step", () => {
    const installer = readFileSync(path.join(repo, "deploy/install-host.sh"), "utf8");
    expect(installer).toContain("deploy/bin/makam-preflight");

    const runbook = readFileSync(path.join(repo, "docs/ops/runbook.md"), "utf8");
    const section = runbook.slice(runbook.indexOf("## Production preflight"), runbook.indexOf("## Staging is public"));
    expect(section).toContain("makam-preflight --env prod");
    expect(section).toContain("--email-to");
    expect(section).toContain("--met-s3");

    const ticket = readFileSync(path.join(repo, ".scratch/makam-v1-build/issues/72-deploys-through-github-actions.md"), "utf8");
    expect(ticket).toMatch(/\*\*Rehearsal\*\*[^\n]*first step[^\n]*makam-preflight/);
  });

  it("skips every S3 check by default because v1 goes live without S3, and runs them only with --met-s3", () => {
    const byDefault = preflight(healthy(world()));
    expect(byDefault.lines).toContainEqual(expect.stringMatching(/^SKIP .*\[03\].*s3.*moved to v2.*2026-09-26.*--met-s3/));
    expect(byDefault.lines.filter((line) => /s3 (probe|settings|backups|public|versioning|encryption)/.test(line))).toEqual([]);
    expect(byDefault.calls).not.toContain("aws ");

    const noS3 = ENV_FILE.split("\n").filter((line) => !line.startsWith("S3_")).join("\n");
    const missing = preflight(healthy(world({ envFile: noS3 })), ["--met-s3"]);
    expect(missing.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[03\].*s3 settings.*S3_BUCKET_FILES/));
  });

  it("removes the throwaway Docker config that holds the ghcr token when it is interrupted mid-pull", () => {
    const interrupted = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_INTERRUPT: "pull" });
    expect(interrupted.code).toBe(143);
    expect(interrupted.leftovers).toEqual([]);

    const finished = preflight(healthy(world()), ["--digest", DIGEST, "--met-s3", "--email-to", "owner@example.test"]);
    expect(finished.leftovers).toEqual([]);
  });

  it("deletes the S3 probe object when it is interrupted between the put and the delete", () => {
    const interrupted = preflight(healthy(world()), ["--met-s3"], { FAKE_INTERRUPT: "get-object" });
    expect(interrupted.code).toBe(143);
    expect(interrupted.calls).toMatch(/aws s3api put-object --bucket makam-prod-files --key (makam-preflight-probe-\S+)[\s\S]*aws s3api delete-object --bucket makam-prod-files --key \1/);
    expect(interrupted.leftovers).toEqual([]);
  });

  it("fails instead of passing when the probe Deployment cannot be marked inactive or deleted, naming the orphan", () => {
    const stuck = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_GH_DELETE_CODE: "403" });
    expect(stuck.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[72\].*github deployments.*deployment 42.*delete.*403/));
    expect(stuck.lines.filter((line) => /^PASS .*github deployments/.test(line))).toEqual([]);

    const noStatus = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_GH_STATUS_CODE: "500" });
    expect(noStatus.lines).toContainEqual(expect.stringMatching(/^FAIL .*\[72\].*github deployments.*deployment 42.*inactive.*500/));
    // The delete is still attempted after a failed status.
    expect(noStatus.calls).toMatch(/-X DELETE .*deployments\/42/);
  });

  it("deletes the probe Deployment when it is interrupted after creating it", () => {
    const interrupted = preflight(healthy(world()), ["--digest", DIGEST], { FAKE_INTERRUPT: "statuses" });
    expect(interrupted.code).toBe(143);
    expect(interrupted.calls).toMatch(/-X DELETE .*deployments\/42/);
    expect(interrupted.leftovers).toEqual([]);
  });
});
