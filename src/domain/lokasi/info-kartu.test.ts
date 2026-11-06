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

describe("the Info Kartu a Lokasi Mitra shows on Pilih makam (rapat Ira, 6 Nov 2026)", () => {
  it("starts empty: no agama, no description, no luas lahan and no krematorium are ever invented", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    await setLokasiMitraStatusForTest(db, created.id, "terverifikasi");

    const [card] = await setup.lokasi.publicLokasiMitraList();
    expect(card.infoKartu).toEqual({ agama: [], deskripsi: "", luasLahan: "", krematorium: false });
  });

  it("Admin Platform records the agama it accepts, its description, luas lahan and krematorium, and the public list shows them", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    await setLokasiMitraStatusForTest(db, created.id, "terverifikasi");

    const saved = await setup.lokasi.setInfoKartu(admin, created.id, {
      agama: ["kristen", "katolik", "buddha"],
      deskripsi: "  Taman pemakaman tertata dengan kavling keluarga.  ",
      luasLahan: "± 60 ha",
      krematorium: true,
    });

    expect(saved).toEqual({ ok: true });
    const [card] = await setup.lokasi.publicLokasiMitraList();
    expect(card.infoKartu).toEqual({
      agama: ["kristen", "katolik", "buddha"],
      deskripsi: "Taman pemakaman tertata dengan kavling keluarga.",
      luasLahan: "± 60 ha",
      krematorium: true,
    });
  });

  it("refuses an agama outside the list, and keeps what was saved before", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    await setLokasiMitraStatusForTest(db, created.id, "terverifikasi");

    const refused = await setup.lokasi.setInfoKartu(admin, created.id, {
      agama: ["islam", "bukan_agama" as never],
      deskripsi: "",
      luasLahan: "",
      krematorium: false,
    });

    expect(refused).toEqual({ ok: false, reason: "info_kartu_tidak_valid" });
    const [card] = await setup.lokasi.publicLokasiMitraList();
    expect(card.infoKartu.agama).toEqual([]);
  });

  it("an Admin Lokasi cannot change it", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [created.id]);

    const refused = await setup.lokasi.setInfoKartu(adminLokasi, created.id, {
      agama: ["islam"],
      deskripsi: "",
      luasLahan: "",
      krematorium: false,
    });

    expect(refused.ok).toBe(false);
  });
});
