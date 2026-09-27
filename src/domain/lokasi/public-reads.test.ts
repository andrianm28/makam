import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";
import { catatCekDenah, signedInPetugasLapangan } from "../../../tests/support/fieldwork";
import {
  newLokasiMitra,
  publishOnTestDatabase,
  readyToPublish,
  signedInAdminPlatform,
  tariffsCheckedFact,
} from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function publishedLokasi(setup: ReturnType<typeof publishOnTestDatabase>, name?: string) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin, name);
  await readyToPublish(setup, admin, lokasiMitra.id);
  const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);
  const published = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked });
  if (!published.ok) throw new Error(`publish refused: ${JSON.stringify(published)}`);
  return { admin, lokasiMitra };
}

describe("a Terverifikasi Lokasi Mitra's public profile", () => {
  it("is null for a Belum Tayang, unknown or malformed id", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const belumTayang = await newLokasiMitra(setup, admin);

    expect(await setup.lokasi.publicLokasiMitra(belumTayang.id)).toBeNull();
    expect(await setup.lokasi.publicLokasiMitra("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await setup.lokasi.publicLokasiMitra("not-an-id")).toBeNull();
  });

  it("carries the profile, agreement-free of course, once Terverifikasi", async () => {
    const setup = publishOnTestDatabase(db);
    const { lokasiMitra } = await publishedLokasi(setup);

    const profile = await setup.lokasi.publicLokasiMitra(lokasiMitra.id);

    expect(profile).toMatchObject({
      id: lokasiMitra.id,
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      city: "Kota Jakarta Timur",
      terencanaAktif: false,
      pembatalan: { masaPembatalanDays: 7, refundAfterMasaPembatalanPercent: 0 },
    });
    expect(profile?.kunjunganVerifikasi?.visitedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(profile?.jamOperasional).not.toBeNull();
    expect((profile as { agreement?: unknown }).agreement).toBeUndefined();
  });
});

describe("the Daftar Lokasi Makam directory (every Terverifikasi Lokasi Mitra)", () => {
  it("lists only Terverifikasi Lokasi Mitra, by name", async () => {
    const setup = publishOnTestDatabase(db);
    const { lokasiMitra: published, admin } = await publishedLokasi(setup, "Makam Terverifikasi");
    await newLokasiMitra(setup, admin, "Masih Belum Tayang");

    const list = await setup.lokasi.publicLokasiMitraList();

    expect(list.map((row) => row.id)).toEqual([published.id]);
    expect(list[0]).toMatchObject({ name: "Makam Terverifikasi", city: "Kota Jakarta Timur" });
  });

  it("filters by city and by every facility checked", async () => {
    const setup = publishOnTestDatabase(db);
    const { lokasiMitra } = await publishedLokasi(setup);

    expect(await setup.lokasi.publicLokasiMitraList({ city: "Kota Jakarta Timur" })).toHaveLength(1);
    expect(await setup.lokasi.publicLokasiMitraList({ city: "Kota Bandung" })).toHaveLength(0);
    expect(await setup.lokasi.publicLokasiMitraList({ facilities: ["parkir"] })).toHaveLength(1);
    expect(await setup.lokasi.publicLokasiMitraList({ facilities: ["parkir", "musala"] })).toHaveLength(0);
    void lokasiMitra;
  });

  it("lists every city with at least one Terverifikasi Lokasi Mitra", async () => {
    const setup = publishOnTestDatabase(db);
    await publishedLokasi(setup);

    expect(await setup.lokasi.publicLokasiMitraCities()).toEqual(["Kota Jakarta Timur"]);
  });

  it("lists only the Lokasi Mitra that have switched Pemesanan Terencana on, when asked for those", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const denganTerencana = await newLokasiMitra(setup, admin, "Makam Dengan Terencana");
    const tanpaTerencana = await newLokasiMitra(setup, admin, "Makam Tanpa Terencana");
    for (const lokasiMitra of [denganTerencana, tanpaTerencana]) {
      // Each Lokasi Mitra needs its own Admin Lokasi, and a Kode Masuk waits 60 s.
      setup.clock.advance({ minutes: 2 });
      await readyToPublish(setup, admin, lokasiMitra.id);
      const checked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);
      const published = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked: checked });
      if (!published.ok) throw new Error(`publish refused: ${JSON.stringify(published)}`);
    }
    await catatCekDenah(setup, admin, petugas, denganTerencana.id);
    const switched = await setup.lokasi.activateTerencana(admin, denganTerencana.id, { hasPetakPerluVerifikasi: false });
    if (!switched.ok) throw new Error(`Terencana refused: ${JSON.stringify(switched)}`);

    const semua = await setup.lokasi.publicLokasiMitraList();
    const untukTerencana = await setup.lokasi.publicLokasiMitraList({ terencana: true });

    expect(semua.map((row) => row.id)).toEqual([denganTerencana.id, tanpaTerencana.id]);
    expect(untukTerencana.map((row) => row.id)).toEqual([denganTerencana.id]);
    expect(untukTerencana[0].terencanaAktif).toBe(true);
  });

  it("carries the tumpang rules the Denah picker needs", async () => {
    const setup = publishOnTestDatabase(db);
    const { admin, lokasiMitra } = await publishedLokasi(setup);
    const changed = await setup.lokasi.setPoliciesAndFlags(admin, lokasiMitra.id, {
      policies: DEFAULT_POLICIES,
      flags: { ...DEFAULT_FLAGS, tumpang: { allowed: true, minYears: 3, maxLayers: 4 }, tumpangOnReleasedPlots: true },
    });
    if (!changed.ok) throw new Error(`kebijakan refused: ${changed.reason}`);

    const profile = await setup.lokasi.publicLokasiMitra(lokasiMitra.id);

    expect(profile?.tumpang).toEqual({ allowed: true, minYears: 3, maxLayers: 4, onReleasedPlots: true });
  });
});

describe("a Terverifikasi Lokasi Mitra's visit photo URLs", () => {
  it("signs one URL per Kunjungan Verifikasi photo; none for a Belum Tayang Lokasi", async () => {
    const setup = publishOnTestDatabase(db);
    const { lokasiMitra, admin } = await publishedLokasi(setup);
    const belumTayang = await newLokasiMitra(setup, admin, "Masih Belum Tayang");
    expect(await setup.lokasi.publicVisitPhotoUrls(belumTayang.id)).toEqual([]);

    const urls = await setup.lokasi.publicVisitPhotoUrls(lokasiMitra.id);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^https?:\/\//);
  });
});
