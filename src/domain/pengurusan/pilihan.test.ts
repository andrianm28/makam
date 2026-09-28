/**
 * The TPU section of the Saat Duka wizard and the Saat Duka TPU submission
 * (spec, Pengurusan; stories 19, 68–72; ticket 44's AC), driven only through
 * the Pengurusan module's public functions.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { hargaTpu, pengurusanOnTestDatabase, tpu } from "../../../tests/support/pengurusan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the TPU section of Pilih makam", () => {
  it("lists only the TPUs that are taking new plots", async () => {
    const setup = pengurusanOnTestDatabase(db);
    await hargaTpu(setup);
    await tpu(setup, { name: "TPU Kober" });
    await tpu(setup, { name: "TPU Bambu" });
    await tpu(setup, { name: "TPU Penuh", menerimaMakamBaru: false });

    const kartu = await setup.pengurusan.pilihanSaatDukaTpu();

    expect(kartu.map((satu) => satu.tpu.name)).toEqual(["TPU Bambu", "TPU Kober"]);
  });

  it("shows the TPU price as the burial Biaya Pengurusan and the Retribusi Pemda, and never a Biaya Layanan Platform", async () => {
    const setup = pengurusanOnTestDatabase(db);
    await hargaTpu(setup);
    await tpu(setup);

    const [kartu] = await setup.pengurusan.pilihanSaatDukaTpu();

    // The two lines, as their own line each; the platform fee that every Lokasi Mitra order carries is not one of them.
    expect(kartu.harga.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["biaya_pengurusan", 1_750_000],
      ["retribusi_pemda", 0],
    ]);
    expect(kartu.harga.total).toBe(1_750_000);
  });

  it("promises a confirmation two service hours inside the TPU window: 23:00 is confirmed by 08:00", async () => {
    const setup = pengurusanOnTestDatabase(db);
    await hargaTpu(setup);
    await tpu(setup);
    setup.clock.set(wib("2026-10-01 23:00"));

    const [malam] = await setup.pengurusan.pilihanSaatDukaTpu();

    expect(malam.konfirmasi).toEqual({ bukaSekarang: false, batas: { ok: true, at: wib("2026-10-02 08:00") } });

    setup.clock.set(wib("2026-10-01 16:00"));
    const [sore] = await setup.pengurusan.pilihanSaatDukaTpu();
    // 16:00 is inside the window, so the two hours are counted from now: the
    // window closes at 18:00 and one hour is left, so one more falls in it.
    expect(sore.konfirmasi).toEqual({ bukaSekarang: true, batas: { ok: true, at: wib("2026-10-01 18:00") } });
  });
});
