import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, siapkanOperatorLayanan } from "../../../tests/support/layanan";

/**
 * Layanan at a booking checkout (spec, Layanan > Order; Billing > due rules; stories 23 and 48; ticket 53). The fake
 * Clock sits at Thursday 1 Oktober 2026 09:00 WIB. Through the module's public functions only.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function siap(options: Parameters<typeof lokasiDenganLayanan>[1] = {}) {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, options);
  return { setup, lokasi, lokasiId: lokasi.lokasiMitra.id, varianId: lokasi.varian.id };
}

describe("the Layanan a Saat Duka checkout offers", () => {
  it("are only the items marked bisa hari-H", async () => {
    const hariH = await siap({ bisaHariH: true, adaDiPetakKosong: false });
    expect((await hariH.setup.layanan.penawaranCheckout(hariH.lokasiId, "hari_h")).map((grup) => grup.layanan.name)).toEqual(["Pembersihan Makam"]);
  });

  it("leave out an item that is not bisa hari-H", async () => {
    const { setup, lokasiId } = await siap({ bisaHariH: false });
    expect(await setup.layanan.penawaranCheckout(lokasiId, "hari_h")).toEqual([]);
  });

  it("refuse a hari-H item that is not bisa hari-H, and date an accepted one on the burial day", async () => {
    const tidak = await siap({ bisaHariH: false });
    const ditolak = await tidak.setup.layanan.siapkanCheckout({ lokasiId: tidak.lokasiId, mode: "hari_h", items: [{ layananVariantId: tidak.varianId }], hariPemakaman: "2026-10-03" });
    expect(ditolak).toEqual({ ok: false, reason: "layanan_tidak_tersedia" });
  });
});

describe("the hari-H items of a Saat Duka order", () => {
  it("take the burial day as their target date, whatever the lead time", async () => {
    const { setup, lokasiId, varianId } = await siap({ bisaHariH: true, leadTimeDays: 3 });
    const siapkan = await setup.layanan.siapkanCheckout({ lokasiId, mode: "hari_h", items: [{ layananVariantId: varianId }], hariPemakaman: "2026-10-02" });
    expect(siapkan.ok && siapkan.item.map((satu) => satu.targetDate)).toEqual(["2026-10-02"]);
  });
});

describe("the Layanan a Terencana checkout offers", () => {
  it("are only the items that make sense on an empty plot", async () => {
    const kosong = await siap({ adaDiPetakKosong: true });
    expect((await kosong.setup.layanan.penawaranCheckout(kosong.lokasiId, "petak_kosong")).map((grup) => grup.layanan.name)).toEqual(["Pembersihan Makam"]);
  });

  it("leave out an item that does not make sense on an empty plot", async () => {
    const bukan = await siap({ adaDiPetakKosong: false });
    expect(await bukan.setup.layanan.penawaranCheckout(bukan.lokasiId, "petak_kosong")).toEqual([]);
  });

  it("refuse a target date inside the lead time counted from today", async () => {
    const { setup, lokasiId, varianId } = await siap({ leadTimeDays: 3 });
    const cepat = await setup.layanan.siapkanCheckout({ lokasiId, mode: "petak_kosong", items: [{ layananVariantId: varianId, targetDate: "2026-10-03" }] });
    expect(cepat).toEqual({ ok: false, reason: "lead_time_melewati" });
    const cukup = await setup.layanan.siapkanCheckout({ lokasiId, mode: "petak_kosong", items: [{ layananVariantId: varianId, targetDate: "2026-10-04" }] });
    expect(cukup.ok).toBe(true);
  });
});

describe("the Tambah Layanan step of a Perpanjangan", () => {
  it("offers every Layanan the Lokasi offers", async () => {
    const { setup, lokasiId } = await siap({ bisaHariH: false, adaDiPetakKosong: false });
    expect(await setup.layanan.penawaranCheckout(lokasiId, "perpanjangan")).toHaveLength(1);
  });

  it("refuses a target date less than the lead time after the Perpanjangan's due date", async () => {
    const { setup, lokasiId, varianId } = await siap({ leadTimeDays: 3 });
    // Due 4 Oktober 09:00 WIB (3x24 h after issue): the earliest date is 7 Oktober.
    const batasBayar = wib("2026-10-04 09:00");
    const awal = { lokasiId, mode: "perpanjangan" as const, batasBayar };
    expect(await setup.layanan.siapkanCheckout({ ...awal, items: [{ layananVariantId: varianId, targetDate: "2026-10-06" }] })).toEqual({ ok: false, reason: "lead_time_melewati" });
    expect((await setup.layanan.siapkanCheckout({ ...awal, items: [{ layananVariantId: varianId, targetDate: "2026-10-07" }] })).ok).toBe(true);
  });

  it("asks for a date when none is given", async () => {
    const { setup, lokasiId, varianId } = await siap();
    expect(await setup.layanan.siapkanCheckout({ lokasiId, mode: "perpanjangan", batasBayar: wib("2026-10-04 09:00"), items: [{ layananVariantId: varianId }] })).toEqual({ ok: false, reason: "target_kosong" });
  });
});
