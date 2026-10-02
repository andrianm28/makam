/** The families subscribed to a Paket Layanan at a Lokasi Mitra: who hears of its Berhenti (ticket 59). */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, lokasiDenganLayanan, petakDenganHakPakai, pemesanLayanan, siapkanOperatorLayanan } from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Paket Layanan subscribers of a Lokasi Mitra", () => {
  it("names each family subscribed there, with its Nomor Pemesanan and email, and none at another Lokasi", async () => {
    const setup = layananOnTestDatabase(db);
    const admin = await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup, { amount: 750_000 });
    const dibuat = await setup.layanan.buatPaket(admin, { name: "Paket Ziarah", description: "Satu Layanan.", frekuensi: "bulanan", itemIds: [lokasi.varian.id], reason: null });
    if (!dibuat.ok) throw new Error(`Paket refused: ${dibuat.reason}`);
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup, "pelanggan@contoh.id");
    const langganan = await setup.layanan.berlanggananPaket(pemesan, {
      paketId: dibuat.paket.id,
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      mulai: "2026-11-20",
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
    });
    if (!langganan.ok) throw new Error(`Berlangganan refused: ${langganan.reason}`);

    expect(await setup.layanan.pelangganPaketDiLokasi(lokasi.lokasiMitra.id)).toEqual([{ nomor: langganan.paket.nomor, email: "pelanggan@contoh.id" }]);
    expect(await setup.layanan.pelangganPaketDiLokasi("00000000-0000-4000-8000-000000000000")).toEqual([]);
  });
});
