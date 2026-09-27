import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { TPU_LIMITS } from "@/domain/lokasi";
// The profile shape is the module's own: no page or Server Action needs it, so the barrel does not carry it.
import { tpuProfileSchema } from "./tpu";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A TPU as Admin Platform enters it; only the name, the city, the pin and the flag change in a test. */
const kubur = {
  name: "TPU Kober",
  address: "Jl. TPU No. 1, Jakarta Timur",
  city: "Kota Jakarta Timur",
  pin: null,
  dataSource: "Dinas Pengguna Umum dan Prasarana",
};
const pin = { lat: -6.2, lng: 106.9 };

/** A name that differs only in case and spacing: still the same TPU. */
const sameName = { ...kubur, name: "  tpu   kober " };

/** A plain family account, logged in with a Kode Masuk and holding no staff role. */
async function signedInPemesan(setup: ReturnType<typeof lokasiOnTestDatabase>, email = "keluarga@contoh.id") {
  const { cookies } = await logIn(setup, email);
  const actor = await actorOf(setup.identity, cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

/** The TPU profile shape, as the edit form submits it. */
const profile = {
  name: "TPU Sawah Besar",
  address: "Jl. Sawah Besar No. 3",
  city: "Kabupaten Bogor",
  pin: null,
  dataSource: "Jakarta Open Data",
};
const unknownTpuId = "7d1c5a52-5f3e-4b8e-9a51-2d8c1f0e9b11";

describe("the shape of a DKI TPU, as the form and its Server Action share it", () => {
  const refusedFields = (input: unknown) => {
    const parsed = tpuProfileSchema.safeParse(input);
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
  };

  it("takes a name, an address, a city, a data source and an optional pin; the name has one length", () => {
    expect(refusedFields({ ...kubur, pin })).toEqual([]);
    expect(refusedFields({ ...kubur, pin: null })).toEqual([]);
    expect(refusedFields({ ...kubur, name: "x".repeat(TPU_LIMITS.name) })).toEqual([]);
    expect(refusedFields({ ...kubur, name: "x".repeat(TPU_LIMITS.name + 1) })).toEqual(["name"]);
    expect(refusedFields({ ...kubur, name: "   " })).toEqual(["name"]);
    expect(refusedFields({ ...kubur, address: "  " })).toEqual(["address"]);
    expect(refusedFields({ ...kubur, city: "  " })).toEqual(["city"]);
    expect(refusedFields({ ...kubur, dataSource: "" })).toEqual(["dataSource"]);
    expect(refusedFields({ ...kubur, pin: { lat: 91, lng: 106.9 } })).toEqual(["pin.lat"]);
    expect(refusedFields({ ...kubur, pin: { lat: -6.2, lng: 181 } })).toEqual(["pin.lng"]);
  });
});

describe("the DKI TPU list Admin Platform keeps", () => {
  it("Admin Platform adds a DKI TPU with its address, pin, data source and the initial new-plot flag, audited, and every TPU is listed", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-09-25 08:00"));

    const created = await setup.lokasi.createTpuDki(admin, { ...kubur, pin, menerimaMakamBaru: true });
    if (!created.ok) throw new Error(created.reason);

    expect(created.tpuDki).toMatchObject({
      name: "TPU Kober",
      address: "Jl. TPU No. 1, Jakarta Timur",
      city: "Kota Jakarta Timur",
      pin,
      dataSource: "Dinas Pengguna Umum dan Prasarana",
      menerimaMakamBaru: true,
      flagUpdatedAt: wib("2026-09-25 08:00"),
    });
    expect(await setup.lokasi.tpuDkiList(admin)).toMatchObject([{ id: created.tpuDki.id, name: "TPU Kober" }]);
    expect(await setup.audit.entriesAbout({ kind: "tpu_dki", id: created.tpuDki.id })).toMatchObject([
      { actor: { accountId: admin.accountId, role: "admin_platform" }, action: "tpu.buat", before: null, lokasiId: null },
    ]);
  });

  it("two spellings of one TPU's name are one TPU, refused with why", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.createTpuDki(admin, { ...kubur, pin, menerimaMakamBaru: true });

    expect(await setup.lokasi.createTpuDki(admin, { ...sameName, pin: null, menerimaMakamBaru: false })).toEqual({
      ok: false,
      reason: "nama_sudah_ada",
    });
    expect(await setup.lokasi.tpuDkiList(admin)).toHaveLength(1);
  });

  it("refuses a TPU with a blank name or a pin outside the world, and keeps nothing", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await setup.lokasi.createTpuDki(admin, { ...kubur, name: "  ", pin: null, menerimaMakamBaru: true })).toEqual({
      ok: false,
      reason: "tpu_tidak_valid",
    });
    expect(await setup.lokasi.createTpuDki(admin, { ...kubur, pin: { lat: 91, lng: 0 }, menerimaMakamBaru: true })).toEqual({
      ok: false,
      reason: "tpu_tidak_valid",
    });
    expect(await setup.lokasi.tpuDkiList(admin)).toEqual([]);
  });

  it("Admin Platform corrects a TPU's name, address, city, pin and data source, audited with the record before and after", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-09-25 08:00"));
    const created = await setup.lokasi.createTpuDki(admin, { ...kubur, pin, menerimaMakamBaru: true });
    if (!created.ok) throw new Error(created.reason);
    setup.clock.advance({ days: 1 });

    expect(await setup.lokasi.updateTpuDki(admin, created.tpuDki.id, profile)).toEqual({ ok: true });

    const after = (await setup.lokasi.tpuDkiList(admin))[0];
    expect(after).toMatchObject({
      name: "TPU Sawah Besar",
      address: "Jl. Sawah Besar No. 3",
      city: "Kabupaten Bogor",
      dataSource: "Jakarta Open Data",
      pin: null,
    });
    // The new-plot flag and the date it was last checked are its own, never the profile's.
    expect(after.menerimaMakamBaru).toBe(true);
    expect(after.flagUpdatedAt).toEqual(created.tpuDki.flagUpdatedAt);
    expect(await setup.audit.entriesAbout({ kind: "tpu_dki", id: created.tpuDki.id })).toMatchObject([
      { action: "tpu.buat" },
      { action: "tpu.ubah", before: { name: "TPU Kober", city: "Kota Jakarta Timur", pin }, after: { name: "TPU Sawah Besar", city: "Kabupaten Bogor" } },
    ]);
  });

  it("Admin Platform edits the new-plot flag: each update stamps the date it was checked and is audited", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-09-25 08:00"));
    const created = await setup.lokasi.createTpuDki(admin, { ...kubur, menerimaMakamBaru: true });
    if (!created.ok) throw new Error(created.reason);
    const tpuId = created.tpuDki.id;

    setup.clock.advance({ days: 3 });
    expect(await setup.lokasi.updateTpuDkiFlag(admin, tpuId, { menerimaMakamBaru: false })).toEqual({ ok: true });
    expect((await setup.lokasi.tpuDkiList(admin))[0]).toMatchObject({ menerimaMakamBaru: false, flagUpdatedAt: wib("2026-09-28 08:00") });

    setup.clock.advance({ days: 2 });
    expect(await setup.lokasi.updateTpuDkiFlag(admin, tpuId, { menerimaMakamBaru: true })).toEqual({ ok: true });
    expect((await setup.lokasi.tpuDkiList(admin))[0]).toMatchObject({ menerimaMakamBaru: true, flagUpdatedAt: wib("2026-09-30 08:00") });

    const entries = await setup.audit.entriesAbout({ kind: "tpu_dki", id: tpuId });
    expect(entries.map((entry) => entry.action)).toEqual(["tpu.buat", "tpu.ubah_flag", "tpu.ubah_flag"]);
    expect(entries.at(-1)).toMatchObject({ before: { menerimaMakamBaru: false }, after: { menerimaMakamBaru: true } });
  });

  it("refuses a rename onto another TPU's name, and keeps both records as they were", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.createTpuDki(admin, { ...kubur, menerimaMakamBaru: true });
    const kedua = await setup.lokasi.createTpuDki(admin, { ...kubur, name: "TPU Koper", menerimaMakamBaru: false });
    if (!kedua.ok) throw new Error(kedua.reason);

    expect(await setup.lokasi.updateTpuDki(admin, kedua.tpuDki.id, { ...profile, name: "tpu  kober" })).toEqual({
      ok: false,
      reason: "nama_sudah_ada",
    });
    expect((await setup.lokasi.tpuDkiList(admin)).map((item) => item.name)).toEqual(["TPU Kober", "TPU Koper"]);
  });

  it("a TPU that is not on the list is unknown to every edit", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await setup.lokasi.updateTpuDki(admin, unknownTpuId, profile)).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.lokasi.updateTpuDkiFlag(admin, unknownTpuId, { menerimaMakamBaru: true })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });

  it("only Admin Platform keeps the list: an Admin Lokasi and a Pemesan can neither add nor edit a TPU, and see none", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const pemesan = await signedInPemesan(setup);
    await setup.lokasi.createTpuDki(admin, { ...kubur, menerimaMakamBaru: true });

    for (const actor of [adminLokasi, pemesan]) {
      expect(await setup.lokasi.createTpuDki(actor, { ...kubur, name: "TPU Lain", pin: null, menerimaMakamBaru: false })).toEqual({
        ok: false,
        reason: "tidak_berwenang",
      });
      expect(await setup.lokasi.tpuDkiList(actor)).toEqual([]);
    }
    expect(await setup.lokasi.tpuDkiList(admin)).toHaveLength(1);
  });
});

describe("the TPU a visitor reads, as its page and a Daftar Lokasi card show it", () => {
  it("carries the name, address, city, pin and data source, the new-plot flag with the date it was last checked", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    setup.clock.set(wib("2026-09-25 08:00"));
    const created = await setup.lokasi.createTpuDki(admin, { ...kubur, pin, menerimaMakamBaru: true });
    if (!created.ok) throw new Error(created.reason);

    expect(await setup.lokasi.publicTpuDki(created.tpuDki.id)).toMatchObject({
      id: created.tpuDki.id,
      name: "TPU Kober",
      address: "Jl. TPU No. 1, Jakarta Timur",
      city: "Kota Jakarta Timur",
      pin,
      dataSource: "Dinas Pengguna Umum dan Prasarana",
      newPlot: true,
    });
    // "diperbarui <tanggal>" reads in WIB, the only calendar the platform reasons in.
    const [card] = await setup.lokasi.publicTpuDkiList();
    expect(card).toMatchObject({ id: created.tpuDki.id, name: "TPU Kober", newPlot: true, flagUpdatedOn: "2026-09-25" });
  });

  it("filters by the same city the Lokasi Mitra directory filters by, and lists a TPU's own city", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.createTpuDki(admin, { ...kubur, menerimaMakamBaru: true });
    await setup.lokasi.createTpuDki(admin, { ...kubur, name: "TPU Bambu", city: "Kota Bandung", menerimaMakamBaru: false });

    expect((await setup.lokasi.publicTpuDkiList({ city: "Kota Jakarta Timur" })).map((tpu) => tpu.name)).toEqual(["TPU Kober"]);
    expect((await setup.lokasi.publicTpuDkiList({ city: "Kota Bandung" })).map((tpu) => tpu.name)).toEqual(["TPU Bambu"]);
    expect(await setup.lokasi.publicTpuDkiList({ city: "Kota Surabaya" })).toEqual([]);
    // The one city list the directory offers, both kinds in it.
    expect(await setup.lokasi.publicLokasiMakamCities()).toEqual(["Kota Bandung", "Kota Jakarta Timur"]);
  });

  it("an unknown TPU is no TPU, so a page for it is not found", async () => {
    const setup = lokasiOnTestDatabase(db);

    expect(await setup.lokasi.publicTpuDki("bukan-tpu")).toBeNull();
    expect(await setup.lokasi.publicTpuDkiList()).toEqual([]);
  });
});
