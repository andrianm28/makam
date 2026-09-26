import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isPortConfigured, notConfigured } from "@/adapters/live/not-configured";
import { createInventory } from "@/domain/inventory";
import type { FileStore } from "@/ports/file-store";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { denahFixture, inventoryOnTestDatabase, newBlok } from "../../../tests/support/inventory";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A minimal valid JPEG (first bytes only matter to `documentExtension`). */
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

describe("a Blok's site-plan photo", () => {
  it("can be uploaded and then viewed by a short-lived signed URL", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);

    const uploaded = await setup.inventory.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      body: jpegBytes,
      contentType: "image/jpeg",
    });
    expect(uploaded).toEqual({ ok: true });

    const url = await setup.inventory.asStaff(fixture.adminLokasi).photoUrl(fixture.lokasiMitra.id, blok.id);
    expect(url).toEqual(expect.stringContaining("https://files.fake.local/"));
    const opened = setup.files.open(url!);
    expect(opened?.contentType).toBe("image/jpeg");
    expect([...opened!.body]).toEqual([...jpegBytes]);
  });

  it("replacing a photo removes the previous one from the FileStore", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    await setup.inventory.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { body: jpegBytes, contentType: "image/jpeg" });
    const firstUrl = (await setup.inventory.asStaff(fixture.adminLokasi).photoUrl(fixture.lokasiMitra.id, blok.id))!;

    await setup.inventory.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { body: jpegBytes, contentType: "image/jpeg" });

    expect(setup.files.open(firstUrl)).toBeNull();
  });

  it("no photo yet reads back as null, not an error", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    expect(await setup.inventory.asStaff(fixture.adminLokasi).photoUrl(fixture.lokasiMitra.id, blok.id)).toBeNull();
  });

  it("an empty or unrecognised file is refused", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);

    expect(
      await setup.inventory.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { body: new Uint8Array(), contentType: "image/jpeg" }),
    ).toEqual({ ok: false, reason: "berkas_wajib" });
    expect(
      await setup.inventory.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
        body: new Uint8Array([1, 2, 3]),
        contentType: "application/pdf",
      }),
    ).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
  });

  it("is refused for someone who is not this Lokasi Mitra's Admin Lokasi", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);

    const refused = await setup.inventory.uploadBlokPhoto(fixture.admin, fixture.lokasiMitra.id, blok.id, { body: jpegBytes, contentType: "image/jpeg" });
    expect(refused).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("every upload is audited", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    await setup.inventory.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, { body: jpegBytes, contentType: "image/jpeg" });

    const actions = (await setup.audit.entriesForLokasi(fixture.lokasiMitra.id)).map((entry) => entry.action);
    expect(actions).toContain("denah.unggah_foto_blok");
  });

  it("while no FileStore is configured (staging, before ticket 60), the upload is refused rather than silently faked", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const filesDown = notConfigured<FileStore>("FileStore (S3)");
    expect(isPortConfigured(setup.files)).toBe(true);
    expect(isPortConfigured(filesDown)).toBe(false);

    const inventoryWithoutFiles = createInventory({ db, clock: setup.clock, audit: setup.audit, files: filesDown, tariffs: setup.tariffs });
    const refused = await inventoryWithoutFiles.uploadBlokPhoto(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      body: jpegBytes,
      contentType: "image/jpeg",
    });
    expect(refused).toEqual({ ok: false, reason: "penyimpanan_belum_tersedia" });
  });
});
