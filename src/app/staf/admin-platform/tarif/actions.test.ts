import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { simpanTarifGlobal, tambahJenisMakam } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
  server.clock.set(wib("2026-10-01 09:00"));
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const idle = { status: "idle" } as const;

describe("tariff Server Actions", () => {
  it("Simpan tarif global: a Biaya Layanan Platform typed as 'Rp 175.000' is kept as 175000 whole rupiah from the date typed", async () => {
    await signInAsAdminPlatform(server);

    const state = await simpanTarifGlobal(
      idle,
      form({ key: "biaya_layanan_platform", amount: "Rp 175.000", effectiveOn: "2026-11-01", reason: "" }),
    );

    expect(state).toEqual({ status: "berhasil", message: expect.stringContaining("1 November 2026") });
    expect(await server.runtime().tariffs.globalTariff("biaya_layanan_platform", wib("2026-11-01 00:00"))).toMatchObject({
      amount: 175_000,
      effectiveOn: "2026-11-01",
    });
  });

  it("Simpan tarif global: an amount with sen ('150.000,50') or an effective date before today is refused with why, and nothing is kept", async () => {
    await signInAsAdminPlatform(server);

    expect(
      await simpanTarifGlobal(idle, form({ key: "biaya_layanan_platform", amount: "150.000,50", effectiveOn: "2026-11-01", reason: "" })),
    ).toEqual({ status: "gagal", message: "Isi jumlah dalam rupiah bulat, misalnya 150.000." });
    expect(
      await simpanTarifGlobal(idle, form({ key: "biaya_layanan_platform", amount: "150.000", effectiveOn: "2026-09-30", reason: "" })),
    ).toEqual({ status: "gagal", message: "Tanggal berlaku tidak boleh sebelum hari ini." });
    expect(await server.runtime().tariffs.globalTariffHistory("biaya_layanan_platform")).toEqual([]);
  });

  it("Tambah Jenis Makam: Admin Platform adds one with a fixed term; that Lokasi's Admin Lokasi is refused", async () => {
    const admin = await signInAsAdminPlatform(server);
    const created = await server.runtime().lokasi.createLokasiMitra(admin, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!created.ok) throw new Error(created.reason);
    const lokasiId = created.lokasiMitra.id;
    const typed = {
      lokasiId,
      name: "Reguler 1 × 2 m",
      description: "",
      hargaHakPakai: "7.500.000",
      tenure: "tahun",
      tenureYears: "5",
      hargaPerpanjangan: "3.000.000",
      effectiveOn: "2026-10-01",
      reason: "",
    };

    expect(await tambahJenisMakam(idle, form(typed))).toEqual({ status: "berhasil", message: "Jenis Makam Reguler 1 × 2 m ditambahkan." });
    expect((await server.runtime().tariffs.lokasiTariffs(lokasiId, wib("2026-10-01 09:00"))).jenisMakam).toMatchObject([
      { name: "Reguler 1 × 2 m", inForce: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000 } },
    ]);

    await signInAsAdminLokasi(server, admin, lokasiId);
    expect(await tambahJenisMakam(idle, form({ ...typed, name: "VIP" }))).toEqual({
      status: "gagal",
      message: "Anda tidak berwenang melakukan ini.",
    });
    expect((await server.runtime().tariffs.lokasiTariffs(lokasiId, wib("2026-10-01 09:00"))).jenisMakam).toHaveLength(1);
  });
});
