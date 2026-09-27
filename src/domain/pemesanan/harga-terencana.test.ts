import { describe, expect, it } from "vitest";
import { QRIS_PAYMENT_CAP } from "@/domain/billing/batas";
import { rupiahSchema } from "@/lib/rupiah";
import { totalTerencana, type HargaUnit } from "./harga-terencana";

const harga: HargaUnit[] = [
  { jenisMakamId: "reguler", hargaHakPakai: rupiahSchema.parse(2_500_000), biayaLayananPlatform: rupiahSchema.parse(150_000) },
  { jenisMakamId: "premium", hargaHakPakai: rupiahSchema.parse(4_000_000), biayaLayananPlatform: rupiahSchema.parse(150_000) },
];

describe("the price of a Pemesanan Terencana selection", () => {
  it("is one Harga Hak Pakai per chosen unit and one Biaya Layanan Platform for the whole Tagihan, never one platform fee per unit", () => {
    const satu = totalTerencana(harga, ["reguler"]);
    const tiga = totalTerencana(harga, ["reguler", "premium", "reguler"]);

    expect(satu).toMatchObject({ hargaHakPakai: [2_500_000], biayaLayananPlatform: 150_000, total: 2_650_000, dalamBatas: true });
    expect(tiga).toMatchObject({ hargaHakPakai: [2_500_000, 4_000_000, 2_500_000], biayaLayananPlatform: 150_000, total: 9_150_000, dalamBatas: true });
  });

  it("prices one unit of each Jenis Makam, whichever order they were picked in", () => {
    expect(totalTerencana(harga, ["premium", "reguler"]).total).toBe(totalTerencana(harga, ["reguler", "premium"]).total);
  });

  it("says a selection v1 cannot take, because its Tagihan would pass the Rp 10.000.000 QRIS cap", () => {
    const batas = totalTerencana(harga, Array.from({ length: 3 }, () => "reguler"));
    const lewat = totalTerencana(harga, Array.from({ length: 4 }, () => "reguler"));

    // One platform fee for the whole selection, so the fourth plot is the one that passes the cap.
    expect(batas).toMatchObject({ total: 7_650_000, dalamBatas: true });
    expect(lewat).toMatchObject({ total: 10_150_000, dalamBatas: false });
    expect(QRIS_PAYMENT_CAP).toBe(10_000_000);
  });

  it("is Rp 0 for an empty selection, so nothing is claimed before a plot is tapped", () => {
    expect(totalTerencana(harga, [])).toMatchObject({ hargaHakPakai: [], total: 0, dalamBatas: true });
  });
});
