import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { simpanProfilTpu, simpanStatusTpu, tambahTpu } from "./actions";

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

const profil = {
  name: "TPU Kober",
  address: "Jl. TPU No. 1, Jakarta Timur",
  city: "Kota Jakarta Timur",
  pinLat: "-6.2",
  pinLng: "106.9",
  dataSource: "Dinas Pengguna Umum dan Prasarana",
};

describe("TPU DKI Server Actions", () => {
  it("Tambah TPU: Admin Platform adds a DKI TPU with its initial new-plot status", async () => {
    const admin = await signInAsAdminPlatform(server);

    expect(await tambahTpu(idle, form({ ...profil, menerimaMakamBaru: "ya" }))).toEqual({
      status: "berhasil",
      message: "TPU Kober ditambahkan.",
    });
    expect(await server.runtime().lokasi.tpuDkiList(admin)).toMatchObject([{ name: "TPU Kober", menerimaMakamBaru: true }]);
  });

  it("Tambah TPU: a second TPU of the same name is refused, and a blank name is refused on its own field", async () => {
    const admin = await signInAsAdminPlatform(server);
    await tambahTpu(idle, form({ ...profil, menerimaMakamBaru: "ya" }));

    expect(await tambahTpu(idle, form({ ...profil, name: "tpu  kober", menerimaMakamBaru: "tidak" }))).toEqual({
      status: "gagal",
      message: "Sudah ada TPU dengan nama ini.",
    });
    expect(await tambahTpu(idle, form({ ...profil, name: "  ", menerimaMakamBaru: "ya" }))).toEqual({
      status: "gagal",
      message: "Isi nama TPU (paling banyak 120 huruf).",
    });
    expect(await server.runtime().lokasi.tpuDkiList(admin)).toHaveLength(1);
  });

  it("Simpan profil: Admin Platform corrects a TPU; an Admin Lokasi cannot, and is told so", async () => {
    const admin = await signInAsAdminPlatform(server);
    await tambahTpu(idle, form({ ...profil, menerimaMakamBaru: "ya" }));
    const [tpu] = await server.runtime().lokasi.tpuDkiList(admin);

    expect(await simpanProfilTpu(idle, form({ ...profil, tpuId: tpu.id, name: "TPU Sawah Besar", city: "Kabupaten Bogor" }))).toEqual({
      status: "berhasil",
      message: "Profil TPU Sawah Besar disimpan.",
    });

    const lokasiMitra = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!lokasiMitra.ok) throw new Error(lokasiMitra.reason);
    await signInAsAdminLokasi(server, admin, lokasiMitra.lokasiMitra.id);
    expect(await simpanProfilTpu(idle, form({ ...profil, tpuId: tpu.id, name: "TPU Elsewhere" }))).toEqual({
      status: "gagal",
      message: "Anda tidak berwenang melakukan ini.",
    });
  });

  it("Simpan profil: Admin Platform corrects a TPU; a rename onto another TPU's name is refused with why", async () => {
    const admin = await signInAsAdminPlatform(server);
    await tambahTpu(idle, form({ ...profil, menerimaMakamBaru: "ya" }));
    await tambahTpu(idle, form({ ...profil, name: "TPU Koper", menerimaMakamBaru: "ya" }));
    const koper = (await server.runtime().lokasi.tpuDkiList(admin)).find((item) => item.name === "TPU Koper");

    expect(await simpanProfilTpu(idle, form({ ...profil, tpuId: koper!.id, name: "tpu  kober" }))).toEqual({
      status: "gagal",
      message: "Sudah ada TPU dengan nama ini.",
    });
  });

  it("Simpan status: Admin Platform records what the TPU takes today, and the row's date follows", async () => {
    const admin = await signInAsAdminPlatform(server);
    await tambahTpu(idle, form({ ...profil, menerimaMakamBaru: "ya" }));
    const [tpu] = await server.runtime().lokasi.tpuDkiList(admin);
    const firstChecked = tpu.flagUpdatedAt;

    expect(await simpanStatusTpu(idle, form({ tpuId: tpu.id, nama: "TPU Kober", menerimaMakamBaru: "tidak" }))).toEqual({
      status: "berhasil",
      message: "Status TPU Kober disimpan: tidak menerima makam baru.",
    });

    const [after] = await server.runtime().lokasi.tpuDkiList(admin);
    expect(after.menerimaMakamBaru).toBe(false);
    expect(after.flagUpdatedAt.getTime()).toBeGreaterThanOrEqual(firstChecked.getTime());
  });
});
