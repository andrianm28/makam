import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  jenisMakamInput,
  newTpuDki,
  publishOnTestDatabase,
  publishedLokasiMitra,
  type PublishSetup,
} from "../../../tests/support/publish";
import { signInAsAdminPlatform } from "../../../tests/support/server-sign-in";
import { testServerRuntime } from "../../../tests/support/server-runtime";
import { daftarLokasi } from "./daftar";

vi.mock("server-only", () => ({}));

const { db, close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(resetDatabase);

/**
 * The publish path (a Terverifikasi Lokasi Mitra) runs on a Lokasi + Tariffs setup of its own; the page
 * reads through the web runtime. Both sit on the same test database, so what one writes the other reads.
 */
const publish = publishOnTestDatabase(db);
type Admin = Awaited<ReturnType<typeof signInAsAdminPlatform>>;

/**
 * The page reads on the web runtime's own fake Clock, which starts at 09:00 while the publish setup's
 * entries are stamped on its own. Standing the page's clock past them is what a request an hour later
 * would see, and it is what makes those versions in force.
 */
function pageReadsNow() {
  server.clock.set(wib("2026-10-01 10:00"));
}

/** The TPU prices Admin Platform entered, so a TPU card has a starting price of its own. */
async function tpuPricesEntered(setup: PublishSetup, admin: Admin) {
  await setup.tariffs.setGlobalTariff(admin, {
    key: "biaya_pengurusan_pemakaman",
    amount: 1_500_000,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  await setup.tariffs.setGlobalTariff(admin, { key: "retribusi_pemda_iptm", amount: 0, effectiveOn: "2026-10-01", reason: null });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
}

describe("the Daftar Lokasi Makam page's own cards", () => {
  it("gives every Lokasi Mitra card its own price, even when a TPU sorts before it in the same list", async () => {
    const setup = publish;
    const admin = await signInAsAdminPlatform(server);
    // "Ziarah" sorts after "TPU", so the TPU comes first in the combined list and a positional read of the
    // price would hand this Lokasi Mitra the TPU's price (or none at all, and "Harga belum tersedia").
    await publishedLokasiMitra(setup, admin, "Makam Keluarga Sawah");
    // The publish path signs its Admin Lokasi in again, so the second Lokasi Mitra waits out the resend delay.
    setup.clock.advance({ minutes: 5 });
    await publishedLokasiMitra(setup, admin, "Ziarah Al-Amin", {
      jenisMakam: { ...jenisMakamInput("Reguler"), tariff: { ...jenisMakamInput("Reguler").tariff, hargaHakPakai: 3_250_000 } },
    });
    await tpuPricesEntered(setup, admin);
    await newTpuDki(setup, admin, "TPU Kober");

    pageReadsNow();
    const { baris } = await daftarLokasi({});

    expect(baris.map((row) => row.card.name)).toEqual(["Makam Keluarga Sawah", "TPU Kober", "Ziarah Al-Amin"]);
    // The Lokasi Mitra after the TPU keeps its own all-in price (Harga Hak Pakai + Biaya Layanan Platform).
    expect(baris.at(-1)).toMatchObject({
      card: { kind: "lokasi_mitra", name: "Ziarah Al-Amin" },
      mulaiRp: 3_250_000 + 150_000,
    });
    expect(baris[0]).toMatchObject({ card: { kind: "lokasi_mitra", name: "Makam Keluarga Sawah" }, mulaiRp: 7_500_000 + 150_000 });
    // A TPU card's starting price is the TPU price, the same for every TPU.
    expect(baris[1]).toMatchObject({ card: { kind: "tpu", name: "TPU Kober" }, mulaiRp: 1_500_000 });
  });

  it("offers the type filter, the city filter and each city's name, and narrows by each", async () => {
    const setup = publish;
    const admin = await signInAsAdminPlatform(server);
    await publishedLokasiMitra(setup, admin, "Makam Keluarga Sawah");
    await tpuPricesEntered(setup, admin);
    await newTpuDki(setup, admin, "TPU Kober");
    await setup.lokasi.createTpuDki(admin, {
      name: "TPU Sawah Besar",
      address: "Jl. Sawah Besar No. 3",
      city: "Kabupaten Bogor",
      pin: null,
      dataSource: "Jakarta Open Data",
      menerimaMakamBaru: false,
    });

    pageReadsNow();
    const semua = await daftarLokasi({});
    expect(semua.kota).toEqual(["Kabupaten Bogor", "Kota Jakarta Timur"]);
    expect((await daftarLokasi({ jenis: "tpu" })).baris.map((row) => row.card.name)).toEqual(["TPU Kober", "TPU Sawah Besar"]);
    expect((await daftarLokasi({ jenis: "lokasi_mitra" })).baris.map((row) => row.card.name)).toEqual(["Makam Keluarga Sawah"]);
    expect((await daftarLokasi({ kota: "Kabupaten Bogor" })).baris.map((row) => row.card.name)).toEqual(["TPU Sawah Besar"]);
    expect((await daftarLokasi({ kota: "Kota Jakarta Timur" })).baris.map((row) => row.card.name)).toEqual([
      "Makam Keluarga Sawah",
      "TPU Kober",
    ]);
  });

  it("shows a TPU with no TPU prices entered yet as no price, never as Rp 0", async () => {
    const setup = publish;
    const admin = await signInAsAdminPlatform(server);
    await newTpuDki(setup, admin, "TPU Kober");

    pageReadsNow();
    const { baris } = await daftarLokasi({});

    expect(baris).toMatchObject([{ card: { kind: "tpu", name: "TPU Kober" }, mulaiRp: null }]);
  });
});
