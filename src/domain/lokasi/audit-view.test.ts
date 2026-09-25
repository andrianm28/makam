import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authorize, auditLogLokasiResource, auditLogResource } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Audit Log of a Lokasi Mitra, for its Admin Lokasi", () => {
  it("shows Admin Platform's changes to its record, status and bank account and to its Admin Lokasi, and nothing of another Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);
    const bankAccount = { bankName: "BSI", accountNumber: "7123456789", accountHolder: "Yayasan Al-Ikhlas" };
    await setup.lokasi.changeBankAccount(admin, own.id, { ...bankAccount, reason: "Data perjanjian" });
    await setup.lokasi.changeBankAccount(admin, other.id, { ...bankAccount, reason: "Lokasi lain" });
    await setup.lokasi.setDocumentChecklist(admin, own.id, { documentChecklist: ["KTP Pemesan"] });

    const log = await setup.lokasi.auditLog(adminLokasi, own.id);

    expect(log.ok).toBe(true);
    if (!log.ok) return;
    expect(log.entries.map((entry) => entry.action)).toEqual([
      "lokasi.buat",
      "staf.undang",
      "staf.peran_diberikan",
      "lokasi.ubah_rekening",
      "lokasi.ubah_dokumen",
    ]);
    expect(log.entries[0]).toMatchObject({ actor: { role: "admin_platform" }, after: { status: "belum_tayang" } });
    expect(log.entries[3]).toMatchObject({
      actor: { accountId: admin.accountId, role: "admin_platform" },
      before: { bankAccount: null },
      after: { bankAccount },
      reason: "Data perjanjian",
    });
    expect(log.entries.every((entry) => entry.lokasiId === own.id)).toBe(true);
  });

  it("is refused for a Lokasi the Admin Lokasi is not Admin Lokasi of; Admin Platform reads any Lokasi's", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);

    expect(await setup.lokasi.auditLog(adminLokasi, other.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.auditLog(admin, other.id)).toMatchObject({ ok: true, entries: [{ action: "lokasi.buat" }] });
  });

  it("an Admin Lokasi reads its own Lokasi's Audit Log, never the whole Audit Log; Mitra Jasa and Petugas Lapangan read neither", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);
    const others = [
      { ...adminLokasi, roles: ["pemesan" as const, "mitra_jasa" as const] },
      { ...adminLokasi, roles: ["pemesan" as const, "petugas_lapangan" as const] },
    ];

    expect(authorize(adminLokasi, "audit.lihat", auditLogLokasiResource(own.id))).toEqual({ allowed: true });
    expect(authorize(adminLokasi, "audit.lihat", auditLogResource())).toEqual({ allowed: false, reason: "tidak_berwenang" });
    for (const actor of others) {
      expect(authorize(actor, "audit.lihat", auditLogLokasiResource(own.id))).toEqual({
        allowed: false,
        reason: "tidak_berwenang",
      });
    }
  });
});
