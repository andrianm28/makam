import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeFileStore } from "@/adapters/memory";
import type { FileStore } from "@/ports/file-store";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { logInByOtp } from "../../../tests/support/identity";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PDF = new TextEncoder().encode("%PDF-1.7\nperjanjian kerja sama\n%%EOF\n");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("the agreement scan of a Lokasi Mitra", () => {
  it("Admin Platform uploads it with the signing date: the stored scan opens through its signed link, and the upload is audited without the file", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const uploaded = await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, {
      scan: { body: PDF, contentType: "application/pdf" },
      signedOn: "2026-09-20",
    });

    expect(uploaded).toEqual({ ok: true });
    const link = await setup.lokasi.agreementScanUrl(admin, lokasiMitra.id);
    if (!link.ok) throw new Error(`no signed link: ${link.reason}`);
    expect(setup.files.open(link.url)).toMatchObject({ body: PDF, contentType: "application/pdf" });
    expect(await setup.lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({
      lokasiMitra: { agreement: { signedOn: "2026-09-20", scanUploaded: true } },
    });
    const entry = (await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasiMitra.id })).at(-1);
    expect(entry).toMatchObject({
      action: "lokasi.unggah_perjanjian",
      before: { agreement: { signedOn: null } },
      after: { agreement: { signedOn: "2026-09-20" } },
    });
    expect(JSON.stringify(entry)).not.toContain("perjanjian kerja sama");
  });

  it("opens through a signed link that expires 5 minutes later on the Clock; a replaced scan opens the new file", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    expect(await setup.lokasi.agreementScanUrl(admin, lokasiMitra.id)).toEqual({ ok: false, reason: "belum_ada_berkas" });
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan: { body: PDF, contentType: "application/pdf" }, signedOn: "2026-09-20" });
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan: { body: JPEG, contentType: "image/jpeg" }, signedOn: "2026-09-21" });
    const mintedAt = setup.clock.now();

    const link = await setup.lokasi.agreementScanUrl(admin, lokasiMitra.id);

    if (!link.ok) throw new Error(`no signed link: ${link.reason}`);
    expect(link.expiresAt).toEqual(new Date(mintedAt.getTime() + 5 * 60_000));
    setup.clock.advance({ minutes: 5 });
    expect(setup.files.open(link.url)).toMatchObject({ body: JPEG, contentType: "image/jpeg" });
    setup.clock.advance({ seconds: 1 });
    expect(setup.files.open(link.url)).toBeNull();
  });

  it("is Admin Platform only: an Admin Lokasi, even of that Lokasi, and a Pemesan cannot get its signed link", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.lokasi.uploadAgreement(admin, lokasiMitra.id, { scan: { body: PDF, contentType: "application/pdf" }, signedOn: "2026-09-20" });
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, "085555555555");
    const pemesan = await setup.identity.actorFromCookies(cookies);
    if (!pemesan) throw new Error("not signed in");

    expect(await setup.lokasi.agreementScanUrl(adminLokasi, lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.agreementScanUrl(pemesan, lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.lokasiMitra(adminLokasi, lokasiMitra.id)).toMatchObject({
      lokasiMitra: { agreement: { signedOn: "2026-09-20", scanUploaded: true } },
    });
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
