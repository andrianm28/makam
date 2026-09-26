import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, newBlok } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("clearing a Petak Makam blok by blok (story 128)", () => {
  it("clears an empty Petak Tersedia, clearing its Perlu Verifikasi flag", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    expect(cell.perluVerifikasi).toBe(true);

    const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    expect(result).toEqual({ ok: true, hakPakaiId: null });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.cells[0]).toMatchObject({ perluVerifikasi: false, status: "tersedia" });
  });

  it("clears a Petak Tidak Tersedia with a reason, only while it has no Hak Pakai", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const missingReason = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tidak_tersedia", reason: "" });
    expect(missingReason).toEqual({ ok: false, reason: "input_tidak_valid" });

    const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tidak_tersedia", reason: "Longsor, sedang diperbaiki" });
    expect(result).toEqual({ ok: true, hakPakaiId: null });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.cells[0]).toMatchObject({ perluVerifikasi: false, status: "tidak_tersedia", tidakTersediaReason: "Longsor, sedang diperbaiki" });
  });

  it("clearing occupied with full details grants an Aktif Hak Pakai, its Pemegang Hak and its first Pemakaman, starting the tenure clock", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Siti Aminah", phoneNumber: "0812-3456-7890" },
      pemakaman: { almarhumName: "Abdullah", date: "2020-06-15" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.cells[0]).toMatchObject({ status: "terisi", perluVerifikasi: false });

    const hakPakai = await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, cell.id);
    expect(hakPakai).toMatchObject({
      status: "aktif",
      perluVerifikasi: false,
      tenureYears: 5,
      pemegangHak: { name: "Siti Aminah", phoneNumber: "+6281234567890", email: null },
      pemakaman: [{ almarhumName: "Abdullah", date: "2020-06-15", layer: 1 }],
    });
    // Tenure clock starts at the first Pemakaman: end date = 2020-06-15 + 5 years.
    expect(hakPakai?.tenureStartAt?.toISOString().slice(0, 10)).toBe("2020-06-15");
    expect(hakPakai?.endDate?.toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it('clearing occupied "data menyusul" creates a Hak Pakai flagged Perlu Verifikasi, with no tenure clock started', async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "terisi", dataMenyusul: true });
    expect(result.ok).toBe(true);

    const hakPakai = await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, cell.id);
    expect(hakPakai).toMatchObject({ status: "aktif", perluVerifikasi: true, tenureStartAt: null, endDate: null, pemegangHak: null, pemakaman: [] });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    // The Petak's own Perlu Verifikasi (newly drawn) is cleared once acted on, even though the Hak Pakai is separately Perlu Verifikasi.
    expect(denah?.cells[0]).toMatchObject({ perluVerifikasi: false, status: "terisi" });
  });

  it("leaves the end date empty for a perpetual Jenis Makam even once the tenure clock (nominally) starts", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const perpetual = await setup.tariffs.createJenisMakam(fixture.admin, fixture.lokasiMitra.id, {
      name: "Wakaf Selamanya",
      description: "",
      tariff: { hargaHakPakai: 0, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
      reason: null,
    });
    if (!perpetual.ok) throw new Error("unreachable");
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1, name: "B" });
    await setup.inventory.setJenisMakam(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).map((c) => c.id),
      jenisMakamId: perpetual.jenisMakam.id,
    });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Umar", phoneNumber: "081234567891" },
      pemakaman: { almarhumName: "Fatimah", date: "2021-01-01" },
    });

    const hakPakai = await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, cell.id);
    expect(hakPakai?.tenureYears).toBeNull();
    expect(hakPakai?.tenureStartAt).not.toBeNull();
    expect(hakPakai?.endDate).toBeNull();
  });

  it("refuses the Pemegang Hak being the same person as the Almarhum", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Budi Santoso", phoneNumber: "081234567891" },
      pemakaman: { almarhumName: "budi   santoso", date: "2021-01-01" },
    });
    expect(result).toEqual({ ok: false, reason: "pemegang_hak_adalah_almarhum" });
  });

  it("requires a Pemegang Hak unless data menyusul, and validates the phone number", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const missing = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "terisi", dataMenyusul: false });
    expect(missing).toEqual({ ok: false, reason: "pemegang_hak_wajib" });

    const badPhone = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Wati", phoneNumber: "123" },
    });
    expect(badPhone).toEqual({ ok: false, reason: "nomor_telepon_tidak_valid" });
  });

  it("a Perlu Verifikasi Petak is excluded from availability until cleared", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const before = await setup.inventory.asStaff(fixture.adminLokasi).availability(fixture.lokasiMitra.id);
    expect(before.find((row) => row.jenisMakamId === fixture.jenisMakam.id)?.count ?? 0).toBe(0);

    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cells[0].id, { mode: "tersedia" });
    const afterOne = await setup.inventory.asStaff(fixture.adminLokasi).availability(fixture.lokasiMitra.id);
    expect(afterOne.find((row) => row.jenisMakamId === fixture.jenisMakam.id)?.count).toBe(1);
  });

  it("refuses to clear a Petak that already has a Hak Pakai", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "terisi", dataMenyusul: true });

    const again = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    expect(again).toEqual({ ok: false, reason: "sudah_ada_hak_pakai" });
  });

  it("refuses to clear a Petak that is a member of a Kavling Keluarga directly (clear the Kavling instead)", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });

    const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cells[0].id, { mode: "tersedia" });
    expect(result).toEqual({ ok: false, reason: "bagian_kavling" });
  });

  it("is refused for an actor who is not that Lokasi's Admin Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);

    const result = await setup.inventory.clearPetak(fixture.admin, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    expect(result).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("clearing a Kavling Keluarga", () => {
  it("clearing occupied grants one Hak Pakai for the whole Kavling, and a Pemakaman naming one member Petak makes it Terpakai sebagian", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");

    const result = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, created.kavlingId, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Keluarga Hasan", phoneNumber: "081234567891" },
      pemakaman: { almarhumName: "Hasan", date: "2022-03-01", petakId: cells[0].id },
    });
    expect(result.ok).toBe(true);

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.kavling[0]).toMatchObject({ status: "terpakai_sebagian" });
    expect(denah?.cells.every((cell) => cell.perluVerifikasi === false)).toBe(true);
  });

  it("refuses a Pemakaman naming a Petak that is not a member of the Kavling", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 3 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: [cells[0].id, cells[1].id],
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");

    const result = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, created.kavlingId, {
      mode: "terisi",
      dataMenyusul: false,
      pemegangHak: { name: "Keluarga Hasan", phoneNumber: "081234567891" },
      pemakaman: { almarhumName: "Hasan", date: "2022-03-01", petakId: cells[2].id },
    });
    expect(result).toEqual({ ok: false, reason: "petak_bukan_anggota_kavling" });
  });

  it("clearing a Kavling Tersedia clears every member Petak's Perlu Verifikasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { rows: 1, cols: 2 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    const created = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    if (!created.ok) throw new Error("unreachable");

    const result = await setup.inventory.clearKavling(fixture.adminLokasi, fixture.lokasiMitra.id, created.kavlingId, { mode: "tersedia" });
    expect(result).toEqual({ ok: true, hakPakaiId: null });

    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
    expect(denah?.kavling[0]).toMatchObject({ status: "tersedia" });
    expect(denah?.cells.every((cell) => cell.perluVerifikasi === false)).toBe(true);
  });
});

