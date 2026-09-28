/**
 * Recording a Pemakaman on a Hak Pakai (spec, Inventory > Pemakaman, and the
 * Hak Pakai's end date whose "clock starts at the first Pemakaman, tumpang
 * doesn't reset it"). Two rules, checked where the module owns them: a
 * fixed-term Hak Pakai ends the term's years after the burial that was recorded,
 * and a Selamanya one has no end date at all.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import type { Tenure } from "@/domain/tariffs";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, inventoryOnTestDatabase, newBlok, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, type InventorySetup } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

let nomor = 0;

/** The one Admin Platform a setup acts as (the first seed is refused twice). */
async function adminPlatform(setup: InventorySetup) {
  return (await signedInAdminPlatform(setup)).actor;
}

/** One occupied Petak (a Hak Pakai with a Pemegang Hak) of a Jenis Makam with the given term, and the Admin Lokasi of its own Lokasi Mitra. */
async function petakTerisi(setup: InventorySetup, admin: Actor, tenure: Tenure) {
  nomor += 1;
  const lokasiMitra = await newLokasiMitra(setup, admin, `Makam Wakaf Al-Ikhlas ${nomor}`);
  const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id], `0833333333${nomor}`);
  const dibuat = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Reguler 1 × 2 m",
    description: "",
    tariff: { hargaHakPakai: 7_500_000, tenure, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!dibuat.ok) throw new Error(`Jenis Makam refused: ${dibuat.reason}`);
  const fixture = { admin, adminLokasi, lokasiMitra, jenisMakam: dibuat.jenisMakam };
  const blok = await newBlok(setup, fixture);
  const cells = (await cellsOf(setup, adminLokasi, lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  const petakId = cells[0]!.id;
  const diisi = await setup.inventory.clearPetak(adminLokasi, lokasiMitra.id, petakId, {
    mode: "terisi",
    dataMenyusul: false,
    pemegangHak: { name: "Budi Santoso", phoneNumber: "081234567890" },
  });
  if (!diisi.ok) throw new Error(`clearPetak refused: ${diisi.reason}`);
  return { ...fixture, petakId, hakPakaiId: diisi.hakPakaiId! };
}

/** The same Pemakaman, the form's input. */
const burial = (hakPakaiId: string, tanggal: string) => ({ hakPakaiId, almarhumName: "Siti Aminah", tanggal });

describe("recording a Pemakaman", () => {
  it("ends a fixed-term Hak Pakai the term's years after the burial that was recorded, and leaves a Selamanya one open", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = await adminPlatform(setup);
    const limaTahun = await petakTerisi(setup, admin, { kind: "tahun", years: 5 });
    const selamanya = await petakTerisi(setup, admin, { kind: "selamanya" });

    expect(await setup.inventory.catatPemakaman(limaTahun.adminLokasi, limaTahun.lokasiMitra.id, { ...burial(limaTahun.hakPakaiId, "2026-09-26"), layer: 2 })).toMatchObject({
      ok: true,
      pemakaman: { almarhumName: "Siti Aminah", date: "2026-09-26", layer: 2 },
      masa: { mulai: "2026-09-26", selesai: "2031-09-26" },
    });
    expect(await setup.inventory.catatPemakaman(selamanya.adminLokasi, selamanya.lokasiMitra.id, burial(selamanya.hakPakaiId, "2026-09-26"))).toMatchObject({
      masa: { mulai: "2026-09-26", selesai: null },
    });

    const tetap = await setup.inventory.asStaff(limaTahun.adminLokasi).hakPakaiOfPetak(limaTahun.lokasiMitra.id, limaTahun.petakId);
    expect(tetap).toMatchObject({
      tenureStartAt: new Date("2026-09-26T00:00:00.000Z"),
      endDate: new Date("2031-09-26T00:00:00.000Z"),
      pemakaman: [{ almarhumName: "Siti Aminah", date: "2026-09-26", layer: 2 }],
    });
    const terbuka = await setup.inventory.asStaff(selamanya.adminLokasi).hakPakaiOfPetak(selamanya.lokasiMitra.id, selamanya.petakId);
    expect(terbuka).toMatchObject({ tenureStartAt: new Date("2026-09-26T00:00:00.000Z"), endDate: null });
  });

  it("refuses a day the Clock has not reached, and leaves the clock unstarted", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = await adminPlatform(setup);
    const fixture = await petakTerisi(setup, admin, { kind: "tahun", years: 5 });
    // The fixture's Clock sits at 1 October 2026: a burial cannot be recorded for a day still to come.
    expect(await setup.inventory.catatPemakaman(fixture.adminLokasi, fixture.lokasiMitra.id, burial(fixture.hakPakaiId, "2026-10-06"))).toEqual({
      ok: false,
      reason: "tanggal_pemakaman_tidak_valid",
    });

    const hak = await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId);
    expect(hak?.tenureStartAt).toBeNull();
    expect(hak?.pemakaman).toEqual([]);
  });

  it("refuses another Lokasi's Admin Lokasi, Admin Platform and an unknown Hak Pakai", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = await adminPlatform(setup);
    const fixture = await petakTerisi(setup, admin, { kind: "tahun", years: 5 });
    const lain = await petakTerisi(setup, admin, { kind: "tahun", years: 5 });

    // Another Lokasi Mitra's Admin Lokasi has no say on this one.
    expect(await setup.inventory.catatPemakaman(lain.adminLokasi, fixture.lokasiMitra.id, burial(fixture.hakPakaiId, "2026-09-26"))).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.inventory.catatPemakaman(fixture.admin, fixture.lokasiMitra.id, burial(fixture.hakPakaiId, "2026-09-26"))).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(
      await setup.inventory.catatPemakaman(fixture.adminLokasi, fixture.lokasiMitra.id, burial("00000000-0000-4000-8000-000000000000", "2026-09-26")),
    ).toEqual({ ok: false, reason: "hak_pakai_tidak_ditemukan" });
  });
});
