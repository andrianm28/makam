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

describe("searching the Lokasi Mitra list", () => {
  it("Admin Platform finds Lokasi Mitra by a part of the name, kota / kabupaten or pengelola, ignoring case", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const sentosa = await newLokasiMitra(setup, admin, "TPU Keluarga Sentosa");
    const updated = await setup.lokasi.updateProfile(admin, sentosa.id, {
      name: "TPU Keluarga Sentosa",
      pengelolaName: "Yayasan Sentosa Abadi",
      address: "Jl. Cibubur No. 2",
      city: "Kabupaten Bogor",
      pin: null,
      facilities: { checked: [], note: "" },
    });
    if (!updated.ok) throw new Error(updated.reason);

    const byName = await setup.lokasi.searchLokasiMitra(admin, { search: "ikhlas" });
    expect(byName.rows.map((row) => row.name)).toEqual(["Makam Wakaf Al-Ikhlas"]);
    const byCity = await setup.lokasi.searchLokasiMitra(admin, { search: "BOGOR" });
    expect(byCity.rows).toEqual([
      {
        id: sentosa.id,
        name: "TPU Keluarga Sentosa",
        pengelolaName: "Yayasan Sentosa Abadi",
        city: "Kabupaten Bogor",
        status: "belum_tayang",
      },
    ]);
    const byPengelola = await setup.lokasi.searchLokasiMitra(admin, { search: "abadi" });
    expect(byPengelola.rows.map((row) => row.name)).toEqual(["TPU Keluarga Sentosa"]);
    expect((await setup.lokasi.searchLokasiMitra(admin, { search: "%" })).total).toBe(0);
    expect((await setup.lokasi.searchLokasiMitra(admin, {})).total).toBe(2);
  });

  it("filters by status, together with the search", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const ikhlas = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    await newLokasiMitra(setup, admin, "Makam Keluarga Damai");
    const sentosa = await newLokasiMitra(setup, admin, "TPU Keluarga Sentosa");
    await setLokasiMitraStatusForTest(db, ikhlas.id, "ditangguhkan");
    await setLokasiMitraStatusForTest(db, sentosa.id, "ditangguhkan");

    const ditangguhkan = await setup.lokasi.searchLokasiMitra(admin, { status: "ditangguhkan" });
    expect(ditangguhkan.rows.map((row) => row.name)).toEqual(["Makam Wakaf Al-Ikhlas", "TPU Keluarga Sentosa"]);
    const both = await setup.lokasi.searchLokasiMitra(admin, { status: "ditangguhkan", search: "keluarga" });
    expect(both.rows.map((row) => row.name)).toEqual(["TPU Keluarga Sentosa"]);
    expect((await setup.lokasi.searchLokasiMitra(admin, { status: "berhenti" })).total).toBe(0);
  });

  it("pages through the matches by name; a page past the last reads as the last page", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    for (const name of ["Makam A", "Makam B", "Makam C", "Makam D", "Makam E"]) await newLokasiMitra(setup, admin, name);

    const second = await setup.lokasi.searchLokasiMitra(admin, { page: 2, pageSize: 2 });
    expect(second).toMatchObject({ total: 5, page: 2, pageSize: 2, pageCount: 3 });
    expect(second.rows.map((row) => row.name)).toEqual(["Makam C", "Makam D"]);

    const pastTheEnd = await setup.lokasi.searchLokasiMitra(admin, { page: 9, pageSize: 2 });
    expect(pastTheEnd).toMatchObject({ page: 3, pageCount: 3 });
    expect(pastTheEnd.rows.map((row) => row.name)).toEqual(["Makam E"]);

    const none = await setup.lokasi.searchLokasiMitra(admin, { search: "tidak ada", page: 4 });
    expect(none).toMatchObject({ rows: [], total: 0, page: 1, pageCount: 1 });
  });

  it("is empty for an Admin Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [created.id]);

    expect(await setup.lokasi.searchLokasiMitra(adminLokasi, {})).toMatchObject({ rows: [], total: 0 });
  });
});
