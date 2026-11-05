import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  minimumUntukTayang,
  newLokasiMitra,
  publishOnTestDatabase,
  readyToPublish,
  tariffsCheckedFact,
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

async function tayangTanpaVerifikasi(setup: ReturnType<typeof publishOnTestDatabase>, admin: Parameters<typeof minimumUntukTayang>[1], name = "Pemakaman Baru") {
  const lokasiMitra = await newLokasiMitra(setup, admin, name);
  await minimumUntukTayang(setup, admin, lokasiMitra.id);
  const result = await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return lokasiMitra;
}

describe("an unverified listing is never bookable (fails closed)", () => {
  it("is not Terverifikasi, has no bookable public profile, no price quote and no order of any kind", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await tayangTanpaVerifikasi(setup, admin);

    expect(await setup.lokasi.isTerverifikasi(lokasiMitra.id)).toBe(false);
    expect(await setup.lokasi.publicLokasiMitra(lokasiMitra.id)).toBeNull();
    expect(await setup.lokasi.publicLokasiMitraTampil(lokasiMitra.id)).toBeNull();
    expect(await setup.lokasi.dapatDiharga(lokasiMitra.id)).toBe(false);
    for (const jenis of ["hak_pakai_baru", "lanjutan", "siklus_paket"] as const) {
      expect(await setup.lokasi.izinPesanan(lokasiMitra.id, jenis)).toEqual({ diizinkan: false, alasan: "belum_terverifikasi" });
    }
  });

  it("is left out of every list a wizard picks from", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await tayangTanpaVerifikasi(setup, admin);

    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
    expect(await setup.lokasi.publicLokasiMitraList({ terencana: true })).toEqual([]);
    expect(await setup.lokasi.publicLokasiMitraCities()).toEqual([]);
  });
});

describe("an unverified listing is shown with the Belum Terverifikasi mark", () => {
  it("has a public profile marked belumTerverifikasi, and a card in the directory and its city filter", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await tayangTanpaVerifikasi(setup, admin, "Pemakaman Baru");

    expect(await setup.lokasi.publicLokasiMitraProfil(lokasiMitra.id)).toMatchObject({
      id: lokasiMitra.id,
      name: "Pemakaman Baru",
      status: "tayang_belum_terverifikasi",
      belumTerverifikasi: true,
      jamOperasional: expect.anything(),
    });
    const kartu = await setup.lokasi.publicLokasiMakamList();
    expect(kartu).toEqual([expect.objectContaining({ kind: "lokasi_mitra", id: lokasiMitra.id, belumTerverifikasi: true })]);
    expect((await setup.lokasi.publicLokasiMakamCities()).length).toBe(1);
  });

  it("never shows Data Contoh, and a Lokasi still Belum Tayang has no public profile", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const belum = await newLokasiMitra(setup, admin, "Belum");

    expect(await setup.lokasi.publicLokasiMitraProfil(belum.id)).toBeNull();
    expect(await setup.lokasi.publicLokasiMakamList()).toEqual([]);
  });
});

describe("what happens to an unverified listing next", () => {
  it("becomes Terverifikasi through the normal Terbitkan once the full gate is met, audited from its unverified state", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const ready = await readyToPublish(setup, admin, lokasiMitra.id);
    expect(ready).toBeDefined();
    await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id);
    const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);

    expect(await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked })).toEqual({ ok: true, status: "terverifikasi" });

    expect(await setup.lokasi.isTerverifikasi(lokasiMitra.id)).toBe(true);
    expect(await setup.lokasi.publicLokasiMitraProfil(lokasiMitra.id)).toMatchObject({ belumTerverifikasi: false });
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).at(-1)).toMatchObject({
      action: "lokasi.terbitkan",
      before: { status: "tayang_belum_terverifikasi" },
      after: { status: "terverifikasi" },
    });
  });

  it("stays unverified, with the unmet gate items, when Terbitkan is tried before the full gate is met", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await tayangTanpaVerifikasi(setup, admin);

    expect(await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked: null })).toMatchObject({ ok: false, reason: "gerbang_belum_terpenuhi" });
    expect(await setup.lokasi.isTerverifikasi(lokasiMitra.id)).toBe(false);
  });

  it("can be taken down to Belum Tayang by Admin Platform, audited; it cannot be Ditangguhkan or Berhenti without being verified first", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await tayangTanpaVerifikasi(setup, admin);

    expect(await setup.lokasi.tangguhkan(admin, lokasiMitra.id)).toEqual({ ok: false, reason: "status_tidak_cocok" });
    expect(await setup.lokasi.hentikan(admin, lokasiMitra.id, {})).toEqual({ ok: false, reason: "status_tidak_cocok" });
    expect(await setup.lokasi.tarikTayangan(admin, lokasiMitra.id)).toEqual({ ok: true });
    expect(await setup.lokasi.publicLokasiMitraProfil(lokasiMitra.id)).toBeNull();
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).at(-1)).toMatchObject({
      action: "lokasi.tarik_tayangan",
      before: { status: "tayang_belum_terverifikasi" },
      after: { status: "belum_tayang" },
    });
    expect(await setup.lokasi.tarikTayangan(admin, lokasiMitra.id)).toEqual({ ok: false, reason: "status_tidak_cocok" });
  });
});
