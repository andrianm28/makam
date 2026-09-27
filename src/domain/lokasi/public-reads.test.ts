import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
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
});

describe("the Daftar Lokasi Makam with both kinds of Lokasi Makam in it", () => {
  /** A TPU added by Admin Platform, as the dashboard does. */
  const tpu = {
    address: "Jl. TPU No. 1",
    dataSource: "Dinas Pengguna Umum dan Prasarana",
    pin: null,
    menerimaMakamBaru: true,
  };

  it("lists Lokasi Mitra and TPUs together by name, and the type filter picks the kind", async () => {
    const setup = publishOnTestDatabase(db);
    const { admin } = await publishedLokasi(setup, "Makam Terverifikasi");
    await setup.lokasi.createTpuDki(admin, { ...tpu, name: "TPU Koper", city: "Kota Jakarta Timur" });
    await setup.lokasi.createTpuDki(admin, { ...tpu, name: "TPU Bambu", city: "Kabupaten Bandung" });

    expect((await setup.lokasi.publicLokasiMakamList()).map((card) => `${card.kind}:${card.name}`)).toEqual([
      "lokasi_mitra:Makam Terverifikasi",
      "tpu:TPU Bambu",
      "tpu:TPU Koper",
    ]);
    expect((await setup.lokasi.publicLokasiMakamList({ kind: "tpu" })).map((card) => card.name)).toEqual(["TPU Bambu", "TPU Koper"]);
    expect((await setup.lokasi.publicLokasiMakamList({ kind: "lokasi_mitra" })).map((card) => card.name)).toEqual([
      "Makam Terverifikasi",
    ]);
  });

  it("filters both kinds by the one city filter, and offers every city either kind is in", async () => {
    const setup = publishOnTestDatabase(db);
    const { admin } = await publishedLokasi(setup, "Makam Terverifikasi");
    await setup.lokasi.createTpuDki(admin, { ...tpu, name: "TPU Koper", city: "Kota Jakarta Timur" });
    await setup.lokasi.createTpuDki(admin, { ...tpu, name: "TPU Bambu", city: "Kabupaten Bandung" });

    expect((await setup.lokasi.publicLokasiMakamList({ city: "Kota Jakarta Timur" })).map((card) => card.name)).toEqual([
      "Makam Terverifikasi",
      "TPU Koper",
    ]);
    expect((await setup.lokasi.publicLokasiMakamList({ city: "Kabupaten Bandung" })).map((card) => card.name)).toEqual(["TPU Bambu"]);
    expect(await setup.lokasi.publicLokasiMakamList({ city: "Kota Surabaya" })).toEqual([]);
    expect(await setup.lokasi.publicLokasiMakamCities()).toEqual(["Kabupaten Bandung", "Kota Jakarta Timur"]);
  });

  it("never lists a Lokasi Mitra that is not Terverifikasi, whatever the filter", async () => {
    const setup = publishOnTestDatabase(db);
    const { admin } = await publishedLokasi(setup);
    await newLokasiMitra(setup, admin, "Masih Belum Tayang");
    await setup.lokasi.createTpuDki(admin, { ...tpu, name: "TPU Koper", city: "Kota Jakarta Timur" });

    expect((await setup.lokasi.publicLokasiMakamList({ kind: "lokasi_mitra" })).map((card) => card.name)).toEqual([
      "Makam Wakaf Al-Ikhlas",
    ]);
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
