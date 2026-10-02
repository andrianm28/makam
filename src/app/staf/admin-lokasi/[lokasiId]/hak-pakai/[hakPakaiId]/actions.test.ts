import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../../../tests/support/server-sign-in";
import { akhiriHakPakaiAction, catatPembongkaranAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const idle = { status: "idle" } as const;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** A Lokasi Mitra whose Admin Lokasi is signed in, with one Terisi Petak and its Hak Pakai. */
async function hakPakaiTerisi() {
  const admin = await signInAsAdminPlatform(server);
  const runtime = server.runtime();
  const created = await runtime.lokasi.createLokasiMitra(admin, { name: "Makam Wakaf Al-Ikhlas", pengelolaName: "Yayasan Al-Ikhlas", address: "Jl. Raya Pondok Rangon No. 1", city: "Kota Jakarta Timur" });
  if (!created.ok) throw new Error(created.reason);
  const lokasiId = created.lokasiMitra.id;
  const adminLokasi = await signInAsAdminLokasi(server, admin, lokasiId);
  const jenis = await runtime.tariffs.createJenisMakam(admin, lokasiId, {
    name: "Reguler 1 × 2 m",
    description: "",
    tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 1 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!jenis.ok) throw new Error(jenis.reason);
  const blok = await runtime.inventory.createBlok(adminLokasi, lokasiId, { name: "A", rows: 1, cols: 2, jenisMakamId: jenis.jenisMakam.id });
  if (!blok.ok) throw new Error(blok.reason);
  const denah = await runtime.inventory.asStaff(adminLokasi).blok(lokasiId, blok.blok.id);
  const petakId = denah!.cells.find((cell) => cell.kind === "petak")!.id;
  const diisi = await runtime.inventory.clearPetak(adminLokasi, lokasiId, petakId, { mode: "terisi", dataMenyusul: false, pemegangHak: { name: "Budi Santoso", phoneNumber: "081234567890", email: "budi@contoh.id" } });
  if (!diisi.ok) throw new Error(diisi.reason);
  return { adminLokasi, lokasiId, petakId, hakPakaiId: diisi.hakPakaiId! };
}

describe("Akhiri Hak Pakai and Catat Pembongkaran Server Actions", () => {
  it("the Admin Lokasi ends a Hak Pakai with a reason, then records the Pembongkaran, and the Petak is Tersedia again", async () => {
    const { adminLokasi, lokasiId, petakId, hakPakaiId } = await hakPakaiTerisi();

    expect(await akhiriHakPakaiAction(idle, form({ lokasiId, hakPakaiId, alasan: "Keluarga tidak menjawab" }))).toEqual({ status: "berhasil", message: expect.stringContaining("berakhir") });
    expect((await server.runtime().inventory.asStaff(adminLokasi).hakPakaiOfPetak(lokasiId, petakId))?.status).toBe("berakhir");

    expect(await catatPembongkaranAction(idle, form({ lokasiId, hakPakaiId }))).toEqual({ status: "berhasil", message: expect.stringContaining("Pembongkaran") });
    const denah = await server.runtime().inventory.asStaff(adminLokasi).bloks(lokasiId);
    const blok = await server.runtime().inventory.asStaff(adminLokasi).blok(lokasiId, denah[0]!.id);
    expect(blok!.cells.find((cell) => cell.id === petakId)!.status).toBe("tersedia");
  });

  it("ending a Hak Pakai without a reason is refused with why, and the Hak Pakai stays Aktif", async () => {
    const { adminLokasi, lokasiId, petakId, hakPakaiId } = await hakPakaiTerisi();

    expect(await akhiriHakPakaiAction(idle, form({ lokasiId, hakPakaiId, alasan: "  " }))).toEqual({ status: "gagal", message: expect.stringContaining("Alasan") });
    expect((await server.runtime().inventory.asStaff(adminLokasi).hakPakaiOfPetak(lokasiId, petakId))?.status).toBe("aktif");
  });

  it("Catat Pembongkaran before the Hak Pakai ended is refused with why", async () => {
    const { lokasiId, hakPakaiId } = await hakPakaiTerisi();

    expect(await catatPembongkaranAction(idle, form({ lokasiId, hakPakaiId }))).toEqual({ status: "gagal", message: expect.stringContaining("belum berakhir") });
  });
});
