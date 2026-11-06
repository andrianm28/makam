import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { aturTampilInfoMakamSwasta, simpanInfoMakamSwasta } from "./actions";

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
const isian = {
  id: "",
  nama: "Heaven Memorial Park",
  kota: "Kabupaten Bogor",
  alamat: "Jl. Buanajaya, Kec. Tanjungsari",
  pengelola: "Grup Rumah Duka Heaven",
  segmen: "Tionghoa",
  luas: "Sekitar 125 ha",
  fasilitas: "",
  sumber: "heaven.co.id\nOkezone, 2022",
  urutan: "60",
};

describe("Info Makam Swasta Server Actions", () => {
  it("Tambah: Admin Platform adds an entry the public pages then show; a price in it is refused with why", async () => {
    await signInAsAdminPlatform(server);

    expect(await simpanInfoMakamSwasta(idle, form(isian))).toEqual({ status: "berhasil", message: "Info Makam Swasta tersimpan." });
    expect(await simpanInfoMakamSwasta(idle, form({ ...isian, nama: "Lain", fasilitas: "Mulai Rp 5 juta" }))).toMatchObject({ status: "gagal" });
    expect(await simpanInfoMakamSwasta(idle, form({ ...isian, nama: "" }))).toMatchObject({ status: "gagal" });

    const tayang = await server.runtime().lokasi.infoMakamSwastaTayang();
    expect(tayang).toEqual([expect.objectContaining({ nama: "Heaven Memorial Park", sumber: ["heaven.co.id", "Okezone, 2022"], urutan: 60 })]);
  });

  it("Sembunyikan: Admin Platform hides an entry; an Admin Lokasi can do neither", async () => {
    const admin = await signInAsAdminPlatform(server);
    await simpanInfoMakamSwasta(idle, form(isian));
    const [entri] = await server.runtime().lokasi.infoMakamSwastaTayang();

    expect(await aturTampilInfoMakamSwasta(idle, form({ id: entri.id, tampil: "tidak" }))).toEqual({
      status: "berhasil",
      message: "Tampilan Info Makam Swasta diperbarui.",
    });
    expect(await server.runtime().lokasi.infoMakamSwastaTayang()).toEqual([]);

    const created = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Contoh",
      pengelolaName: "Yayasan Contoh",
      address: "Jl. Contoh No. 1",
      city: "Kabupaten Contoh",
    });
    if (!created.ok) throw new Error(created.reason);
    await signInAsAdminLokasi(server, admin, created.lokasiMitra.id);
    expect(await aturTampilInfoMakamSwasta(idle, form({ id: entri.id, tampil: "ya" }))).toEqual({ status: "gagal", message: "Anda tidak berwenang melakukan ini." });
    expect(await simpanInfoMakamSwasta(idle, form({ ...isian, nama: "Lain" }))).toEqual({ status: "gagal", message: "Anda tidak berwenang melakukan ini." });
    expect(await server.runtime().lokasi.infoMakamSwastaTayang()).toEqual([]);
  });
});
