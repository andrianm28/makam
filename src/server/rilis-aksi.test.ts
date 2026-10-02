import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { testServerRuntime } from "../../tests/support/server-runtime";
import { signInAsAdminPlatform } from "../../tests/support/server-sign-in";
import { tambahNazhirDaftar } from "@/app/staf/admin-platform/wakaf/actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});
afterEach(() => vi.unstubAllEnvs());

const nazhir = { nama: "Yayasan Al-Ikhlas", jenis: "organisasi", kabKota: "Kota Depok", kontak: "0811", nomorBwi: "BWI-1" };
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
};

describe("Server Actions of a closed release (ADR 0006)", () => {
  it("a Wakaf Tanah staff action answers 404 at Rilis 1, before any domain call", async () => {
    const admin = await signInAsAdminPlatform(server);
    vi.stubEnv("RILIS_TERBUKA", "1");
    await expect(tambahNazhirDaftar({ status: "idle" }, form(nazhir))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(await server.runtime().wakaf.daftarNazhir(admin)).toEqual([]);
  });

  it("the same action runs at Rilis 3", async () => {
    const admin = await signInAsAdminPlatform(server);
    vi.stubEnv("RILIS_TERBUKA", "3");
    expect(await tambahNazhirDaftar({ status: "idle" }, form(nazhir))).toMatchObject({ status: "berhasil" });
    expect(await server.runtime().wakaf.daftarNazhir(admin)).toHaveLength(1);
  });
});
