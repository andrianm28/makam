import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  lokasiOnTestDatabase,
  newLokasiMitra,
  setLokasiMitraStatusForTest,
  signedInAdminLokasi,
  signedInAdminPlatform,
} from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
const foto = (keterangan = "Gerbang utama") => ({
  foto: { body: JPEG, contentType: "image/jpeg" },
  kategori: "gerbang" as const,
  keterangan,
  tanpaMakam: true,
});

describe("the Galeri Lokasi", () => {
  it("Admin Platform adds a facility photo: the public page of a Terverifikasi Lokasi Mitra shows it with its caption, and the upload is audited without the file", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);

    const added = await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto("  Gerbang   utama "));
    expect(added).toMatchObject({ ok: true });
    // Not listed yet: the public read shows nothing.
    expect(await setup.lokasi.publicFotoGaleri(lokasi.id)).toEqual([]);

    await setLokasiMitraStatusForTest(db, lokasi.id, "terverifikasi");
    const publik = await setup.lokasi.publicFotoGaleri(lokasi.id);
    expect(publik).toEqual([expect.objectContaining({ kategori: "gerbang", keterangan: "Gerbang utama" })]);
    expect(setup.files.open(publik[0].url!)).toMatchObject({ body: JPEG, contentType: "image/jpeg" });
    const entry = (await setup.audit.entriesAbout({ kind: "lokasi_mitra", id: lokasi.id })).at(-1);
    expect(entry).toMatchObject({ action: "lokasi.tambah_foto_galeri", after: { kategori: "gerbang", tanpaMakam: true } });
    expect(JSON.stringify(entry)).not.toContain("255,216");
  });

  it("shows the Galeri Lokasi of a Lokasi Mitra listed without verification too, though not of one still Belum Tayang", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto());

    expect(await setup.lokasi.publicFotoGaleri(lokasi.id)).toEqual([]);
    await setLokasiMitraStatusForTest(db, lokasi.id, "tayang_belum_terverifikasi");

    expect(await setup.lokasi.publicFotoGaleri(lokasi.id)).toEqual([expect.objectContaining({ keterangan: "Gerbang utama" })]);
  });

  it("refuses a photo whose uploader does not confirm it shows no headstones or burial area, one with no caption, and a file that is not an image", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);

    expect(await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, { ...foto(), tanpaMakam: false })).toEqual({ ok: false, reason: "pernyataan_wajib" });
    expect(await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto("   "))).toEqual({ ok: false, reason: "keterangan_wajib" });
    expect(await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, { ...foto(), foto: { body: PDF, contentType: "image/jpeg" } })).toEqual({
      ok: false,
      reason: "berkas_tidak_didukung",
    });
    expect((await setup.lokasi.fotoGaleri(admin, lokasi.id))).toEqual({ ok: true, foto: [] });
  });

  it("holds at most 12 photos; one taken off leaves the public page and frees its place", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    await setLokasiMitraStatusForTest(db, lokasi.id, "terverifikasi");
    const ids: string[] = [];
    for (let i = 1; i <= 12; i += 1) {
      const added = await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto(`Foto ${i}`));
      if (!added.ok) throw new Error(added.reason);
      ids.push(added.id);
    }
    expect(await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto("Satu lagi"))).toEqual({ ok: false, reason: "galeri_penuh" });

    expect(await setup.lokasi.hapusFotoGaleri(admin, lokasi.id, ids[0])).toEqual({ ok: true });
    expect((await setup.lokasi.publicFotoGaleri(lokasi.id)).map((satu) => satu.keterangan)).not.toContain("Foto 1");
    expect(await setup.lokasi.hapusFotoGaleri(admin, lokasi.id, ids[0])).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto("Satu lagi"))).toMatchObject({ ok: true });
  });

  it("only Admin Platform adds or removes a photo; the Lokasi's Admin Lokasi can see the Galeri Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    const added = await setup.lokasi.unggahFotoGaleri(admin, lokasi.id, foto());
    if (!added.ok) throw new Error(added.reason);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);

    expect(await setup.lokasi.unggahFotoGaleri(adminLokasi, lokasi.id, foto())).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.hapusFotoGaleri(adminLokasi, lokasi.id, added.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.fotoGaleri(adminLokasi, lokasi.id)).toMatchObject({ ok: true, foto: [{ keterangan: "Gerbang utama" }] });
  });
});
