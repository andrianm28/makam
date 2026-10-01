import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, newBlok, type InventorySetup } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

type Fixture = Awaited<ReturnType<typeof denahFixture>>;

/** One occupied Petak with a first Pemakaman, whose tenure clock starts at `pemakamanDate`. */
async function occupied(setup: InventorySetup, fixture: Fixture, pemakamanDate: string) {
  const blok = await newBlok(setup, fixture, { rows: 1, cols: 1 });
  const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
  const result = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, {
    mode: "terisi",
    dataMenyusul: false,
    pemegangHak: { name: "Siti Aminah", phoneNumber: "0812-3456-7890" },
    pemakaman: { almarhumName: "Abdullah", date: pemakamanDate },
  });
  if (!result.ok || !result.hakPakaiId) throw new Error(`could not occupy the Petak: ${JSON.stringify(result)}`);
  const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blok.id);
  return { blokId: blok.id, cellId: cell.id, hakPakaiId: result.hakPakaiId, status: denah!.cells[0]!.status };
}

describe("the end of a fixed-term Hak Pakai (stories 57, 129, 130)", () => {
  it("becomes Kedaluwarsa at the end date, which shows the Petak as Masa Berlaku Habis", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    // 5-year term from 2020-06-15: end date 2025-06-15, already past the fixture's clock (2026-10-01).
    const { hakPakaiId, blokId, cellId } = await occupied(setup, fixture, "2020-06-15");

    expect(await setup.inventory.tandaiKedaluwarsa(setup.clock.now())).toBe(1);

    const hakPakai = await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, cellId);
    expect(hakPakai).toMatchObject({ status: "kedaluwarsa" });
    expect(hakPakaiId).toBe(hakPakai!.id);
    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blokId);
    expect(denah?.cells[0]).toMatchObject({ status: "masa_berlaku_habis" });
  });

  it("leaves a Hak Pakai whose end date is still ahead Aktif", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const { cellId } = await occupied(setup, fixture, "2024-01-01"); // ends 2029-01-01.

    expect(await setup.inventory.tandaiKedaluwarsa(setup.clock.now())).toBe(0);
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, cellId)).toMatchObject({
      status: "aktif",
    });
  });

  it("shows a Kedaluwarsa Hak Pakai in masa tenggang in the Antrean Lokasi, until it is ended", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const { hakPakaiId } = await occupied(setup, fixture, "2020-06-15");
    setup.clock.set(wib("2025-07-01 09:00")); // inside the Masa Tenggang 2025-06-15 .. 2025-09-15.
    await setup.inventory.tandaiKedaluwarsa(setup.clock.now());

    const rows = await setup.inventory.hakPakaiMasaTenggang(fixture.lokasiMitra.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hakPakaiId, endDate: "2025-06-15", masaTenggangSelesai: "2025-09-15" });
    expect(rows[0]!.subjectLabel).toContain("Siti Aminah");

    const ended = await setup.inventory.berakhirkanHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
      hakPakaiId,
      alasan: "Keluarga tidak memperpanjang",
    });
    expect(ended).toEqual({ ok: true, hakPakaiId });
    expect(await setup.inventory.hakPakaiMasaTenggang(fixture.lokasiMitra.id)).toEqual([]);
  });

  it("ends a Hak Pakai by hand as Berakhir, keeping the Petak Terisi until a Pembongkaran is recorded", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const { hakPakaiId, blokId } = await occupied(setup, fixture, "2024-01-01");

    const ended = await setup.inventory.berakhirkanHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
      hakPakaiId,
      alasan: "Pengembalian Hak Pakai",
    });
    expect(ended).toEqual({ ok: true, hakPakaiId });
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blokId))[0]!.id)).toMatchObject({
      status: "berakhir",
      endReason: "Pengembalian Hak Pakai",
    });

    // Ending is final.
    expect(
      await setup.inventory.berakhirkanHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId, alasan: "lagi" }),
    ).toEqual({ ok: false, reason: "hak_pakai_sudah_berakhir" });

    // The grave is still Terisi: no Pembongkaran yet.
    expect((await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blokId))?.cells[0]?.status).toBe("terisi");

    const dibongkar = await setup.inventory.catatPembongkaran(fixture.adminLokasi, fixture.lokasiMitra.id, {
      hakPakaiId,
      alasan: "Dipindahkan ke TPU",
    });
    expect(dibongkar).toEqual({ ok: true, hakPakaiId });
    expect((await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blokId))?.cells[0]?.status).toBe("tersedia");

    expect(await setup.inventory.catatPembongkaran(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId })).toEqual({
      ok: false,
      reason: "sudah_dibongkar",
    });
  });

  it("allows Tidak Tersedia only once no Hak Pakai holds the Petak, and after a Pembongkaran", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const { hakPakaiId, cellId, blokId } = await occupied(setup, fixture, "2024-01-01");

    expect(
      await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cellId, {
        mode: "tidak_tersedia",
        reason: "Longsor",
      }),
    ).toEqual({ ok: false, reason: "sudah_ada_hak_pakai" });

    await setup.inventory.berakhirkanHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId, alasan: "Selesai" });
    // A Berakhir right without a Pembongkaran still holds the grave (Terisi).
    expect(
      await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cellId, { mode: "tidak_tersedia", reason: "Longsor" }),
    ).toEqual({ ok: false, reason: "sudah_ada_hak_pakai" });

    await setup.inventory.catatPembongkaran(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId });
    expect(
      await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cellId, { mode: "tidak_tersedia", reason: "Longsor" }),
    ).toEqual({ ok: true, hakPakaiId: null });
    const denah = await setup.inventory.asStaff(fixture.adminLokasi).blok(fixture.lokasiMitra.id, blokId);
    expect(denah?.cells[0]).toMatchObject({ status: "tidak_tersedia", tidakTersediaReason: "Longsor" });
  });
});
