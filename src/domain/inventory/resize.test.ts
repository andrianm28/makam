import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, markPetakUsedForTest, newBlok } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

function grid(cells: Awaited<ReturnType<typeof cellsOf>>, rows: number, cols: number) {
  const out: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  for (const cell of cells) out[cell.row][cell.col] = cell.nomorMakam ?? "";
  return out;
}

describe("adding a row or column at an edge of a Blok", () => {
  it("adds a row at the bottom, new cells Petak Makam of the Blok's Jenis Makam, Perlu Verifikasi, numbered from the pattern", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });

    const result = await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "bawah");
    expect(result).toEqual({ ok: true, rows: 2, cols: 2 });

    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const bottomRow = cells.filter((cell) => cell.row === 1);
    expect(bottomRow).toHaveLength(2);
    expect(bottomRow.every((cell) => cell.kind === "petak" && cell.perluVerifikasi && cell.jenisMakamId === fixture.jenisMakam.id)).toBe(true);
    expect(bottomRow.map((cell) => cell.nomorMakam)).toEqual(["A-03", "A-04"]);
  });

  it("adds a row at the top, shifting every existing cell down without changing its Nomor Makam", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const before = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "atas");

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const movedDown = after.filter((cell) => before.some((old) => old.id === cell.id));
    expect(movedDown.every((cell) => cell.row === 1)).toBe(true);
    expect(movedDown.map((cell) => cell.nomorMakam)).toEqual(before.map((cell) => cell.nomorMakam));
    expect(after.filter((cell) => cell.row === 0)).toHaveLength(2);
  });

  it("adds a column at the left and at the right", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 1 });

    await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "kiri");
    let cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(grid(cells, 2, 2).map((row) => row.filter(Boolean).length)).toEqual([2, 2]);

    await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "kanan");
    cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(grid(cells, 2, 3).map((row) => row.filter(Boolean).length)).toEqual([3, 3]);
  });

  it("keeps every Nomor Makam unique in the Lokasi even after several edge insertions", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "atas");
    await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "kiri");

    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const numbers = cells.map((cell) => cell.nomorMakam);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("removing a row or column of a Blok", () => {
  it("removes a row when none of its Petak was ever used", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 3, cols: 2 });

    const result = await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      axis: "baris",
      indices: [1],
    });
    expect(result).toEqual({ ok: true, rows: 2, cols: 2 });

    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(cells).toHaveLength(4);
    expect([...new Set(cells.map((cell) => cell.row))].sort()).toEqual([0, 1]);
  });

  it("reindexes remaining rows so positions stay contiguous from 0", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 4, cols: 1 });
    const before = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const keepNumbers = [before[0].nomorMakam, before[2].nomorMakam, before[3].nomorMakam];

    await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { axis: "baris", indices: [1] });

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(after.map((cell) => cell.row)).toEqual([0, 1, 2]);
    expect(after.map((cell) => cell.nomorMakam)).toEqual(keepNumbers);
  });

  it("refuses to remove a row containing a Petak that was ever used", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await markPetakUsedForTest(db, cells[0].id, setup.clock.now());

    const refused = await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      axis: "baris",
      indices: [0],
    });
    expect(refused).toEqual({ ok: false, reason: "pernah_dipakai", cellIds: [cells[0].id] });

    // Nothing changed.
    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(after).toHaveLength(4);
  });

  it("refuses to remove a row or column that cuts through a Kavling Keluarga", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");

    const refused = await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      axis: "baris",
      indices: [0],
    });
    expect(refused).toEqual({ ok: false, reason: "termasuk_kavling", kavlingIds: [created.kavlingId] });
  });

  it("keeps a Kavling Keluarga's cells adjacent after removing an unrelated row", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 3, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    // Kavling on rows 1–2 (bottom two rows); row 0 is unrelated and removable.
    const kavlingCells = cells.filter((cell) => cell.row >= 1);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: kavlingCells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");

    const removed = await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      axis: "baris",
      indices: [0],
    });
    expect(removed.ok).toBe(true);

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.kavling[0].cellIds.sort()).toEqual(kavlingCells.map((cell) => cell.id).sort());
  });

  it("refuses to shrink a Blok below 1 row or 1 column", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 1 });

    const refused = await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      axis: "baris",
      indices: [0, 1],
    });
    expect(refused).toEqual({ ok: false, reason: "ukuran_minimum" });
  });

  it("row and column changes are audited", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 2, cols: 2 });
    await setup.inventory.addEdge(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "bawah");
    await setup.inventory.removeRowsOrCols(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { axis: "baris", indices: [0] });

    const actions = (await setup.audit.entriesForLokasi(fixture.lokasiMitra.id)).map((entry) => entry.action);
    expect(actions.filter((action) => action === "denah.ubah_baris_kolom")).toHaveLength(2);
  });
});
