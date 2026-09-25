import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { authorize, auditLogLokasiResource, auditLogResource } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the Audit Log of a Lokasi Mitra, for its Admin Lokasi", () => {
  it("shows Admin Platform's changes to its record, status and bank account (the account number masked to its last 4 digits) and to its Admin Lokasi, and nothing of another Lokasi", async () => {
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
      after: { bankAccount: { bankName: "BSI", accountNumber: "****6789", accountHolder: "Yayasan Al-Ikhlas" } },
      reason: "Data perjanjian",
    });
    expect(log.entries.every((entry) => entry.lokasiId === own.id)).toBe(true);
  });

  it("shows the agreement upload with its signing date but never the scan's file key", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const scan = { body: new TextEncoder().encode("%PDF-1.7\n%%EOF\n"), contentType: "application/pdf" };
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan, signedOn: "2026-09-20" });
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan, signedOn: "2026-09-21" });
    const fileKeys = [...setup.files.stored.keys()];
    expect(fileKeys).toHaveLength(2);

    const log = await setup.lokasi.auditLog(adminLokasi, lokasiMitra.id);

    if (!log.ok) throw new Error(log.reason);
    const uploads = log.entries.filter((entry) => entry.action === "lokasi.unggah_perjanjian");
    expect(uploads.map((entry) => [entry.before, entry.after])).toEqual([
      [{ agreement: { signedOn: null } }, { agreement: { signedOn: "2026-09-20" } }],
      [{ agreement: { signedOn: "2026-09-20" } }, { agreement: { signedOn: "2026-09-21" } }],
    ]);
    for (const key of fileKeys) expect(JSON.stringify(log.entries)).not.toContain(key);
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

describe("the Audit Log of a Lokasi Mitra, for Admin Platform", () => {
  it("is unfiltered: Catatan Internal and Antrean claims, the whole bank account number and the scan's file key are all there", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const bankAccount = { bankName: "BSI", accountNumber: "7123456789", accountHolder: "Yayasan Al-Ikhlas" };
    await setup.lokasi.changeBankAccount(admin, lokasiMitra.id, { ...bankAccount, reason: null });
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, {
      scan: { body: new TextEncoder().encode("%PDF-1.7\n%%EOF\n"), contentType: "application/pdf" },
      signedOn: "2026-09-20",
    });
    const [fileKey] = setup.files.stored.keys();
    // Tickets 17 and 23 record these; written here through the Audit Log directly.
    for (const action of ["catatan_internal.tulis", "antrean.ambil"] as const) {
      await setup.audit.staffWrite(db, async (_tx, record) => {
        await record({
          actor: { accountId: admin.accountId, role: "admin_platform" },
          action,
          entity: { kind: "pemesanan", id: "pemesanan-1" },
          lokasiId: lokasiMitra.id,
          before: null,
          after: { catatan: action },
          reason: null,
        });
        return { ok: true };
      });
    }

    const full = await setup.lokasi.fullAuditLog(admin, lokasiMitra.id);
    const asAdminLokasi = await setup.lokasi.auditLog(adminLokasi, lokasiMitra.id);

    if (!full.ok || !asAdminLokasi.ok) throw new Error("refused");
    expect(full.entries.map((entry) => entry.action)).toEqual([
      "lokasi.buat",
      "staf.undang",
      "staf.peran_diberikan",
      "lokasi.ubah_rekening",
      "lokasi.unggah_perjanjian",
      "catatan_internal.tulis",
      "antrean.ambil",
    ]);
    expect(full.entries[3]).toMatchObject({ after: { bankAccount } });
    expect(full.entries[4]).toMatchObject({ after: { agreement: { signedOn: "2026-09-20", scanFileKey: fileKey } } });
    expect(asAdminLokasi.entries.map((entry) => entry.action)).toEqual(full.entries.slice(0, 5).map((entry) => entry.action));
    expect(full.entries.every((entry) => entry.lokasiId === lokasiMitra.id)).toBe(true);
    expect(await setup.lokasi.fullAuditLog(admin, other.id)).toMatchObject({ ok: true, entries: [{ action: "lokasi.buat" }] });
  });

  it("is refused to an Admin Lokasi, even of that Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.lokasi.fullAuditLog(adminLokasi, lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});
