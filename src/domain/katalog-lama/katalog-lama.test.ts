import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { newLokasiMitra, lokasiOnTestDatabase, signedInAdminPlatform } from "../../../tests/support/lokasi";
import { createKatalogLama } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The Katalog Lama module on the test Postgres, with an Admin Platform past TOTP and the Lokasi Mitra to import. */
async function setup() {
  const test = lokasiOnTestDatabase(db);
  const katalog = createKatalogLama({ db, clock: test.clock, audit: test.audit });
  const admin = await signedInAdminPlatform(test);
  const lokasiMitra = await newLokasiMitra(test, admin.actor);
  return { ...katalog, test, admin: admin.actor, lokasiMitraId: lokasiMitra.id };
}

/** A Pemesan: the only role every account holds, and the only one that may not import. */
const pemesan = (admin: Awaited<ReturnType<typeof signedInAdminPlatform>>["actor"]) => ({
  ...admin,
  roles: ["pemesan" as const],
  totp: "tidak_perlu" as const,
});

describe("the Katalog Lama ledger: the old app's catalog codes", () => {
  it("binds an old catalog code to the Lokasi Mitra this import created, and reads it back", async () => {
    const katalog = await setup();

    const klaim = await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });
    expect(klaim.ok).toBe(true);

    const dicatat = await katalog.catatLokasi(katalog.admin, {
      kode: "TPU-BT-01",
      lokasiId: katalog.lokasiMitraId,
      reason: "impor katalog aplikasi lama",
    });

    expect(dicatat.ok).toBe(true);
    expect(await katalog.lokasi("TPU-BT-01")).toMatchObject({ kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId });
  });

  it("refuses a second claim of the same code, so running the import again creates nothing twice", async () => {
    const katalog = await setup();
    await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });
    await katalog.catatLokasi(katalog.admin, { kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId, reason: null });

    const kedua = await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });

    expect(kedua).toMatchObject({ ok: false, reason: "sudah_diklaim", milik: { lokasiId: katalog.lokasiMitraId } });
    expect(await katalog.lokasi("TPU-BT-01")).toMatchObject({ lokasiId: katalog.lokasiMitraId });
  });

  it("refuses to bind a code that was never claimed, or to bind one twice", async () => {
    const katalog = await setup();

    expect(await katalog.catatLokasi(katalog.admin, { kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId, reason: null })).toEqual({
      ok: false,
      reason: "tidak_diklaim",
    });

    await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });
    await katalog.catatLokasi(katalog.admin, { kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId, reason: null });

    expect(await katalog.catatLokasi(katalog.admin, { kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId, reason: null })).toEqual({
      ok: false,
      reason: "sudah_diimpor",
    });
  });

  it("keeps a claim that was never bound, so the import tells an interrupted run from a finished one", async () => {
    const katalog = await setup();

    await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });

    const tertinggal = await katalog.lokasi("TPU-BT-01");
    expect(tertinggal).toMatchObject({ kode: "TPU-BT-01", lokasiId: null, sudahTerikat: false });
    expect(await katalog.diimpor()).toEqual({ lokasi: [tertinggal], jenisMakam: [] });
  });

  it("binds a Jenis Makam code under its Lokasi code, and lists what the import has brought across", async () => {
    const katalog = await setup();
    await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });
    await katalog.catatLokasi(katalog.admin, { kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId, reason: null });

    await katalog.claimJenisMakam(katalog.admin, { kode: "TPU-BT-01-STD", lokasiKode: "TPU-BT-01" });
    const dicatat = await katalog.catatJenisMakam(katalog.admin, {
      kode: "TPU-BT-01-STD",
      jenisMakamId: katalog.lokasiMitraId,
      reason: null,
    });

    expect(dicatat.ok).toBe(true);
    expect(await katalog.jenisMakam("TPU-BT-01-STD")).toMatchObject({
      kode: "TPU-BT-01-STD",
      lokasiKode: "TPU-BT-01",
      jenisMakamId: katalog.lokasiMitraId,
    });
    expect(await katalog.diimpor()).toEqual({
      lokasi: [expect.objectContaining({ kode: "TPU-BT-01" })],
      jenisMakam: [expect.objectContaining({ kode: "TPU-BT-01-STD" })],
    });
  });

  it("refuses a Jenis Makam claim under a Lokasi code that is not imported", async () => {
    const katalog = await setup();

    expect(await katalog.claimJenisMakam(katalog.admin, { kode: "TPU-BT-01-STD", lokasiKode: "TPU-XX-99" })).toEqual({
      ok: false,
      reason: "lokasi_belum_diimpor",
    });
  });

  it("records each bind as an Entri Audit on the Lokasi Mitra it names, after the Lokasi Mitra's own entry", async () => {
    const katalog = await setup();

    await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });
    await katalog.catatLokasi(katalog.admin, { kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId, reason: "impor katalog aplikasi lama" });

    const entri = await katalog.test.audit.allEntriesForLokasi(katalog.lokasiMitraId);
    expect(entri.map((entry) => [entry.action, entry.actor.role, entry.reason])).toEqual([
      ["lokasi.buat", "admin_platform", null],
      ["katalog_lama.impor", "admin_platform", "impor katalog aplikasi lama"],
    ]);
    expect(entri[1]?.after).toEqual({ kode: "TPU-BT-01", lokasiId: katalog.lokasiMitraId });
  });

  it("is written by Admin Platform only: a Pemesan may not bind an import", async () => {
    const katalog = await setup();
    await katalog.claimLokasi(katalog.admin, { kode: "TPU-BT-01" });

    const hasil = await katalog.catatLokasi(pemesan(katalog.admin), {
      kode: "TPU-BT-01",
      lokasiId: katalog.lokasiMitraId,
      reason: null,
    });

    expect(hasil).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});
