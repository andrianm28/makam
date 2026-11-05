import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  minimumUntukTayang,
  newLokasiMitra,
  publishOnTestDatabase,
  signedInAdminPlatform,
} from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("listing a Lokasi Mitra without verification (Tayang Belum Terverifikasi)", () => {
  it("is refused while Jam Operasional or the Kontak Siaga with a phone is missing, naming what is missing", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    expect(await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id)).toEqual({
      ok: false,
      reason: "syarat_minimum_belum_terpenuhi",
      belum: ["jam_operasional", "kontak_siaga"],
    });
    await minimumUntukTayang(setup, admin, lokasiMitra.id, { kontak: false });
    expect(await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id)).toMatchObject({ belum: ["kontak_siaga"] });
    expect(await setup.lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({ ok: true, lokasiMitra: { status: "belum_tayang" } });
  });

  it("lists it, audited, with only Jam Operasional and a Kontak Siaga met (no agreement, visit or tarif check)", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await minimumUntukTayang(setup, admin, lokasiMitra.id);

    expect(await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id)).toEqual({ ok: true, status: "tayang_belum_terverifikasi" });

    expect(await setup.lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({ ok: true, lokasiMitra: { status: "tayang_belum_terverifikasi" } });
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).at(-1)).toMatchObject({
      actor: { accountId: admin.accountId, role: "admin_platform" },
      action: "lokasi.tayangkan_belum_terverifikasi",
      before: { status: "belum_tayang" },
      after: { status: "tayang_belum_terverifikasi" },
    });
  });

  it("is Admin Platform's alone", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await minimumUntukTayang(setup, admin, lokasiMitra.id);
    if (!adminLokasi) throw new Error("no Admin Lokasi");

    expect(await setup.lokasi.tayangkanBelumTerverifikasi(adminLokasi, lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });

  it("never lists Data Contoh", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await minimumUntukTayang(setup, admin, lokasiMitra.id);
    await setup.lokasi.tandaiDataContoh(admin, lokasiMitra.id, { dataContoh: true, reason: "contoh" });

    expect(await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id)).toEqual({ ok: false, reason: "data_contoh_tidak_bisa_diterbitkan" });
  });

  it("refuses a Lokasi that is not Belum Tayang, and a listed one again", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await minimumUntukTayang(setup, admin, lokasiMitra.id);
    await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id);

    expect(await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id)).toEqual({ ok: false, reason: "status_tidak_bisa_diterbitkan" });
  });
});
