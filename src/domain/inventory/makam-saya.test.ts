/**
 * The Akun Saya Makam tab (ticket 27, ADR 0004: "a Hak Pakai shows in the
 * Akun whose Email Terverifikasi equals the recorded email"), which carries
 * more than the public lookup's `makamPemegangHak`: the Hak Pakai's own id and
 * every Pemakaman it covers, so a family sees the full record for a grave they
 * hold — even one someone else ordered.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, newBlok, type InventorySetup } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function denah(setup: InventorySetup, input: { name?: string; rows?: number; cols?: number } = {}) {
  const fixture = await denahFixture(setup);
  const blok = await newBlok(setup, fixture, { name: input.name ?? "A", rows: input.rows ?? 1, cols: input.cols ?? 1 });
  const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
  return { ...fixture, blok, cells };
}

describe("the Akun Saya Makam tab", () => {
  it("lists a grave for the recorded Pemegang Hak email, even when a different Akun ordered it", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { cells, ...fixture } = await denah(setup);
    const diisi = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cells[0].id, {
      mode: "terisi",
      dataMenyusul: false,
      // The Pemesan who placed the order and the Pemegang Hak it names are two different people
      // (spec, story 101: "even ones someone else ordered"): the Pemesan's own email is never
      // recorded as the Pemegang Hak's here, only the holder's.
      pemegangHak: { name: "Bapak Umar", phoneNumber: "081234567891", email: "waris@contoh.id" },
      pemakaman: { almarhumName: "Siti Nur", date: "2019-04-02" },
    });
    if (!diisi.ok) throw new Error(`Petak refused: ${diisi.reason}`);

    const tab = await setup.inventory.makamKeluargaSaya({ email: "WARIS@CONTOH.ID" });

    expect(tab).toHaveLength(1);
    expect(tab[0]).toMatchObject({
      lokasiId: fixture.lokasiMitra.id,
      kavlingId: null,
      nomorKavling: null,
      status: "aktif",
      petak: [{ petakId: cells[0].id, nomorMakam: cells[0].nomorMakam }],
      pemakaman: [expect.objectContaining({ almarhumName: "Siti Nur", date: "2019-04-02" })],
    });
    expect(tab[0].hakPakaiId).toEqual(expect.any(String));

    // The Pemesan's own account, or any other account, sees nothing here: the tab is per email.
    expect(await setup.inventory.makamKeluargaSaya({ email: "pemesan@contoh.id" })).toEqual([]);
  });

  it("carries every Pemakaman a Kavling Keluarga covers, oldest first", async () => {
    const setup = inventoryOnTestDatabase(db);
    const { cells, ...fixture } = await denah(setup, { name: "B", cols: 2 });
    const dibuat = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, fixture.blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!dibuat.ok) throw new Error(`Kavling refused: ${dibuat.reason}`);
    const diisi = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, dibuat.kavlingId, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Keluarga Hasan", phoneNumber: "081234567891", email: "keluarga@contoh.id" },
      pemakaman: { almarhumName: "Hasan", date: "2022-03-01", petakId: cells[0].id },
    });
    if (!diisi.ok) throw new Error(`Kavling refused: ${diisi.reason}`);

    const tab = await setup.inventory.makamKeluargaSaya({ email: "keluarga@contoh.id" });

    expect(tab).toHaveLength(1);
    expect(tab[0].kavlingId).toEqual(dibuat.kavlingId);
    expect(tab[0].petak).toHaveLength(2);
    expect(tab[0].pemakaman).toEqual([expect.objectContaining({ almarhumName: "Hasan", date: "2022-03-01", petakId: cells[0].id })]);
  });

  it("is empty for an email that holds nothing, and for one that is not an email", async () => {
    const setup = inventoryOnTestDatabase(db);

    expect(await setup.inventory.makamKeluargaSaya({ email: "tidak@punyakontoh.id" })).toEqual([]);
    expect(await setup.inventory.makamKeluargaSaya({ email: "bukan email" })).toEqual([]);
  });
});
