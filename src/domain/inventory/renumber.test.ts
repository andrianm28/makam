import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, newBlok } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Admin Platform renumbering a Petak Makam (story 169)", () => {
  it("renumbers a Petak, audited with the old and new number", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const oldNomor = cell.nomorMakam!;

    const result = await setup.inventory.renumberPetak(fixture.admin, fixture.lokasiMitra.id, cell.id, "A-99");
    expect(result).toEqual({ ok: true, nomorMakam: "A-99" });

    const entries = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    const entry = entries.find((e) => e.action === "petak.nomor_ulang");
    expect(entry?.before).toEqual({ nomorMakam: oldNomor });
    expect(entry?.after).toEqual({ nomorMakam: "A-99" });
  });

  it("is refused for an Admin Lokasi (only Admin Platform renumbers)", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.renumberPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, "A-99");
    expect(result).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("refuses a number already used by another Petak", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.renumberPetak(fixture.admin, fixture.lokasiMitra.id, cells[0].id, cells[1].nomorMakam!);
    expect(result).toEqual({ ok: false, reason: "nomor_sudah_dipakai", conflicts: [cells[1].nomorMakam] });
  });

  it("keeps the old Nomor Makam as a hidden alias: a lookup by it still finds the Petak, but only its current number ever shows", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const oldNomor = cell.nomorMakam!;
    await setup.inventory.renumberPetak(fixture.admin, fixture.lokasiMitra.id, cell.id, "A-99");

    const byOldNumber = await setup.inventory.asStaff(fixture.adminLokasi).findPetak(fixture.lokasiMitra.id, oldNomor);
    expect(byOldNumber).toEqual({ petakId: cell.id, nomorMakam: "A-99" });

    const byNewNumber = await setup.inventory.asStaff(fixture.adminLokasi).findPetak(fixture.lokasiMitra.id, "A-99");
    expect(byNewNumber).toEqual({ petakId: cell.id, nomorMakam: "A-99" });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.cells[0].nomorMakam).toBe("A-99");
    expect(JSON.stringify(denah)).not.toContain(oldNomor);
  });

  it("finds nothing for a number that was never used", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const found = await setup.inventory.asStaff(fixture.adminLokasi).findPetak(fixture.lokasiMitra.id, "Z-999");
    expect(found).toBeNull();
  });
});
