import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  tariffsOnTestDatabase,
} from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Audit Log of a Lokasi Mitra, for its Admin Lokasi (story 137)", () => {
  it("shows Admin Platform's tariff changes there (Jenis Makam, their versions, the Biaya Pemakaman) with before and after, and none of another Lokasi's", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);
    const tariff = { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" } as const;
    const created = await setup.tariffs.createJenisMakam(admin, own.id, { name: "Reguler", description: "", tariff, reason: null });
    if (!created.ok) throw new Error(created.reason);
    await setup.tariffs.setJenisMakamTariff(admin, created.jenisMakam.id, {
      ...tariff,
      hargaHakPakai: 8_000_000,
      effectiveOn: "2027-01-01",
      reason: "Tarif 2027",
    });
    await setup.tariffs.setBiayaPemakaman(admin, own.id, {
      biayaPemakaman: 2_000_000,
      biayaPemakamanTumpang: null,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    await setup.tariffs.setBiayaPemakaman(admin, other.id, {
      biayaPemakaman: 9_000_000,
      biayaPemakamanTumpang: null,
      effectiveOn: "2026-10-01",
      reason: null,
    });

    const log = await setup.lokasi.auditLog(adminLokasi, own.id);

    if (!log.ok) throw new Error(log.reason);
    const tariffEntries = log.entries.filter((entry) => entry.action.startsWith("tarif."));
    expect(tariffEntries).toEqual([
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "tarif.buat_jenis_makam",
        entity: { kind: "jenis_makam", id: created.jenisMakam.id },
        before: null,
        after: { name: "Reguler", description: "", hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
      }),
      expect.objectContaining({
        action: "tarif.ubah_jenis_makam",
        before: expect.objectContaining({ name: "Reguler", hargaHakPakai: 7_500_000, effectiveOn: "2026-10-01" }),
        after: expect.objectContaining({ name: "Reguler", hargaHakPakai: 8_000_000, effectiveOn: "2027-01-01" }),
        reason: "Tarif 2027",
      }),
      expect.objectContaining({
        action: "tarif.ubah_biaya_pemakaman",
        before: null,
        after: { biayaPemakaman: 2_000_000, biayaPemakamanTumpang: null, effectiveOn: "2026-10-01" },
      }),
    ]);
  });
});
