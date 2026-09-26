import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { hapusHariLibur, tambahHariLibur } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const idle = { status: "idle" } as const;

describe("Hari Libur Nasional Server Actions", () => {
  it("Tambah hari libur: Admin Platform adds a Hari Libur Nasional; a date already listed is refused with why", async () => {
    await signInAsAdminPlatform(server);

    expect(await tambahHariLibur(idle, form({ date: "2026-12-25", name: "Hari Raya Natal" }))).toEqual({
      status: "berhasil",
      message: "Hari libur nasional ditambahkan.",
    });
    expect(await tambahHariLibur(idle, form({ date: "2026-12-25", name: "Natal" }))).toEqual({
      status: "gagal",
      message: "Tanggal ini sudah ada di daftar hari libur nasional.",
    });
    expect(await server.runtime().lokasi.hariLiburNasional()).toEqual([{ date: "2026-12-25", name: "Hari Raya Natal" }]);
  });

  it("Hapus hari libur: Admin Platform removes a Hari Libur Nasional; an Admin Lokasi cannot", async () => {
    const admin = await signInAsAdminPlatform(server);
    await tambahHariLibur(idle, form({ date: "2026-12-25", name: "Hari Raya Natal" }));
    await tambahHariLibur(idle, form({ date: "2026-08-17", name: "Proklamasi Kemerdekaan RI" }));

    expect(await hapusHariLibur(idle, form({ date: "2026-08-17", reason: "" }))).toEqual({
      status: "berhasil",
      message: "Hari libur nasional dihapus.",
    });
    const created = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!created.ok) throw new Error(created.reason);
    await signInAsAdminLokasi(server, admin, created.lokasiMitra.id);
    expect(await hapusHariLibur(idle, form({ date: "2026-12-25", reason: "" }))).toEqual({
      status: "gagal",
      message: "Anda tidak berwenang melakukan ini.",
    });

    expect(await server.runtime().lokasi.hariLiburNasional()).toEqual([{ date: "2026-12-25", name: "Hari Raya Natal" }]);
  });
});
