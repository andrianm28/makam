import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, lstatSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// makam-switch swaps what nginx serves for makam.co.id: the production block
// (v1) or the maintenance block. A wrong swap takes the site down, so the
// fakes below are the whole world: a /etc/nginx tree in a temp directory, a
// fake `nginx` that passes or fails `-t`, and a fake `systemctl` that records
// the reload. What matters is what ends up in the site file and the order of
// the commands.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const script = path.join(repo, "deploy/bin/makam-switch");
const OLD_BLOCK = "# the old app's block, 127.0.0.1:3001 and 8083\nserver { listen 443; }\n";

function host() {
  const root = mkdtempSync(path.join(tmpdir(), "makam-switch-"));
  const bin = path.join(root, "bin");
  const nginx = path.join(root, "etc-nginx");
  const src = path.join(root, "src");
  mkdirSync(bin);
  mkdirSync(path.join(nginx, "sites-available"), { recursive: true });
  mkdirSync(path.join(nginx, "sites-enabled"), { recursive: true });
  mkdirSync(path.join(nginx, "snippets"), { recursive: true });
  mkdirSync(path.join(src, "maintenance"), { recursive: true });
  for (const f of ["makam.co.id.conf", "makam-prod-proxy.conf", "maintenance/makam.co.id.conf", "maintenance/index.html"]) {
    writeFileSync(path.join(src, f), readFileSync(path.join(repo, "deploy/nginx", f)));
  }
  writeFileSync(path.join(nginx, "sites-available", "makam.co.id.conf"), OLD_BLOCK);
  const calls = path.join(root, "calls.log");
  writeFileSync(calls, "");
  // The fake nginx -t looks at the installed site file, as the real one would:
  // it fails when FAKE_NGINX_T_FAIL=1 and the site file is not the old block.
  writeFileSync(
    path.join(bin, "nginx"),
    [
      "#!/usr/bin/env bash",
      'echo "nginx $*" >> "$FAKE_CALLS"',
      'if [ "${FAKE_NGINX_T_FAIL:-0}" = 1 ] && ! cmp -s "$MAKAM_NGINX_DIR/sites-available/makam.co.id.conf" "$FAKE_OLD"; then echo "nginx: configuration file test failed" >&2; exit 1; fi',
      "exit 0",
      "",
    ].join("\n"),
  );
  writeFileSync(path.join(bin, "systemctl"), ["#!/usr/bin/env bash", 'echo "systemctl $*" >> "$FAKE_CALLS"', "exit 0", ""].join("\n"));
  chmodSync(path.join(bin, "nginx"), 0o755);
  chmodSync(path.join(bin, "systemctl"), 0o755);
  const old = path.join(root, "old.conf");
  writeFileSync(old, OLD_BLOCK);
  return { root, bin, nginx, src, calls, old, www: path.join(root, "www"), backups: path.join(root, "nginx-backups") };
}

function run(world: ReturnType<typeof host>, args: string[], extra: Record<string, string> = {}) {
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: {
      PATH: `${world.bin}:/usr/bin:/bin`,
      NODE_ENV: "test",
      MAKAM_ROOT: world.root,
      MAKAM_NGINX_DIR: world.nginx,
      MAKAM_SWITCH_SRC: world.src,
      MAKAM_MAINTENANCE_DIR: world.www,
      FAKE_CALLS: world.calls,
      FAKE_OLD: world.old,
      ...extra,
    },
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}`, calls: readFileSync(world.calls, "utf8").trim().split("\n").filter(Boolean) };
}

const site = (w: ReturnType<typeof host>) => readFileSync(path.join(w.nginx, "sites-available", "makam.co.id.conf"), "utf8");
const backupFiles = (w: ReturnType<typeof host>) => (existsSync(w.backups) ? readdirSync(w.backups) : []);

describe("makam-switch --ke v1", () => {
  it("backs up the current block verbatim, installs the production block and its proxy snippet, tests, then reloads", () => {
    const w = host();
    const r = run(w, ["--ke", "v1"]);
    expect(r.code).toBe(0);
    expect(site(w)).toBe(readFileSync(path.join(repo, "deploy/nginx/makam.co.id.conf"), "utf8"));
    expect(readFileSync(path.join(w.nginx, "snippets", "makam-prod-proxy.conf"), "utf8")).toContain("127.0.0.1:3100");
    const backups = backupFiles(w);
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^makam\.co\.id\.conf\.\d{8}T\d{6}Z$/);
    expect(readFileSync(path.join(w.backups, backups[0]), "utf8")).toBe(OLD_BLOCK);
    expect(r.calls).toEqual(["nginx -t", "systemctl reload nginx"]);
    expect(r.output).toMatch(/v1/);
  });
});

describe("makam-switch when nginx -t fails", () => {
  it("puts the backup back, does not reload, and exits non-zero", () => {
    const w = host();
    const r = run(w, ["--ke", "v1"], { FAKE_NGINX_T_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(site(w)).toBe(OLD_BLOCK);
    expect(r.calls).not.toContain("systemctl reload nginx");
    expect(r.output).toMatch(/restored/i);
  });
});

describe("makam-switch run twice", () => {
  it("changes nothing the second time: no new backup, no reload, and says so", () => {
    const w = host();
    run(w, ["--ke", "v1"]);
    writeFileSync(w.calls, "");
    const again = run(w, ["--ke", "v1"]);
    expect(again.code).toBe(0);
    expect(backupFiles(w)).toHaveLength(1);
    expect(again.calls).toEqual([]);
    expect(again.output).toMatch(/already/i);
  });
});

describe("makam-switch --ke pemeliharaan", () => {
  it("installs the maintenance block and page, and v1 again afterwards, each backed up", () => {
    const w = host();
    run(w, ["--ke", "v1"]);
    writeFileSync(w.calls, "");
    const r = run(w, ["--ke", "pemeliharaan"]);
    expect(r.code).toBe(0);
    expect(site(w)).toBe(readFileSync(path.join(repo, "deploy/nginx/maintenance/makam.co.id.conf"), "utf8"));
    expect(readFileSync(path.join(w.www, "index.html"), "utf8")).toContain("pemeliharaan");
    expect(r.calls).toEqual(["nginx -t", "systemctl reload nginx"]);
    // The v1 block that was replaced is kept too.
    const kept = backupFiles(w).map((f) => readFileSync(path.join(w.backups, f), "utf8"));
    expect(kept).toContain(readFileSync(path.join(repo, "deploy/nginx/makam.co.id.conf"), "utf8"));
  });
});

describe("makam-switch --cek", () => {
  it("says which block is installed: lain, v1 or pemeliharaan, and exits 0 only for the last two", () => {
    const w = host();
    expect(run(w, ["--cek"])).toMatchObject({ code: 1 });
    expect(run(w, ["--cek"]).output.trim()).toBe("lain");
    run(w, ["--ke", "v1"]);
    expect(run(w, ["--cek"])).toMatchObject({ code: 0 });
    expect(run(w, ["--cek"]).output.trim()).toBe("v1");
    run(w, ["--ke", "pemeliharaan"]);
    expect(run(w, ["--cek"]).output.trim()).toBe("pemeliharaan");
  });

  it("changes and reloads nothing", () => {
    const w = host();
    expect(run(w, ["--cek"]).calls).toEqual([]);
    expect(backupFiles(w)).toEqual([]);
  });

  it("refuses an unknown target with the usage exit code", () => {
    expect(run(host(), ["--ke", "lama"]).code).toBe(64);
    expect(run(host(), []).code).toBe(64);
  });
});

describe("makam-switch when nginx -t fails, beyond the site file", () => {
  it("also puts back the proxy snippet and the maintenance page it had replaced", () => {
    const w = host();
    writeFileSync(path.join(w.nginx, "snippets", "makam-prod-proxy.conf"), "# earlier snippet\n");
    mkdirSync(w.www, { recursive: true });
    writeFileSync(path.join(w.www, "index.html"), "<p>earlier page</p>\n");
    const r = run(w, ["--ke", "v1"], { FAKE_NGINX_T_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(readFileSync(path.join(w.nginx, "snippets", "makam-prod-proxy.conf"), "utf8")).toBe("# earlier snippet\n");
    const w2 = host();
    mkdirSync(w2.www, { recursive: true });
    writeFileSync(path.join(w2.www, "index.html"), "<p>earlier page</p>\n");
    run(w2, ["--ke", "pemeliharaan"], { FAKE_NGINX_T_FAIL: "1" });
    expect(readFileSync(path.join(w2.www, "index.html"), "utf8")).toBe("<p>earlier page</p>\n");
  });

  it("removes a snippet or page that did not exist before, rather than leaving it behind", () => {
    const w = host();
    run(w, ["--ke", "v1"], { FAKE_NGINX_T_FAIL: "1" });
    expect(existsSync(path.join(w.nginx, "snippets", "makam-prod-proxy.conf"))).toBe(false);
  });
});

describe("makam-switch before it changes anything", () => {
  it("refuses, naming the file, when a file it installs is missing, and leaves the site file alone", () => {
    const w = host();
    rmSync(path.join(w.src, "makam-prod-proxy.conf"));
    const r = run(w, ["--ke", "v1"]);
    expect(r.code).toBe(78);
    expect(r.output).toContain("makam-prod-proxy.conf");
    expect(site(w)).toBe(OLD_BLOCK);
    expect(backupFiles(w)).toEqual([]);
  });

  it("installs on a host that has no site file yet, with a note rather than a bare error", () => {
    const w = host();
    rmSync(path.join(w.nginx, "sites-available", "makam.co.id.conf"));
    const r = run(w, ["--ke", "v1"]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/no current block/i);
    expect(site(w)).toBe(readFileSync(path.join(repo, "deploy/nginx/makam.co.id.conf"), "utf8"));
  });

  it("failing nginx -t on a first install removes the block it just wrote", () => {
    const w = host();
    rmSync(path.join(w.nginx, "sites-available", "makam.co.id.conf"));
    const r = run(w, ["--ke", "v1"], { FAKE_NGINX_T_FAIL: "1" });
    expect(r.code).toBe(1);
    expect(existsSync(path.join(w.nginx, "sites-available", "makam.co.id.conf"))).toBe(false);
  });

  it("asks for a target with the usage line when --ke has none", () => {
    const r = run(host(), ["--ke"]);
    expect(r.code).toBe(64);
    expect(r.output).toMatch(/usage:/);
  });
});

describe("makam-switch and the sites-enabled link", () => {
  it("links the site file into sites-enabled when the link is missing, so nginx serves it", () => {
    const w = host();
    const link = path.join(w.nginx, "sites-enabled", "makam.co.id.conf");
    expect(existsSync(link)).toBe(false);
    const r = run(w, ["--ke", "v1"]);
    expect(r.code).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(link, "utf8")).toBe(site(w));
    expect(r.output).toMatch(/sites-enabled/);
  });

  it("leaves an existing link alone", () => {
    const w = host();
    const link = path.join(w.nginx, "sites-enabled", "makam.co.id.conf");
    symlinkSync(path.join(w.nginx, "sites-available", "makam.co.id.conf"), link);
    const r = run(w, ["--ke", "v1"]);
    expect(r.code).toBe(0);
    expect(r.output).not.toMatch(/linked/);
  });
});

describe("makam-switch run again after only the companion file changed", () => {
  it("installs the new snippet, tests and reloads, instead of calling it already done", () => {
    const w = host();
    run(w, ["--ke", "v1"]);
    writeFileSync(path.join(w.nginx, "snippets", "makam-prod-proxy.conf"), "# stale snippet\n");
    writeFileSync(w.calls, "");
    const again = run(w, ["--ke", "v1"]);
    expect(again.code).toBe(0);
    expect(readFileSync(path.join(w.nginx, "snippets", "makam-prod-proxy.conf"), "utf8")).toContain("127.0.0.1:3100");
    expect(again.calls).toEqual(["nginx -t", "systemctl reload nginx"]);
  });
});
