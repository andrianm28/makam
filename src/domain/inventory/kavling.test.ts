import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, markKavlingUsedForTest, markPetakUsedForTest, newBlok } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A cell at (row, col) in reading order, for a Blok read with `cols` columns. */
function at(cells: Awaited<ReturnType<typeof cellsOf>>, cols: number, row: number, col: number) {
  return cells[row * cols + col];
}

describe("grouping Petak Makam into a Kavling Keluarga", () => {
  it("groups at least 2 Petak connected by shared edges, with its own Jenis Makam and a pre-filled, editable Nomor Kavling", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(created).toMatchObject({ ok: true, nomorKavling: "A-K01" });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.kavling).toMatchObject([{ nomorKavling: "A-K01", jenisMakamId: fixture.jenisMakam.id }]);
    expect(denah?.cells.every((cell) => cell.kavlingId === denah.kavling[0].id)).toBe(true);
  });

  it("accepts an editable Nomor Kavling, unique per Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
      nomorKavling: "Kavling Melati",
    });
    expect(created).toMatchObject({ ok: true, nomorKavling: "Kavling Melati" });

    const blok2 = await newBlok(setup, fixture, { name: "B", rows: 1, cols: 2 });
    const cells2 = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok2.id);
    const clash = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok2.id, {
      cellIds: cells2.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
      nomorKavling: "kavling melati",
    });
    expect(clash).toEqual({ ok: false, reason: "nomor_sudah_dipakai", conflicts: ["Kavling Melati"] });
  });

  it("refuses cells connected only diagonally, not by a shared edge", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const diagonal = [at(cells, 2, 0, 0), at(cells, 2, 1, 1)];

    const refused = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: diagonal.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(refused).toEqual({ ok: false, reason: "tidak_bersambung" });
  });

  it("refuses a group split across two disconnected pairs", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 5 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    // Columns 0,1 and 3,4: each pair adjacent, but the two pairs are not connected to each other.
    const selection = [cells[0], cells[1], cells[3], cells[4]];

    const refused = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: selection.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(refused).toEqual({ ok: false, reason: "tidak_bersambung" });
  });

  it("refuses fewer than 2 cells", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const refused = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id],
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(refused).toEqual({ ok: false, reason: "kurang_dari_dua" });
  });

  it("refuses a cell that already has a Hak Pakai", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await markPetakUsedForTest(db, cells[0].id, setup.clock.now());

    const refused = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(refused).toEqual({ ok: false, reason: "pernah_dipakai", cellIds: [cells[0].id] });
  });

  it("refuses a cell already part of another Kavling Keluarga", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 3 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id, cells[1].id],
      jenisMakamId: fixture.jenisMakam.id,
    });

    const refused = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[1].id, cells[2].id],
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(refused).toEqual({ ok: false, reason: "sudah_kavling", cellIds: [cells[1].id] });
  });

  it("Kavling Keluarga can be split back into separate Petak Makam while it has no Hak Pakai", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");

    const split = await setup.inventory.splitKavling(fixture.adminLokasi, fixture.lokasiMitra.id, created.kavlingId);
    expect(split).toEqual({ ok: true });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.kavling).toEqual([]);
    expect(denah?.cells.every((cell) => cell.kavlingId === null)).toBe(true);
  });

  it("splitting a Kavling Keluarga that already has a Hak Pakai is refused", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");
    await markKavlingUsedForTest(db, created.kavlingId, setup.clock.now());

    const refused = await setup.inventory.splitKavling(fixture.adminLokasi, fixture.lokasiMitra.id, created.kavlingId);
    expect(refused).toEqual({ ok: false, reason: "punya_hak_pakai" });
  });

  it("grouping and splitting are both audited", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");
    await setup.inventory.splitKavling(fixture.adminLokasi, fixture.lokasiMitra.id, created.kavlingId);

    const actions = (await setup.audit.entriesForLokasi(fixture.lokasiMitra.id)).map((entry) => entry.action);
    expect(actions).toContain("denah.buat_kavling");
    expect(actions).toContain("denah.pisahkan_kavling");
  });
});
