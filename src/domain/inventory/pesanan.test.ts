/**
 * Assigning a Petak Makam to a confirmed order (spec, Pemesanan > Saat Duka:
 * "Confirm = assign a cleared Tersedia Petak of the chosen Jenis Makam → Hak
 * Pakai Aktif"; ticket 23). The Hak Pakai and the Petak are the Inventory
 * module's own, so its public interface is what a confirm goes through.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, inventoryOnTestDatabase, jenisMakamInput, newBlok } from "../../../tests/support/inventory";
import { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/tariffs";
import type { Actor } from "@/domain/identity";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

type Setup = ReturnType<typeof inventoryOnTestDatabase>;

/** A Lokasi Mitra with its own Admin Lokasi, one Jenis Makam and a Blok of cleared Tersedia Petak of it. */
async function lokasiDenganPetakTersedia(setup: Setup, admin: Actor, nama: string) {
  const lokasiMitra = await newLokasiMitra(setup, admin, nama);
  const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id], );
  const jenis = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, jenisMakamInput("Reguler 1 × 2 m"));
  if (!jenis.ok) throw new Error(`Jenis Makam refused: ${jenis.reason}`);
  const jenisMakam = jenis.jenisMakam;
  const blok = await newBlok(setup, { admin, adminLokasi, lokasiMitra, jenisMakam } as never);
  const cells = (await cellsOf(setup, adminLokasi, lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  for (const cell of cells) {
    const cleared = await setup.inventory.clearPetak(adminLokasi, lokasiMitra.id, cell.id, { mode: "tersedia" });
    if (!cleared.ok) throw new Error(`clearPetak refused: ${cleared.reason}`);
  }
  return { admin, adminLokasi, lokasiMitra, jenisMakam, blok, cells };
}

/** The first such Lokasi Mitra, the one Admin Platform seeded for this run. */
async function setupDenganLokasi(setup: Setup, nama = "Makam Wakaf Al-Ikhlas") {
  const { actor: admin } = await signedInAdminPlatform(setup);
  return lokasiDenganPetakTersedia(setup, admin, nama);
}

/** The holder as an order carries it: canonical E.164, a contact only. */
const pemegangHak = { name: "Budi Santoso", phoneNumber: "+6281234567890", email: "pemesan@contoh.id" };

describe("assigning a cleared Tersedia Petak of the chosen Jenis Makam to an order", () => {
  it("grants an Aktif Hak Pakai for the Pemegang Hak and takes the Petak out of the Tersedia count", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await setupDenganLokasi(setup);
    const petakId = fixture.cells[0]!.id;
    const sebelum = await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id);

    const diberikan = await setup.inventory.beriHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
      petakId,
      jenisMakamId: fixture.jenisMakam.id,
      pemegangHak,
    });

    expect(diberikan).toEqual({ ok: true, hakPakaiId: expect.any(String), nomor: "A-01" });
    const hakPakai = await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, petakId);
    expect(hakPakai).toMatchObject({
      status: "aktif",
      petakId,
      pemakaman: [],
      pemegangHak: { name: "Budi Santoso", phoneNumber: "+6281234567890", email: "pemesan@contoh.id" },
    });
    // The tenure is the Jenis Makam's own; its clock starts at the first Pemakaman (ticket 25), so neither is set yet.
    expect(hakPakai?.tenureYears).toBe(5);
    expect(hakPakai?.tenureStartAt).toBeNull();
    expect(hakPakai?.endDate).toBeNull();
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual(
      sebelum.map((row) => ({ ...row, count: row.count - 1 })),
    );
    // The write is audited on the Lokasi, like every other Denah write.
    const entries = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    expect(entries.at(-1)).toMatchObject({
      action: "denah.pakai_petak",
      entity: { kind: "hak_pakai", id: diberikan.ok ? diberikan.hakPakaiId : "" },
      after: { petakId, status: "terisi", pemegangHak: "Budi Santoso" },
    });
  });

  it("refuses a Petak of another Jenis Makam, one still Perlu Verifikasi and one another Lokasi's", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await setupDenganLokasi(setup);
    const lain = await setup.tariffs.createJenisMakam(fixture.admin, fixture.lokasiMitra.id, {
      ...jenisMakamInput("Khusus 1 × 1 m"),
      tariff: { hargaHakPakai: 9_000_000, tenure: { kind: "tahun" as const, years: 10 }, hargaPerpanjangan: 4_000_000, effectiveOn: "2026-10-01" },
    });
    if (!lain.ok) throw new Error(`Jenis Makam refused: ${lain.reason}`);

    // The order chose "Khusus", so the Petak of "Reguler" is not its plot.
    expect(
      await setup.inventory.beriHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
        petakId: fixture.cells[0]!.id,
        jenisMakamId: lain.jenisMakam.id,
        pemegangHak,
      }),
    ).toEqual({ ok: false, reason: "jenis_makam_beda" });

    // A newly drawn Petak, never cleared.
    const belum = await newBlok(setup, fixture, { name: "B", rows: 1, cols: 1 });
    const cellBelum = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, belum.id))[0]!;
    expect(
      await setup.inventory.beriHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
        petakId: cellBelum.id,
        jenisMakamId: fixture.jenisMakam.id,
        pemegangHak,
      }),
    ).toEqual({ ok: false, reason: "petak_belum_tersedia" });

    // A Petak this Lokasi Mitra does not have, and a Lokasi Mitra whose orders this Admin Lokasi may not confirm.
    const petakLain = "9f0ff812-a323-49c3-a434-33b1bb2e3fff";
    expect(
      await setup.inventory.beriHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
        petakId: petakLain,
        jenisMakamId: fixture.jenisMakam.id,
        pemegangHak,
      }),
    ).toEqual({ ok: false, reason: "petak_tidak_ditemukan" });
    expect(
      await setup.inventory.beriHakPakai(fixture.adminLokasi, "5d1f4c2e-0000-4000-8000-000000009999", {
        petakId: fixture.cells[0]!.id,
        jenisMakamId: fixture.jenisMakam.id,
        pemegangHak,
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("refuses a Petak that already has a Hak Pakai, and one Admin Platform tries to grant", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await setupDenganLokasi(setup);
    const petakId = fixture.cells[0]!.id;
    const pertama = await setup.inventory.beriHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
      petakId,
      jenisMakamId: fixture.jenisMakam.id,
      pemegangHak,
    });
    expect(pertama.ok).toBe(true);

    expect(
      await setup.inventory.beriHakPakai(fixture.adminLokasi, fixture.lokasiMitra.id, {
        petakId,
        jenisMakamId: fixture.jenisMakam.id,
        pemegangHak,
      }),
    ).toEqual({ ok: false, reason: "petak_belum_tersedia" });

    // Admin Platform's wider access does not make it this Lokasi's Admin Lokasi.
    expect(
      await setup.inventory.beriHakPakai(fixture.admin, fixture.lokasiMitra.id, {
        petakId: fixture.cells[1]!.id,
        jenisMakamId: fixture.jenisMakam.id,
        pemegangHak,
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("offers only the cleared Tersedia Petak of one Jenis Makam, by Nomor Makam and Blok", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await setupDenganLokasi(setup);
    // A second Blok of the same Jenis Makam, one of its Petak marked Tidak Tersedia.
    const kedua = await newBlok(setup, fixture, { name: "B", rows: 1, cols: 2 });
    const cellsKedua = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, kedua.id);
    for (const cell of cellsKedua.filter((one) => one.kind === "petak")) {
      await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    }
    const tidakTersedia = cellsKedua[0]!.id;
    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, tidakTersedia, {
      mode: "tidak_tersedia",
      reason: "Pondasi rusak",
    });

    const unit = await setup.inventory.tersediaUntukJenisMakam(fixture.lokasiMitra.id, fixture.jenisMakam.id);

    // Blok A's twelve cleared Petak and Blok B's one that is not marked Tidak Tersedia.
    expect(unit).toHaveLength(13);
    expect(unit.map((one) => one.nomor).slice(0, 2)).toEqual(["A-01", "A-02"]);
    expect(unit.map((one) => one.nomor)).not.toContain("B-01");
    expect(unit.every((one) => one.petakId !== tidakTersedia)).toBe(true);
    expect(unit.find((one) => one.nomor === "B-02")).toMatchObject({ blok: "B" });
  });
});
