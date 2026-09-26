import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, markPetakUsedForTest, newBlok } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("bulk-editing a Blok's cells", () => {
  it("turns selected Petak Makam into Jalan or Bukan Petak, clearing their Nomor Makam and Jenis Makam", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.setCellKind(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id, cells[1].id],
      kind: "jalan",
    });
    expect(result).toMatchObject({ ok: true, outcome: { changedIds: [cells[0].id, cells[1].id] } });

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(after[0]).toMatchObject({ kind: "jalan", nomorMakam: null, jenisMakamId: null, perluVerifikasi: false });
    expect(after[1]).toMatchObject({ kind: "jalan", nomorMakam: null, jenisMakamId: null });
  });

  it("turns a Jalan or Bukan Petak cell back into a Petak Makam: a fresh Nomor Makam, Perlu Verifikasi set again", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await setup.inventory.setCellKind(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { cellIds: [cells[0].id], kind: "bukan_petak" });

    const back = await setup.inventory.setCellKind(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id],
      kind: "petak",
    });
    expect(back.ok).toBe(true);

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const restored = after.find((cell) => cell.id === cells[0].id)!;
    expect(restored.kind).toBe("petak");
    expect(restored.perluVerifikasi).toBe(true);
    expect(restored.jenisMakamId).toBe(fixture.jenisMakam.id);
    expect(restored.nomorMakam).not.toBeNull();
    // The number is freshly assigned from the Blok's pattern, not reused, and unique.
    expect(after.filter((cell) => cell.nomorMakam === restored.nomorMakam)).toHaveLength(1);
  });

  it("a Petak Makam with a Hak Pakai or Pemakaman can't be retyped: it is skipped, not changed", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await markPetakUsedForTest(db, cells[0].id, setup.clock.now());

    const result = await setup.inventory.setCellKind(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id, cells[1].id],
      kind: "jalan",
    });
    expect(result).toMatchObject({ ok: true, outcome: { changedIds: [cells[1].id], skippedUsed: [cells[0].id] } });

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(after.find((cell) => cell.id === cells[0].id)?.kind).toBe("petak");
  });

  it("selecting only cells that already have a Hak Pakai refuses the whole bulk edit", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await markPetakUsedForTest(db, cells[0].id, setup.clock.now());

    const result = await setup.inventory.setCellKind(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id],
      kind: "jalan",
    });
    expect(result).toEqual({ ok: false, reason: "sel_terkunci", skippedUsed: [cells[0].id], skippedKavling: [] });
  });

  it("sets the Jenis Makam of selected Petak Makam in bulk", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const taman = await setup.tariffs.createJenisMakam(fixture.admin, fixture.lokasiMitra.id, {
      name: "Makam Taman",
      description: "",
      tariff: { hargaHakPakai: 12_000_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!taman.ok) throw new Error("unreachable");
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.setJenisMakam(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.slice(0, 2).map((cell) => cell.id),
      jenisMakamId: taman.jenisMakam.id,
    });
    expect(result.ok).toBe(true);

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(after[0].jenisMakamId).toBe(taman.jenisMakam.id);
    expect(after[1].jenisMakamId).toBe(taman.jenisMakam.id);
    expect(after[2].jenisMakamId).toBe(fixture.jenisMakam.id);
  });

  it("renumbers selected Petak Makam in reading order from a pattern", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 3 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.renumberCells(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      pattern: "A-{nnn}",
      startAt: 10,
    });
    expect(result.ok).toBe(true);

    const after = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(after.map((cell) => cell.nomorMakam)).toEqual(["A-010", "A-011", "A-012"]);
  });

  it("renumbering a Nomor Makam already used elsewhere in the Lokasi is refused", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blokA = await newBlok(setup, fixture, { name: "A" });
    const blokB = await newBlok(setup, fixture, { name: "B", numberPattern: "B-{nn}" });
    const cellsB = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blokB.id);

    const clash = await setup.inventory.renumberCells(fixture.adminLokasi, fixture.lokasiMitra.id, blokB.id, {
      cellIds: [cellsB[0].id],
      pattern: "A-{nn}",
      startAt: 1,
    });
    expect(clash).toMatchObject({ ok: false, reason: "nomor_sudah_dipakai", conflicts: ["A-01"] });
    void blokA;
  });

  it("editing one Petak Makam's Nomor Makam directly, uniquely per Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const renamed = await setup.inventory.setSingleNumber(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, cells[0].id, "A-99");
    expect(renamed).toEqual({ ok: true, nomorMakam: "A-99" });

    const clash = await setup.inventory.setSingleNumber(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, cells[1].id, "a-99");
    expect(clash).toEqual({ ok: false, reason: "nomor_sudah_dipakai", conflicts: ["A-99"] });
  });

  it("a used Petak Makam's Nomor Makam can't be changed by the Admin Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await markPetakUsedForTest(db, cells[0].id, setup.clock.now());

    const refused = await setup.inventory.setSingleNumber(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, cells[0].id, "A-99");
    expect(refused).toEqual({ ok: false, reason: "pernah_dipakai" });
  });

  it("every bulk edit and single renumber is audited", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    await setup.inventory.setCellKind(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { cellIds: [cells[0].id], kind: "jalan" });
    await setup.inventory.setJenisMakam(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[1].id],
      jenisMakamId: fixture.jenisMakam.id,
    });
    await setup.inventory.setSingleNumber(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, cells[2].id, "A-77");

    const actions = (await setup.audit.entriesForLokasi(fixture.lokasiMitra.id)).map((entry) => entry.action);
    expect(actions).toContain("denah.ubah_jenis_sel");
    expect(actions).toContain("denah.atur_jenis_makam");
    expect(actions).toContain("denah.ubah_nomor");
  });
});
