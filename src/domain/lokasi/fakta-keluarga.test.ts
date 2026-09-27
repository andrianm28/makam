/**
 * The two no-actor reads a family-facing screen takes from a Lokasi Mitra: its
 * document checklist and its own Saat Duka payment window (spec, Pemesanan; AC 1
 * makes the deadline per-Lokasi, so the copy that names it must be able to).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { newLokasiMitra, signedInAdminPlatform, lokasiOnTestDatabase } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the facts a family screen reads from a Lokasi Mitra", () => {
  it("gives each Lokasi its own Saat Duka payment window, and nothing for a Lokasi that is not there", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const pendek = await newLokasiMitra(setup, admin, "Makam Pendek");
    const panjang = await newLokasiMitra(setup, admin, "Makam Panjang");

    // The default is 72 h (3×24), which is what a new Lokasi Mitra starts with.
    expect(await setup.lokasi.saatDukaPaymentWindowHours(pendek.id)).toBe(72);

    const baca = await setup.lokasi.lokasiMitra(admin, panjang.id);
    if (!baca.ok) throw new Error(`Lokasi Mitra refused: ${baca.reason}`);
    const diubah = await setup.lokasi.setPoliciesAndFlags(admin, panjang.id, {
      policies: { ...baca.lokasiMitra.policies, saatDukaPaymentWindowHours: 24 },
      flags: baca.lokasiMitra.flags,
    });
    if (!diubah.ok) throw new Error(`policies refused: ${diubah.reason}`);

    expect(await setup.lokasi.saatDukaPaymentWindowHours(panjang.id)).toBe(24);
    expect(await setup.lokasi.saatDukaPaymentWindowHours(pendek.id)).toBe(72);
    expect(await setup.lokasi.saatDukaPaymentWindowHours("5d1f4c2e-0000-4000-8000-000000009999")).toBeNull();
  });

  it("gives each Lokasi its own document checklist, and an empty one where there is no Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin, "Makam Dokumen");

    const checklist = await setup.lokasi.documentChecklistOf(lokasi.id);
    expect(checklist.length).toBeGreaterThan(0);

    await setup.lokasi.setDocumentChecklist(admin, lokasi.id, { documentChecklist: ["KTP", "Surat Kelahiran"] });
    expect(await setup.lokasi.documentChecklistOf(lokasi.id)).toEqual(["KTP", "Surat Kelahiran"]);
    expect(await setup.lokasi.documentChecklistOf("5d1f4c2e-0000-4000-8000-000000009999")).toEqual([]);
  });
});
