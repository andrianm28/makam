import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const BUNDLE = join(ROOT, "dist/import-data-peluncuran.mjs");

/** Runs the bundle as the host does (`node dist/<name>.mjs`), with only the environment given. */
function jalankan(args: string[], env: Record<string, string> = {}) {
  const hasil = spawnSync(process.execPath, [BUNDLE, ...args], { cwd: ROOT, env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  return { exitCode: hasil.status, output: `${hasil.stdout}${hasil.stderr}` };
}

describe("the launch-data importer bundle (dist/import-data-peluncuran.mjs), run as on the staging and production hosts", () => {
  let folder: string;

  beforeAll(() => {
    // The runtime image only has what build:worker bundles, so build it the way the image does.
    const build = spawnSync(process.execPath, ["scripts/build-worker.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    folder = mkdtempSync(join(tmpdir(), "data-peluncuran-"));
    writeFileSync(join(folder, "nazhir.csv"), "nama,jenis,kab_kota,kontak,nomor_bwi\n");
    return () => rmSync(folder, { recursive: true, force: true });
  }, 120_000);

  it("is bundled by build:worker", () => {
    expect(existsSync(BUNDLE)).toBe(true);
  });

  it("runs on its own and says how to use it without --sumber", () => {
    const { exitCode, output } = jalankan([]);
    expect(exitCode).toBe(2);
    expect(output).toContain("Pakai: import:data-peluncuran --sumber <folder>");
  });

  it("takes a directory copied into the container as --sumber, and refuses one with no template file", () => {
    const kosong = mkdtempSync(join(tmpdir(), "data-peluncuran-kosong-"));
    try {
      const { exitCode, output } = jalankan(["--sumber", kosong]);
      expect(exitCode).toBe(1);
      expect(output).toContain("tidak ada satu pun berkas template");
    } finally {
      rmSync(kosong, { recursive: true, force: true });
    }
  });

  it("keeps the staging and production allowances: refused by default, before any database is touched", () => {
    const staging = jalankan(["--sumber", folder], { APP_ENV: "staging" });
    expect(staging.exitCode).toBe(1);
    expect(staging.output).toContain("--izinkan-staging");
    const production = jalankan(["--sumber", folder, "--izinkan-staging"], { APP_ENV: "production" });
    expect(production.exitCode).toBe(1);
    expect(production.output).toContain("--izinkan-production");
  });
});
