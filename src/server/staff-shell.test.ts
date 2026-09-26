import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { testServerRuntime } from "../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../tests/support/server-sign-in";
import { staffShell } from "./staff-area";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** Signs a number in, in the test browser, instead of whoever was signed in. */
async function signIn(phoneNumber: string) {
  browser.reset();
  browser.store((await server.logIn(phoneNumber)).session.cookies);
}

async function newLokasiMitra(name: string) {
  const admin = await signInAsAdminPlatform(server);
  const created = await server.runtime().lokasi.createLokasiMitra(admin, {
    name,
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  return { admin, lokasiId: created.lokasiMitra.id };
}

describe("the staff shell", () => {
  it("an Akun holding Petugas Lapangan and Mitra Jasa can switch between exactly those two roles", async () => {
    const admin = await signInAsAdminPlatform(server);
    for (const role of ["petugas_lapangan", "mitra_jasa"] as const) {
      const invited = await server.runtime().identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role });
      if (!invited.ok) throw new Error(invited.reason);
    }
    await signIn("082222222222");

    expect((await staffShell())?.roles).toEqual([
      { role: "petugas_lapangan", label: "Petugas Lapangan", href: "/staf/petugas-lapangan" },
      { role: "mitra_jasa", label: "Mitra Jasa", href: "/staf/mitra-jasa" },
    ]);
  });

  it("an Admin Platform past the TOTP step gets the shell with its one role and its account for the account menu", async () => {
    await signInAsAdminPlatform(server, "081111111111");

    expect(await staffShell()).toMatchObject({
      roles: [{ role: "admin_platform", label: "Admin Platform", href: "/staf/admin-platform" }],
      account: { phoneNumber: "+6281111111111", email: "admin@makam.co.id" },
    });
  });

  it("there is no shell before the TOTP step, for a Pemesan, or when signed out", async () => {
    const { identity } = server.runtime();
    await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
    await signIn("081111111111");
    expect(await staffShell()).toBeNull();

    await signIn("085555555555");
    expect(await staffShell()).toBeNull();

    browser.reset();
    expect(await staffShell()).toBeNull();
  });

  it("names every Lokasi Mitra for an Admin Platform's breadcrumbs, but only its own for an Admin Lokasi", async () => {
    const { admin, lokasiId } = await newLokasiMitra("Makam Wakaf Al-Ikhlas");
    const other = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "TPU Keluarga Sentosa",
      pengelolaName: "Yayasan Sentosa",
      address: "Jl. Sentosa No. 2",
      city: "Kota Depok",
    });
    if (!other.ok) throw new Error(other.reason);

    expect((await staffShell())?.lokasiNames).toEqual({
      [lokasiId]: "Makam Wakaf Al-Ikhlas",
      [other.lokasiMitra.id]: "TPU Keluarga Sentosa",
    });

    await signInAsAdminLokasi(server, admin, lokasiId);
    expect((await staffShell())?.lokasiNames).toEqual({ [lokasiId]: "Makam Wakaf Al-Ikhlas" });
  });
});
