/**
 * UAT penuh, worst cases of the Saat Duka order at a Lokasi Mitra: two staff
 * (or one double tap) acting on the same order or the same Petak at once. Each
 * race ends in one outcome the family and the staff can read back: one Hak
 * Pakai, one Tagihan, never a Petak given twice.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function siap(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const pesan = async (almarhumName: string) => {
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), almarhumName, rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    return placed.pemesanan.nomor;
  };
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  return { ...fixture, pesan, cells };
}

describe("a Saat Duka order under concurrency (UAT penuh, worst case)", () => {
  it("a double tap on Konfirmasi with two different Petak confirms once: one Hak Pakai, one Tagihan, the other Petak still free", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await siap(setup);
    const nomor = await f.pesan("Siti Aminah");

    const hasil = await Promise.all([
      setup.pemesanan.konfirmasiSaatDuka(f.adminLokasi, { nomor, petakId: f.cells[0]!.id, pemakamanAt: "2026-10-02T10:00" }),
      setup.pemesanan.konfirmasiSaatDuka(f.adminLokasi, { nomor, petakId: f.cells[1]!.id, pemakamanAt: "2026-10-02T10:00" }),
    ]);

    const berhasil = hasil.filter((h) => h.ok);
    expect(berhasil).toHaveLength(1);
    expect(hasil.find((h) => !h.ok)).toMatchObject({ ok: false });
    const order = await setup.pemesanan.orderOf(nomor, f.pemesan);
    expect(order).toMatchObject({ status: "dikonfirmasi", tagihanId: expect.any(String) });

    const hakPakai = await Promise.all(
      [f.cells[0]!, f.cells[1]!].map((cell) => setup.inventory.asStaff(f.adminLokasi).hakPakaiOfPetak(f.lokasiMitra.id, cell.id)),
    );
    expect(hakPakai.filter(Boolean)).toHaveLength(1);
  });

  it("two orders confirmed onto the same Petak at once: one gets it, the other is refused and stays Diajukan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await siap(setup);
    const satu = await f.pesan("Siti Aminah");
    const dua = await f.pesan("Ahmad Fauzi");
    const petakId = f.cells[0]!.id;

    const hasil = await Promise.all([
      setup.pemesanan.konfirmasiSaatDuka(f.adminLokasi, { nomor: satu, petakId, pemakamanAt: "2026-10-02T10:00" }),
      setup.pemesanan.konfirmasiSaatDuka(f.adminLokasi, { nomor: dua, petakId, pemakamanAt: "2026-10-02T10:00" }),
    ]);

    expect(hasil.filter((h) => h.ok)).toHaveLength(1);
    const statuses = await Promise.all([satu, dua].map(async (nomor) => (await setup.pemesanan.orderOf(nomor, f.pemesan))?.status));
    expect(statuses.sort()).toEqual(["diajukan", "dikonfirmasi"]);
  });

  it("Konfirmasi and Tolak pressed at once by two Admin Lokasi end in one of them, never both", async () => {
    const setup = pemesananOnTestDatabase(db);
    const f = await siap(setup);
    const nomor = await f.pesan("Siti Aminah");

    const [konfirmasi, tolak] = await Promise.all([
      setup.pemesanan.konfirmasiSaatDuka(f.adminLokasi, { nomor, petakId: f.cells[0]!.id, pemakamanAt: "2026-10-02T10:00" }),
      setup.pemesanan.tolakSaatDuka(f.adminLokasi, { nomor, alasan: "petak_tidak_tersedia" }),
    ]);

    expect([konfirmasi.ok, tolak.ok].filter(Boolean)).toHaveLength(1);
    const order = await setup.pemesanan.orderOf(nomor, f.pemesan);
    const hakPakai = await setup.inventory.asStaff(f.adminLokasi).hakPakaiOfPetak(f.lokasiMitra.id, f.cells[0]!.id);
    if (konfirmasi.ok) {
      expect(order).toMatchObject({ status: "dikonfirmasi", tagihanId: expect.any(String) });
      expect(hakPakai).not.toBeNull();
    } else {
      expect(order?.status).not.toBe("dikonfirmasi");
      expect(order?.tagihanId ?? null).toBeNull();
      expect(hakPakai).toBeNull();
    }
  });
});
