/**
 * The orders a Lokasi Mitra still has running (ticket 59): who is told when the Lokasi goes Berhenti, and which
 * paid Pemesanan Terencana have their Hak Pakai Pencairan released then.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { pemesananOnTestDatabase, pemesanDenganEmail, siapkanOperatorPemesanan, unitIds } from "../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the orders a Lokasi Mitra still has running", () => {
  it("names a Pemesanan Terencana that was placed there, with its Nomor Pemesanan and the Pemesan's email", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { actor: admin } = await adminPlatformOf(setup);
    await siapkanOperatorPemesanan(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
    const id = await unitIds(setup, fixture, ["A-01"]);
    const hasil = await setup.pemesanan.placeTerencana({
      pemesanName: "Rina Wulandari",
      phoneNumber: "081234567890",
      pemegangHak: { mode: "pemesan" },
      calonPenghuni: { mode: "saya" },
      pemesan,
      lokasiId: fixture.lokasiMitra.id,
      units: [{ petakId: id["A-01"] }],
    });
    if (!hasil.ok) throw new Error("placeTerencana refused");

    expect(await setup.pemesanan.pesananBerjalanDiLokasi(fixture.lokasiMitra.id)).toEqual([
      { nomor: hasil.pemesanan.nomor, kind: "terencana", status: "diajukan", email: "keluarga@contoh.id" },
    ]);
    expect(await setup.pemesanan.pesananBerjalanDiLokasi("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });
});
