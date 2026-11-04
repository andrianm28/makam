import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, tariffsOnTestDatabase } from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const reguler = {
  name: "Reguler 1 × 2 m",
  description: "",
  tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "selamanya" }, hargaPerpanjangan: null, effectiveOn: "2026-10-01" },
  reason: null,
} as const;
const gambar = (keterangan = "Denah kavling 1 × 2 m") => ({ gambar: { body: PNG, contentType: "image/png" }, keterangan, tanpaMakam: true });

async function jenisMakam(setup: ReturnType<typeof tariffsOnTestDatabase>) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasi = await newLokasiMitra(setup, admin);
  const created = await setup.tariffs.createJenisMakam(admin, lokasi.id, reguler);
  if (!created.ok) throw new Error(created.reason);
  return { admin, lokasi, jenisMakamId: created.jenisMakam.id };
}

describe("a Jenis Makam's Gambar Tipe Kavling", () => {
  it("Admin Platform sets an illustration with its caption: it is shown once the Lokasi Mitra is Terverifikasi, and the change is audited", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasi, jenisMakamId } = await jenisMakam(setup);

    expect(await setup.tariffs.setGambarTipeKavling(admin, jenisMakamId, gambar())).toEqual({ ok: true });
    expect(await setup.tariffs.publicGambarTipeKavling([jenisMakamId])).toEqual({});
    expect(await setup.tariffs.staffGambarTipeKavling([jenisMakamId])).toMatchObject({ [jenisMakamId]: { keterangan: "Denah kavling 1 × 2 m" } });

    await setLokasiMitraStatusForTest(db, lokasi.id, "terverifikasi");
    const publik = await setup.tariffs.publicGambarTipeKavling([jenisMakamId, "bukan-id"]);
    expect(Object.keys(publik)).toEqual([jenisMakamId]);
    expect(setup.files.open(publik[jenisMakamId].url)).toMatchObject({ body: PNG, contentType: "image/png" });
    expect((await setup.audit.entriesAbout({ kind: "jenis_makam", id: jenisMakamId })).at(-1)).toMatchObject({
      action: "tarif.ubah_gambar_jenis_makam",
      after: { gambarKeterangan: "Denah kavling 1 × 2 m", tanpaMakam: true },
    });
  });

  it("is replaced by a new one and taken off by Admin Platform", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, jenisMakamId } = await jenisMakam(setup);
    await setup.tariffs.setGambarTipeKavling(admin, jenisMakamId, gambar("Lama"));
    await setup.tariffs.setGambarTipeKavling(admin, jenisMakamId, gambar("Baru"));
    expect((await setup.tariffs.staffGambarTipeKavling([jenisMakamId]))[jenisMakamId].keterangan).toBe("Baru");

    expect(await setup.tariffs.hapusGambarTipeKavling(admin, jenisMakamId)).toEqual({ ok: true });
    expect(await setup.tariffs.staffGambarTipeKavling([jenisMakamId])).toEqual({});
    expect(await setup.tariffs.hapusGambarTipeKavling(admin, jenisMakamId)).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("refuses an image without the no-headstones confirmation, without a caption, or that is not an image; and anyone but Admin Platform", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasi, jenisMakamId } = await jenisMakam(setup);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);

    expect(await setup.tariffs.setGambarTipeKavling(admin, jenisMakamId, { ...gambar(), tanpaMakam: false })).toEqual({ ok: false, reason: "pernyataan_wajib" });
    expect(await setup.tariffs.setGambarTipeKavling(admin, jenisMakamId, gambar(" "))).toEqual({ ok: false, reason: "keterangan_wajib" });
    expect(
      await setup.tariffs.setGambarTipeKavling(admin, jenisMakamId, { ...gambar(), gambar: { body: new Uint8Array([1, 2, 3]), contentType: "image/png" } }),
    ).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
    expect(await setup.tariffs.setGambarTipeKavling(adminLokasi, jenisMakamId, gambar())).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.tariffs.staffGambarTipeKavling([jenisMakamId])).toEqual({});
  });
});
