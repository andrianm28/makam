import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { denahFixture, inventoryOnTestDatabase, jenisMakamInput, newBlok, signedInAdminLokasi } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("an Admin Lokasi creates a Blok on its Denah", () => {
  it("starts every cell a Petak Makam, numbered from the pattern prefixed with the Blok's name, each Perlu Verifikasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);

    const created = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "A",
      rows: 2,
      cols: 3,
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(created).toMatchObject({ ok: true, blok: { name: "A", rows: 2, cols: 3 } });
    if (!created.ok) throw new Error("unreachable");

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, created.blok.id);
    expect(denah?.cells.map((cell) => cell.nomorMakam)).toEqual(["A-01", "A-02", "A-03", "A-04", "A-05", "A-06"]);
    expect(denah?.cells.every((cell) => cell.kind === "petak")).toBe(true);
    expect(denah?.cells.every((cell) => cell.perluVerifikasi)).toBe(true);
    expect(denah?.cells.every((cell) => cell.jenisMakamId === fixture.jenisMakam.id)).toBe(true);
  });

  it("accepts an editable numbering pattern", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);

    const created = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "Melati",
      rows: 1,
      cols: 2,
      numberPattern: "MEL-{nnn}",
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, created.blok.id);
    expect(denah?.cells.map((cell) => cell.nomorMakam)).toEqual(["MEL-001", "MEL-002"]);
  });

  it("Blok name is unique per Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    await newBlok(setup, fixture, { name: "A" });

    const again = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "a",
      rows: 1,
      cols: 1,
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(again).toEqual({ ok: false, reason: "nama_sudah_ada" });
  });

  it("Nomor Makam is unique across the whole Lokasi, not just within one Blok", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "A",
      rows: 1,
      cols: 2,
      numberPattern: "X-{nn}",
      jenisMakamId: fixture.jenisMakam.id,
    });

    const clash = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "B",
      rows: 1,
      cols: 2,
      numberPattern: "X-{nn}",
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(clash).toMatchObject({ ok: false, reason: "nomor_sudah_dipakai", conflicts: ["X-01", "X-02"] });
  });

  it("a numbering pattern without a place for the running number is refused", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const refused = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "A",
      rows: 1,
      cols: 2,
      numberPattern: "A-XX",
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(refused).toEqual({ ok: false, reason: "pola_tidak_valid" });
  });

  it("refuses a Jenis Makam that does not belong to this Lokasi Mitra", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const otherLokasi = await newLokasiMitraWithJenisMakam(setup, fixture);

    const refused = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
      name: "A",
      rows: 1,
      cols: 1,
      jenisMakamId: otherLokasi.jenisMakamId,
    });
    expect(refused).toEqual({ ok: false, reason: "jenis_makam_tidak_ditemukan" });
  });

  it("is refused for Admin Platform and for another Lokasi's Admin Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);

    const byAdminPlatform = await setup.inventory.createBlok(fixture.admin, fixture.lokasiMitra.id, {
      name: "A",
      rows: 1,
      cols: 1,
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(byAdminPlatform).toEqual({ ok: false, reason: "tidak_berwenang" });

    const other = await setup.lokasi.createLokasiMitra(fixture.admin, {
      name: "Makam Lain",
      pengelolaName: "Yayasan Lain",
      address: "Jl. Lain No. 2",
      city: "Kota Jakarta Selatan",
    });
    if (!other.ok) throw new Error(`Lokasi Mitra refused: ${other.reason}`);
    const otherAdminLokasi = await signedInAdminLokasi(setup, fixture.admin, [other.lokasiMitra.id], "084444444444");

    const byOtherAdminLokasi = await setup.inventory.createBlok(otherAdminLokasi, fixture.lokasiMitra.id, {
      name: "A",
      rows: 1,
      cols: 1,
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(byOtherAdminLokasi).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("every Blok creation is audited on its Lokasi Mitra", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);

    const entries = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    expect(entries.map((entry) => entry.action)).toContain("denah.buat_blok");
    const entry = entries.find((entry) => entry.action === "denah.buat_blok");
    expect(entry?.entity).toEqual({ kind: "denah_blok", id: blok.id });
    expect(entry?.actor).toEqual({ accountId: fixture.adminLokasi.accountId, role: "admin_lokasi" });
  });
});

/** A second Lokasi Mitra with its own Jenis Makam, for cross-Lokasi isolation tests. */
async function newLokasiMitraWithJenisMakam(setup: ReturnType<typeof inventoryOnTestDatabase>, fixture: Awaited<ReturnType<typeof denahFixture>>) {
  const other = await setup.lokasi.createLokasiMitra(fixture.admin, {
    name: "Makam Lain",
    pengelolaName: "Yayasan Lain",
    address: "Jl. Lain No. 2",
    city: "Kota Jakarta Selatan",
  });
  if (!other.ok) throw new Error(`Lokasi Mitra refused: ${other.reason}`);
  const created = await setup.tariffs.createJenisMakam(fixture.admin, other.lokasiMitra.id, jenisMakamInput("Reguler Lain"));
  if (!created.ok) throw new Error(`Jenis Makam refused: ${created.reason}`);
  return { lokasiId: other.lokasiMitra.id, jenisMakamId: created.jenisMakam.id };
}
