/**
 * The end of a fixed-term Hak Pakai (ticket 42): Kedaluwarsa after the end date, the Masa Tenggang row,
 * ending by hand, Terisi until Pembongkaran, and Tidak Tersedia only without a Hak Pakai.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import type { Tenure } from "@/domain/tariffs";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, inventoryOnTestDatabase, newBlok, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, type InventorySetup } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

let nomor = 0;

/** One occupied Petak whose Hak Pakai runs 1 year from a burial on 2025-10-05, so it ends on 2026-10-05 (or never, for Selamanya). */
async function petakTerisi(setup: InventorySetup, admin: Actor, tenure: Tenure = { kind: "tahun", years: 1 }) {
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
    pemegangHak: { name: "Budi Santoso", phoneNumber: "081234567890", email: "budi@contoh.id" },
  });
  if (!diisi.ok) throw new Error(`clearPetak refused: ${diisi.reason}`);
  const hakPakaiId = diisi.hakPakaiId!;
  const dicatat = await setup.inventory.catatPemakaman(adminLokasi, lokasiMitra.id, { hakPakaiId, almarhumName: "Siti Aminah", tanggal: "2025-10-05" });
  if (!dicatat.ok) throw new Error(`catatPemakaman refused: ${dicatat.reason}`);
  return { ...fixture, blokId: blok.id, petakId, hakPakaiId };
}

async function statusPetak(setup: InventorySetup, f: Awaited<ReturnType<typeof petakTerisi>>) {
  const blok = await setup.inventory.asStaff(f.adminLokasi).blok(f.lokasiMitra.id, f.blokId);
  return blok!.cells.find((cell) => cell.id === f.petakId)!.status;
}
async function statusHak(setup: InventorySetup, f: Awaited<ReturnType<typeof petakTerisi>>) {
  return (await setup.inventory.asStaff(f.adminLokasi).hakPakaiOfPetak(f.lokasiMitra.id, f.petakId))!.status;
}

describe("a fixed-term Hak Pakai reaching its end date", () => {
  it("becomes Kedaluwarsa the day after the end date, and the Petak shows Masa Berlaku Habis", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);

    setup.clock.set(wib("2026-10-05 23:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    expect(await statusHak(setup, f)).toBe("aktif");
    expect(await statusPetak(setup, f)).toBe("terisi");

    setup.clock.set(wib("2026-10-06 00:05"));
    expect(await setup.inventory.kedaluwarsaTick(setup.clock.now())).toEqual({ kedaluwarsa: 1 });
    expect(await statusHak(setup, f)).toBe("kedaluwarsa");
    expect(await statusPetak(setup, f)).toBe("masa_berlaku_habis");
    // Idempotent: a second run moves nothing.
    expect(await setup.inventory.kedaluwarsaTick(setup.clock.now())).toEqual({ kedaluwarsa: 0 });
  });

  it("never expires a Selamanya Hak Pakai", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin, { kind: "selamanya" });
    setup.clock.set(wib("2040-01-01 09:00"));
    expect(await setup.inventory.kedaluwarsaTick(setup.clock.now())).toEqual({ kedaluwarsa: 0 });
    expect(await statusHak(setup, f)).toBe("aktif");
  });
});

describe("Hak Pakai in masa tenggang", () => {
  it("is listed for the Admin Lokasi from Kedaluwarsa on, and says it is not yet past its Masa Tenggang (3 months by default)", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);

    setup.clock.set(wib("2026-10-05 12:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([]);

    setup.clock.set(wib("2026-10-06 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([
      { hakPakaiId: f.hakPakaiId, label: expect.stringContaining("Petak"), endDate: "2026-10-05", masaTenggangBerakhir: "2027-01-05", lewatMasaTenggang: false },
    ]);

    // The last day of the Masa Tenggang still counts as inside it.
    setup.clock.set(wib("2027-01-05 20:00"));
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([expect.objectContaining({ hakPakaiId: f.hakPakaiId, lewatMasaTenggang: false })]);
  });

  it("stays after the Masa Tenggang ends, marked as past it, until the Admin Lokasi acts (owner decision 2026-10-02)", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    setup.clock.set(wib("2026-10-06 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());

    setup.clock.set(wib("2027-01-06 08:00"));
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([
      { hakPakaiId: f.hakPakaiId, label: expect.stringContaining("Petak"), endDate: "2026-10-05", masaTenggangBerakhir: "2027-01-05", lewatMasaTenggang: true },
    ]);
    // Time alone never takes it away: a year on it is still there, and still Kedaluwarsa.
    setup.clock.set(wib("2028-01-06 08:00"));
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([expect.objectContaining({ hakPakaiId: f.hakPakaiId, lewatMasaTenggang: true })]);
    expect(await statusHak(setup, f)).toBe("kedaluwarsa");
  });

  it("closes when the Admin Lokasi ends a Hak Pakai that is already past its Masa Tenggang", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    setup.clock.set(wib("2026-10-06 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    setup.clock.set(wib("2027-03-01 09:00"));
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toHaveLength(1);

    const hasil = await setup.inventory.akhiriHakPakaiManual(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "Masa tenggang lewat, keluarga tidak menjawab" });
    expect(hasil).toEqual({ ok: true });
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([]);
  });

  it("closes when the Hak Pakai is ended", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    setup.clock.set(wib("2026-10-20 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toHaveLength(1);

    await setup.inventory.akhiriHakPakaiManual(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "Keluarga tidak menjawab" });
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([]);
  });

  it("closes when a Perpanjangan makes the Hak Pakai Aktif again", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    setup.clock.set(wib("2026-10-20 09:00"));
    await setup.inventory.kedaluwarsaTick(setup.clock.now());
    await setup.inventory.perpanjangHakPakai({ hakPakaiId: f.hakPakaiId, terms: 1 });
    expect(await setup.inventory.hakPakaiMasaTenggang(f.lokasiMitra.id)).toEqual([]);
    expect(await statusHak(setup, f)).toBe("aktif");
  });
});

describe("ending a Hak Pakai by hand", () => {
  it("is final, keeps the plot Terisi until a Pembongkaran is recorded, then makes it Tersedia again, all audited", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);

    expect(await setup.inventory.akhiriHakPakaiManual(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "Pemegang Hak meninggal, tidak ada ahli waris" })).toEqual({ ok: true });
    expect(await statusHak(setup, f)).toBe("berakhir");
    expect(await statusPetak(setup, f)).toBe("terisi");
    expect(await setup.inventory.akhiriHakPakaiManual(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "lagi" })).toEqual({ ok: false, reason: "hak_pakai_sudah_berakhir" });
    const tersedia = async () => (await setup.inventory.asStaff(f.adminLokasi).availability(f.lokasiMitra.id)).reduce((n, one) => n + one.count, 0);
    const sebelum = await tersedia();

    expect(await setup.inventory.catatPembongkaran(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId })).toEqual({ ok: true });
    expect(await statusPetak(setup, f)).toBe("tersedia");
    expect(await tersedia()).toBe(sebelum + 1);
    expect(await setup.inventory.catatPembongkaran(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId })).toEqual({ ok: false, reason: "sudah_dibongkar" });

    const entri = await setup.audit.entriesAbout({ kind: "hak_pakai", id: f.hakPakaiId });
    expect(entri.map((one) => one.action)).toEqual(expect.arrayContaining(["hak_pakai.akhiri", "hak_pakai.catat_pembongkaran"]));
  });

  it("refuses a Pembongkaran for a Hak Pakai that has not ended", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    expect(await setup.inventory.catatPembongkaran(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId })).toEqual({ ok: false, reason: "hak_pakai_belum_berakhir" });
    expect(await statusPetak(setup, f)).toBe("terisi");
  });

  it("needs a reason, and belongs to that Lokasi's own Admin Lokasi only", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    const lain = await petakTerisi(setup, admin);
    expect(await setup.inventory.akhiriHakPakaiManual(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "  " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.inventory.akhiriHakPakaiManual(lain.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "x" })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.inventory.akhiriHakPakaiManual(admin, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "x" })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.inventory.catatPembongkaran(lain.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await statusHak(setup, f)).toBe("aktif");
  });
});

describe("marking a Petak Tidak Tersedia", () => {
  it("is refused while the Petak has an active Hak Pakai (even an ended one still Terisi) and allowed after the Pembongkaran", async () => {
    const setup = inventoryOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const f = await petakTerisi(setup, admin);
    const tandai = () => setup.inventory.clearPetak(f.adminLokasi, f.lokasiMitra.id, f.petakId, { mode: "tidak_tersedia", reason: "Longsor" });

    expect(await tandai()).toEqual({ ok: false, reason: "sudah_ada_hak_pakai" });
    await setup.inventory.akhiriHakPakaiManual(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId, alasan: "Dikembalikan" });
    expect(await tandai()).toEqual({ ok: false, reason: "sudah_ada_hak_pakai" });

    await setup.inventory.catatPembongkaran(f.adminLokasi, f.lokasiMitra.id, { hakPakaiId: f.hakPakaiId });
    expect(await tandai()).toMatchObject({ ok: true });
    expect(await statusPetak(setup, f)).toBe("tidak_tersedia");
  });
});
