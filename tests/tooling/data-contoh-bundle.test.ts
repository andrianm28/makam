import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const BUNDLE = join(ROOT, "dist/data-contoh.mjs");
const DIST_ADA = existsSync(join(ROOT, "dist"));

/** The bundle copied alone into a directory with no node_modules above it, as the runtime image has it: a dependency that stayed out of the bundle fails to resolve. */
let salinan = "";

/** Runs the bundle as the host does (`node dist/<name>.mjs`), with only the environment given. */
function jalankan(args: string[], env: Record<string, string> = {}) {
  const hasil = spawnSync(process.execPath, [salinan, ...args], { cwd: tmpdir(), env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  return { exitCode: hasil.status, output: `${hasil.stdout}${hasil.stderr}` };
}

describe("the Data Contoh bundle (dist/data-contoh.mjs), run as on the staging and production hosts (ticket 109)", () => {
  beforeAll(() => {
    // The runtime image only has what build:worker bundles, so build it the way the image does.
    const build = spawnSync(process.execPath, ["scripts/build-worker.mjs"], { cwd: ROOT, encoding: "utf8" });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const tempat = mkdtempSync(join(tmpdir(), "bundel-data-contoh-"));
    salinan = join(tempat, "data-contoh.mjs");
    copyFileSync(BUNDLE, salinan);
    return () => {
      rmSync(tempat, { recursive: true, force: true });
      if (!DIST_ADA) rmSync(join(ROOT, "dist"), { recursive: true, force: true });
    };
  }, 120_000);

  it("is bundled by build:worker", () => {
    expect(existsSync(BUNDLE)).toBe(true);
  });

  it("runs on its own and says how to use it without a subcommand (exit 2)", () => {
    const { exitCode, output } = jalankan([]);
    expect(exitCode).toBe(2);
    expect(output).toContain("Pakai: data-contoh");
  });

  it("keeps the staging and production allowances: refused by default, before any database is touched", () => {
    const staging = jalankan(["status"], { APP_ENV: "staging" });
    expect(staging.exitCode).toBe(1);
    expect(staging.output).toContain("di staging perlu --izinkan-staging");
    const production = jalankan(["status", "--izinkan-staging"], { APP_ENV: "production" });
    expect(production.exitCode).toBe(1);
    expect(production.output).toContain("di production perlu --izinkan-production");
  });

  it("plants nothing on a production that pays live, even with its flag", () => {
    const { exitCode, output } = jalankan(["tanam", "--set", "rilis1", "--tulis", "--izinkan-production"], { APP_ENV: "production" });
    expect(exitCode).toBe(1);
    expect(output).toContain("tidak membayar lewat sandbox SumoPod");
  });
});
