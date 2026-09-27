import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { newLokasiMitra, setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import {
  publishOnTestDatabase,
  publishedLokasiMitra,
  readyToPublish,
  signedInAdminPlatform,
  tariffsCheckedFact,
} from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** Admin Platform plus a Lokasi Mitra, the two the marker is written on. */
async function adminDanLokasi() {
  const setup = publishOnTestDatabase(db);
  const admin = (await signedInAdminPlatform(setup)).actor;
  const lokasiMitra = await newLokasiMitra(setup, admin);
  return { setup, admin, lokasiMitraId: lokasiMitra.id };
}

describe("a Lokasi Mitra marked as example data (data_contoh)", () => {
  it("marks it with a reason, audited on that Lokasi Mitra, and staff see the mark", async () => {
    const { setup, admin, lokasiMitraId } = await adminDanLokasi();

    const ditandai = await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, {
      dataContoh: true,
      reason: "katalog aplikasi lama, seluruhnya data contoh",
    });

    expect(ditandai).toEqual({ ok: true });
    const record = await setup.lokasi.lokasiMitra(admin, lokasiMitraId);
    expect(record.ok && record.lokasiMitra.dataContoh).toBe(true);
    const entri = await setup.audit.allEntriesForLokasi(lokasiMitraId);
    expect(entri.map((entry) => [entry.action, entry.reason, entry.after])).toContainEqual([
      "lokasi.tandai_data_contoh",
      "katalog aplikasi lama, seluruhnya data contoh",
      { dataContoh: true },
    ]);
  });

  it("refuses to set or clear the mark without a reason, and clears it with one", async () => {
    const { setup, admin, lokasiMitraId } = await adminDanLokasi();
    await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, { dataContoh: true, reason: "contoh" });

    expect(await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, { dataContoh: true, reason: "  " })).toEqual({
      ok: false,
      reason: "alasan_wajib",
    });
    expect(await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, { dataContoh: false, reason: null })).toEqual({
      ok: false,
      reason: "alasan_wajib",
    });
    const dibersihkan = await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, {
      dataContoh: false,
      reason: "sudah data makam sungguhan",
    });
    expect(dibersihkan).toEqual({ ok: true });
    const record = await setup.lokasi.lokasiMitra(admin, lokasiMitraId);
    expect(record.ok && record.lokasiMitra.dataContoh).toBe(false);
  });

  it("refuses to publish one whose whole publish gate is met, whatever the reason", async () => {
    const { setup, admin, lokasiMitraId } = await adminDanLokasi();
    const ready = await readyToPublish(setup, admin, lokasiMitraId);
    await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, { dataContoh: true, reason: "data contoh" });

    const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitraId);
    const diterbitkan = await setup.lokasi.publish(admin, lokasiMitraId, { tariffsChecked });

    expect(diterbitkan).toEqual({ ok: false, reason: "data_contoh_tidak_bisa_diterbitkan" });
    const record = await setup.lokasi.lokasiMitra(admin, lokasiMitraId);
    expect(record.ok && record.lokasiMitra.status).toBe("belum_tayang");
    expect(ready.jenisMakam.id).not.toBe("");
  });

  it("is never listed, even if its status says Terverifikasi", async () => {
    const { setup, admin, lokasiMitraId } = await adminDanLokasi();
    await readyToPublish(setup, admin, lokasiMitraId);
    await setup.lokasi.tandaiDataContoh(admin, lokasiMitraId, { dataContoh: true, reason: "data contoh" });
    // The one thing the module must not depend on: a status set by anything else.
    await setLokasiMitraStatusForTest(db, lokasiMitraId, "terverifikasi");

    expect(await setup.lokasi.isTerverifikasi(lokasiMitraId)).toBe(false);
    expect(await setup.lokasi.publicLokasiMitra(lokasiMitraId)).toBeNull();
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    expect(await setup.lokasi.publicLokasiMitraCities()).toEqual([]);
    expect(await setup.lokasi.publicVisitPhotoUrls(lokasiMitraId)).toEqual([]);
  });

  it("leaves a Lokasi Mitra nobody marked alone: it still publishes and lists as before", async () => {
    const setup = publishOnTestDatabase(db);
    const admin = (await signedInAdminPlatform(setup)).actor;
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);

    const record = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);
    expect(record.ok && record.lokasiMitra.dataContoh).toBe(false);
    expect(await setup.lokasi.isTerverifikasi(lokasiMitra.id)).toBe(true);
    expect((await setup.lokasi.publicLokasiMitraList()).map((card) => card.name)).toEqual([lokasiMitra.name]);
  });

  it("is written by Admin Platform only, like the rest of the Lokasi Mitra's record", async () => {
    const { setup, admin, lokasiMitraId } = await adminDanLokasi();
    const pemesan = { ...admin, roles: ["pemesan" as const], totp: "tidak_perlu" as const };

    expect(await setup.lokasi.tandaiDataContoh(pemesan, lokasiMitraId, { dataContoh: true, reason: "contoh" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});
