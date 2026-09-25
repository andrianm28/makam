import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeFileStore } from "@/adapters/memory";
import type { FileStore } from "@/ports/file-store";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PDF = new TextEncoder().encode("%PDF-1.7\nperjanjian kerja sama\n%%EOF\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("the agreement scan of a Lokasi Mitra", () => {
  it("Admin Platform uploads it with the signing date: it is kept in the FileStore, and the upload is audited without the file", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const uploaded = await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, {
      scan: { body: PDF, contentType: "application/pdf" },
      signedOn: "2026-09-20",
    });

    expect(uploaded).toEqual({ ok: true });
    const stored = [...setup.files.stored.values()];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ contentType: "application/pdf", body: PDF });
    expect(stored[0].key).toMatch(new RegExp(`^perjanjian/${lokasiMitra.id}/[0-9a-f-]{36}\\.pdf$`));
    expect(await setup.lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({
      lokasiMitra: { agreement: { signedOn: "2026-09-20", scanUploaded: true } },
    });
    expect((await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasiMitra.id })).at(-1)).toMatchObject({
      action: "lokasi.unggah_perjanjian",
      before: { agreement: { signedOn: null, scanFileKey: null } },
      after: { agreement: { signedOn: "2026-09-20", scanFileKey: stored[0].key } },
    });
  });

  it("is viewed only through a signed URL that expires after 5 minutes, by Admin Platform or the Lokasi's own Admin Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    expect(await setup.lokasi.agreementScanUrl(admin, lokasiMitra.id)).toEqual({ ok: false, reason: "belum_ada_berkas" });
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan: { body: JPEG, contentType: "image/jpeg" }, signedOn: "2026-09-20" });
    await setup.lokasi.uploadAgreement(admin, other.id, { scan: { body: PDF, contentType: "application/pdf" }, signedOn: "2026-09-21" });
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const now = setup.clock.now();

    const forAdmin = await setup.lokasi.agreementScanUrl(admin, lokasiMitra.id);
    const forAdminLokasi = await setup.lokasi.agreementScanUrl(adminLokasi, lokasiMitra.id);

    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    const [key] = [...setup.files.stored.keys()].filter((stored) => stored.startsWith(`perjanjian/${lokasiMitra.id}/`));
    expect(forAdmin).toEqual({ ok: true, url: await setup.files.signedUrl(key, { expiresInSeconds: 300 }), expiresAt });
    expect(forAdminLokasi).toEqual(forAdmin);
    expect(await setup.lokasi.agreementScanUrl(adminLokasi, other.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("must be a PDF, JPG or PNG whose bytes match its type, at most 10 MB, with a signing date", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    for (const input of [
      { scan: { body: new Uint8Array(), contentType: "application/pdf" }, signedOn: "2026-09-20" },
      { scan: { body: JPEG, contentType: "application/pdf" }, signedOn: "2026-09-20" },
      { scan: { body: PDF, contentType: "text/plain" }, signedOn: "2026-09-20" },
      { scan: { body: new Uint8Array(10 * 1024 * 1024 + 1).fill(0x25), contentType: "application/pdf" }, signedOn: "2026-09-20" },
    ]) {
      expect(await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, input)).toEqual({
        ok: false,
        reason: "berkas_tidak_didukung",
      });
    }
    expect(
      await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan: { body: PDF, contentType: "application/pdf" }, signedOn: "20-09-2026" }),
    ).toEqual({ ok: false, reason: "tanggal_tidak_valid" });
    expect(setup.files.stored.size).toBe(0);
  });

  it("is not recorded when the FileStore does not take the file (no live S3 yet): nothing changes and nothing is audited", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const failing: FileStore = Object.assign(new FakeFileStore({ clock: setup.clock }), {
      put: async () => {
        throw new Error("FileStore (S3) not configured");
      },
    });
    const { createLokasi } = await import("@/domain/lokasi");
    const lokasi = createLokasi({ db, clock: setup.clock, files: failing, audit: setup.audit, identity: setup.identity });
    const entriesBefore = await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasiMitra.id });

    expect(
      await lokasi.uploadAgreement(admin, lokasiMitra.id, { scan: { body: PDF, contentType: "application/pdf" }, signedOn: "2026-09-20" }),
    ).toEqual({ ok: false, reason: "berkas_gagal_disimpan" });

    expect(await lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({
      lokasiMitra: { agreement: { signedOn: null, scanUploaded: false } },
    });
    expect(await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasiMitra.id })).toEqual(entriesBefore);
  });
});
