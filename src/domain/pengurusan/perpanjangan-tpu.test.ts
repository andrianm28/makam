/**
 * Perpanjangan TPU, the IPTM renewal of a Makam TPU (spec, Pengurusan > Perpanjangan TPU; stories 79-83; ticket 48),
 * read only through the Pengurusan module's public functions and what its neighbours show from outside.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pengajuanOnTestDatabase, type PengajuanSetup } from "../../../tests/support/pengurusan";
import { makamTpuDenganIptm } from "../../../tests/support/makam-tpu";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Makam TPU whose IPTM expires on `berlakuSampai`. */
async function makamBerakhir(setup: PengajuanSetup, berlakuSampai: string) {
  return makamTpuDenganIptm(setup, berlakuSampai);
}

const ajukan = (setup: PengajuanSetup, dasar: Awaited<ReturnType<typeof makamBerakhir>>, berlakuSampai: string) =>
  setup.pengurusan.placePerpanjanganTpu({
    pemesan: dasar.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    makamTpuId: dasar.makamTpuId,
    berlakuSampai,
  });

describe("requesting a Perpanjangan TPU", () => {
  it("is refused more than 3 months before the IPTM expires and allowed from exactly 3 months before", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");

    setup.clock.set(wib("2026-11-14 10:00"));
    expect(await ajukan(setup, dasar, "2027-02-15")).toEqual({ ok: false, reason: "terlalu_awal" });

    setup.clock.set(wib("2026-11-15 10:00"));
    const hasil = await ajukan(setup, dasar, "2027-02-15");
    expect(hasil).toMatchObject({ ok: true, pengurusan: { status: "diajukan", lewatMasaTenggang: false } });
  });
});
