/**
 * `pekerjaanDisetujui` is the fixture of every test that needs a Mitra Jasa's TPU job approved by Admin Platform. The Clock
 * it leaves behind is the one the next job and the next tick of the Keluhan window start from, so it only ever runs forward:
 * a second job is ordered when the first was approved or later, never before.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "./database";
import { mitraJasaUntuk, pekerjaanDisetujui, siapTpuBertarif } from "./layanan-tpu";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the approved TPU job of a Mitra Jasa, as a fixture", () => {
  it("leaves the fake Clock at the approval, so the next job is ordered and approved from there and not from the first day", async () => {
    const s = await siapTpuBertarif(db);
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await pekerjaanDisetujui(s, mitra, { disetujuiPada: "2026-10-05 10:00" });
    expect(s.setup.clock.now()).toEqual(wib("2026-10-05 10:00"));

    await pekerjaanDisetujui(s, mitra, { targetDate: "2026-10-06" });

    expect(s.setup.clock.now()).toEqual(wib("2026-10-05 10:00"));
  });

  it("refuses to turn the fake Clock back past an approval that already happened", async () => {
    const s = await siapTpuBertarif(db);
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await pekerjaanDisetujui(s, mitra, { disetujuiPada: "2026-10-05 10:00" });

    await expect(pekerjaanDisetujui(s, mitra, { dipesanPada: "2026-10-01 09:00" })).rejects.toThrow(/Clock/);
    await expect(pekerjaanDisetujui(s, mitra, { targetDate: "2026-10-07", disetujuiPada: "2026-10-05 09:00" })).rejects.toThrow(/Clock/);
  });
});
