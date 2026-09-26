import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { simpanBiayaPemakaman, simpanTarifGlobal, simpanTarifJenisMakam, tambahJenisMakam } from "./actions";

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
    ).toEqual({ status: "gagal", message: "Isi jumlah dalam rupiah bulat tanpa sen, paling banyak Rp 100.000.000.000, misalnya 150.000." });
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
    expect((await server.runtime().tariffs.asStaff(admin).lokasiTariffs(lokasiId, wib("2026-10-01 09:00"))).jenisMakam).toMatchObject([
      { name: "Reguler 1 × 2 m", inForce: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000 } },
    ]);

    await signInAsAdminLokasi(server, admin, lokasiId);
    expect(await tambahJenisMakam(idle, form({ ...typed, name: "VIP" }))).toEqual({
      status: "gagal",
      message: "Anda tidak berwenang melakukan ini.",
    });
    expect((await server.runtime().tariffs.asStaff(admin).lokasiTariffs(lokasiId, wib("2026-10-01 09:00"))).jenisMakam).toHaveLength(1);
  });

  it("Simpan tarif Jenis Makam: a change to Selamanya keeps the Perpanjangan price typed, for the Hak Pakai already bought for N years", async () => {
    const admin = await signInAsAdminPlatform(server);
    const lokasiId = await lokasiMitraOf(admin);
    const created = await server.runtime().tariffs.createJenisMakam(admin, lokasiId, {
      name: "Reguler",
      description: "",
      tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!created.ok) throw new Error(created.reason);

    const state = await simpanTarifJenisMakam(
      idle,
      form({
        lokasiId,
        jenisMakamId: created.jenisMakam.id,
        hargaHakPakai: "30.000.000",
        tenure: "selamanya",
        tenureYears: "",
        hargaPerpanjangan: "3.500.000",
        effectiveOn: "2026-11-01",
        reason: "",
      }),
    );

    expect(state).toMatchObject({ status: "berhasil" });
    expect(await server.runtime().tariffs.asStaff(admin).jenisMakamTariffHistory(created.jenisMakam.id)).toMatchObject([
      { tenure: { kind: "tahun", years: 5 } },
      { tenure: { kind: "selamanya" }, hargaPerpanjangan: 3_500_000 },
    ]);
  });

  it("a field that is not valid is named in the message: the date, the name, the years, each amount", async () => {
    const admin = await signInAsAdminPlatform(server);
    const lokasiId = await lokasiMitraOf(admin);
    const typed = {
      lokasiId,
      name: "Reguler",
      description: "",
      hargaHakPakai: "7.500.000",
      tenure: "tahun",
      tenureYears: "5",
      hargaPerpanjangan: "3.000.000",
      effectiveOn: "2026-10-01",
      reason: "",
    };
    const refused = (message: string) => ({ status: "gagal", message });

    expect(
      await simpanTarifGlobal(idle, form({ key: "biaya_layanan_platform", amount: "150.000", effectiveOn: "2026-02-30", reason: "" })),
    ).toEqual(refused("Isi tanggal berlaku yang benar."));
    expect(
      await simpanTarifGlobal(idle, form({ key: "biaya_layanan_platform", amount: "100.000.000.001", effectiveOn: "2026-11-01", reason: "" })),
    ).toEqual(refused("Isi jumlah dalam rupiah bulat tanpa sen, paling banyak Rp 100.000.000.000, misalnya 150.000."));
    expect(await tambahJenisMakam(idle, form({ ...typed, name: "   " }))).toEqual(refused("Isi nama Jenis Makam (paling banyak 120 huruf)."));
    for (const tenureYears of ["", "0", "2,5", "101"]) {
      expect(await tambahJenisMakam(idle, form({ ...typed, tenureYears }))).toEqual(
        refused("Isi jumlah tahun per masa: bilangan bulat dari 1 sampai 100."),
      );
    }
    expect(await tambahJenisMakam(idle, form({ ...typed, hargaHakPakai: "7,5 juta" }))).toEqual(
      refused("Isi Harga Hak Pakai dalam rupiah bulat tanpa sen, paling banyak Rp 100.000.000.000, misalnya 7.500.000."),
    );
    expect(await tambahJenisMakam(idle, form({ ...typed, hargaPerpanjangan: "" }))).toEqual(
      refused("Isi Harga Perpanjangan per masa dalam rupiah bulat tanpa sen, paling banyak Rp 100.000.000.000, misalnya 3.000.000."),
    );
    expect(
      await simpanBiayaPemakaman(
        idle,
        form({ lokasiId, biayaPemakaman: "2.000.000", biayaPemakamanTumpang: "sama", effectiveOn: "2026-10-01", reason: "" }),
      ),
    ).toEqual(refused("Isi Biaya Pemakaman tumpang dalam rupiah bulat tanpa sen (kosongkan bila sama), paling banyak Rp 100.000.000.000."));
    expect((await server.runtime().tariffs.asStaff(admin).lokasiTariffs(lokasiId, wib("2026-10-01 09:00"))).jenisMakam).toEqual([]);
  });
});

async function lokasiMitraOf(admin: Awaited<ReturnType<typeof signInAsAdminPlatform>>): Promise<string> {
  const created = await server.runtime().lokasi.createLokasiMitra(admin, {
    name: "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  return created.lokasiMitra.id;
}
