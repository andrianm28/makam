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

/** Signs an email in, in the test browser, instead of whoever was signed in. */
async function signIn(email: string) {
  browser.reset();
  browser.store((await server.logIn(email)).session.cookies);
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
      const invited = await server.runtime().identity.inviteStaff(admin, { email: "staf@contoh.id", phoneNumber: "082222222222", role });
      if (!invited.ok) throw new Error(invited.reason);
    }
    await signIn("staf@contoh.id");

    expect((await staffShell())?.roles).toEqual([
      { role: "petugas_lapangan", label: "Petugas Lapangan", href: "/staf/petugas-lapangan" },
      { role: "mitra_jasa", label: "Mitra Jasa", href: "/staf/mitra-jasa" },
    ]);
  });

  it("an Admin Platform past the TOTP step gets the shell with its one role and its account for the account menu", async () => {
    await signInAsAdminPlatform(server, "admin@makam.co.id");

    expect(await staffShell()).toMatchObject({
      roles: [{ role: "admin_platform", label: "Admin Platform", href: "/staf/admin-platform" }],
      account: { email: "admin@makam.co.id", phoneNumber: "+6281111111111" },
    });
  });

  it("there is no shell before the TOTP step, for a Pemesan, or when signed out", async () => {
    const { identity } = server.runtime();
    await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
    await signIn("admin@makam.co.id");
    expect(await staffShell()).toBeNull();

    await signIn("pemesan@contoh.id");
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

  it("carries the signed-in Admin Lokasi's own Lokasi Mitra for the header's Lokasi switcher; empty for an Admin Platform", async () => {
    const { admin, lokasiId } = await newLokasiMitra("Makam Wakaf Al-Ikhlas");
    const other = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "TPU Keluarga Sentosa",
      pengelolaName: "Yayasan Sentosa",
      address: "Jl. Sentosa No. 2",
      city: "Kota Depok",
    });
    if (!other.ok) throw new Error(other.reason);

    expect((await staffShell())?.adminLokasi).toEqual([]);

    await signInAsAdminLokasi(server, admin, lokasiId);
    expect((await staffShell())?.adminLokasi).toEqual([{ id: lokasiId, name: "Makam Wakaf Al-Ikhlas", city: "Kota Jakarta Timur", status: "belum_tayang", dataContoh: false, publishedAt: null, publishGateRecheckedAt: null }]);
  });

  it("carries the signed-in Akun's Peringatan Staf bell: the unread count and the latest, each with the page of its subject", async () => {
    const { admin, lokasiId } = await newLokasiMitra("Makam Wakaf Al-Ikhlas");
    const adminLokasi = await signInAsAdminLokasi(server, admin, lokasiId);
    const { notifications } = server.runtime();
    await notifications.sendStaffAlert({
      to: { accountId: adminLokasi.accountId },
      kind: "staf_saat_duka_baru",
      email: {
        subject: "Pemesanan Saat Duka baru: MKM-2026-000123",
        text: "MKM-2026-000123 di Makam Wakaf Al-Ikhlas menunggu konfirmasi.",
      },
      push: {
        title: "Pemesanan Saat Duka baru",
        body: "MKM-2026-000123 di Makam Wakaf Al-Ikhlas",
        url: `/staf/admin-lokasi/${lokasiId}`,
      },
    });

    expect((await staffShell())?.alerts).toMatchObject({
      unread: 1,
      latest: [{ title: "Pemesanan Saat Duka baru", url: `/staf/admin-lokasi/${lokasiId}`, read: false }],
    });
  });
});

/** Every page a palette opens. */
function hrefs(palette: NonNullable<Awaited<ReturnType<typeof staffShell>>>["palette"]) {
  return Object.values(palette).flatMap((groups) => groups!.flatMap((group) => group.items.map((item) => item.href)));
}

describe("the command palette (role visibility on the server)", () => {
  it("an Admin Lokasi's palette opens only the pages of its own Lokasi Mitra, never another Lokasi's or an Admin Platform page", async () => {
    const { admin, lokasiId } = await newLokasiMitra("Makam Wakaf Al-Ikhlas");
    const other = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "TPU Keluarga Sentosa",
      pengelolaName: "Yayasan Sentosa",
      address: "Jl. Sentosa No. 2",
      city: "Kota Depok",
    });
    if (!other.ok) throw new Error(other.reason);
    await signInAsAdminLokasi(server, admin, lokasiId);

    const shell = await staffShell();
    expect(Object.keys(shell!.palette)).toEqual(["admin_lokasi"]);
    expect(shell!.palette.admin_lokasi).toEqual([
      {
        label: "Makam Wakaf Al-Ikhlas",
        items: [
          { label: "Beranda", href: `/staf/admin-lokasi/${lokasiId}` },
          { label: "Denah", href: `/staf/admin-lokasi/${lokasiId}/denah` },
          { label: "Jam Operasional", href: `/staf/admin-lokasi/${lokasiId}/jam-operasional` },
          { label: "Audit Log", href: `/staf/admin-lokasi/${lokasiId}/audit-log` },
        ],
      },
    ]);
    expect(hrefs(shell!.palette).filter((href) => href.includes(other.lokasiMitra.id) || href.startsWith("/staf/admin-platform"))).toEqual([]);
  });

  it("an Admin Platform's palette opens its built pages and each Lokasi Mitra by name, never a page that is not built yet", async () => {
    const { lokasiId } = await newLokasiMitra("Makam Wakaf Al-Ikhlas");

    const shell = await staffShell();
    expect(Object.keys(shell!.palette)).toEqual(["admin_platform"]);
    expect(shell!.palette.admin_platform).toEqual([
      {
        label: "Kerja harian",
        items: [
          { label: "Beranda", href: "/staf/admin-platform" },
          { label: "Antrean", href: "/staf/admin-platform/antrean" },
        ],
      },
      {
        label: "Lokasi dan harga",
        items: [
          { label: "Lokasi Mitra", href: "/staf/admin-platform/lokasi" },
          { label: "Tarif global", href: "/staf/admin-platform/tarif" },
          { label: "Hari Libur Nasional", href: "/staf/admin-platform/hari-libur" },
        ],
      },
      {
        label: "Orang",
        items: [
          { label: "Staf", href: "/staf/admin-platform/staf" },
          { label: "Pemulihan Akun", href: "/staf/admin-platform/pemulihan-akun" },
          { label: "Tugas Lapangan", href: "/staf/admin-platform/tugas-lapangan" },
        ],
      },
      {
        label: "Operator",
        items: [
          { label: "Pengaturan Operator", href: "/staf/admin-platform/pengaturan-operator" },
          { label: "Katalog Desain", href: "/staf/admin-platform/desain" },
        ],
      },
      {
        label: "Lokasi Mitra",
        items: [{ label: "Makam Wakaf Al-Ikhlas", href: `/staf/admin-platform/lokasi/${lokasiId}` }],
      },
    ]);
  });

  it("an Akun holding Petugas Lapangan and Mitra Jasa gets exactly those two roles' pages", async () => {
    const admin = await signInAsAdminPlatform(server);
    for (const role of ["petugas_lapangan", "mitra_jasa"] as const) {
      const invited = await server.runtime().identity.inviteStaff(admin, { phoneNumber: "082222222222", email: "staf@contoh.id", role });
      if (!invited.ok) throw new Error(invited.reason);
    }
    await signIn("staf@contoh.id");

    const shell = await staffShell();
    expect(Object.keys(shell!.palette)).toEqual(["petugas_lapangan", "mitra_jasa"]);
    expect(hrefs(shell!.palette)).toEqual([
      "/staf/petugas-lapangan/tugas",
      "/staf/petugas-lapangan/jadwal",
      "/staf/petugas-lapangan/peringatan",
      "/akun",
      "/staf/mitra-jasa/pekerjaan",
      "/staf/mitra-jasa/pencairan",
      "/staf/mitra-jasa/peringatan",
      "/akun",
    ]);
  });
});
