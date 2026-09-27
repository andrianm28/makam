import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  publishOnTestDatabase,
  readyToPublish,
  signedInAdminLokasi,
  signedInAdminPlatform,
  tariffsCheckedFact,
} from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("publishing a Lokasi Mitra (the publish gate)", () => {
  it("is refused, with the unmet gate items, while any is missing", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const result = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked: null });

    expect(result).toMatchObject({ ok: false, reason: "gerbang_belum_terpenuhi" });
    if (result.ok || result.reason !== "gerbang_belum_terpenuhi") throw new Error("unreachable");
    expect(result.gate.ready).toBe(false);
    expect(result.gate.items).toEqual([
      { key: "perjanjian", met: false },
      { key: "kunjungan_verifikasi", met: false },
      { key: "tarif_diperiksa", met: false },
      { key: "jam_operasional", met: false },
      { key: "kontak_siaga", met: false },
    ]);

    const read = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);
    expect(read).toMatchObject({ ok: true, lokasiMitra: { status: "belum_tayang" } });
  });

  it("publishes (Belum Tayang → Terverifikasi), audited, once every item is met", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await readyToPublish(setup, admin, lokasiMitra.id);
    const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);

    const result = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked });

    expect(result).toEqual({ ok: true, status: "terverifikasi" });
    expect(await setup.lokasi.isTerverifikasi(lokasiMitra.id)).toBe(true);
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).at(-1)).toMatchObject({
      actor: { accountId: admin.accountId, role: "admin_platform" },
      action: "lokasi.terbitkan",
      entity: { kind: "lokasi_mitra", id: lokasiMitra.id },
      before: { status: "belum_tayang" },
      after: { status: "terverifikasi" },
    });
  });

  it("refuses while a tariff has changed since it was last checked (tarifBerubahSejakDiperiksa)", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const { jenisMakam } = await readyToPublish(setup, admin, lokasiMitra.id);
    setup.clock.set(wib("2026-10-03 09:00"));
    await setup.tariffs.setJenisMakamTariff(admin, jenisMakam.id, {
      hargaHakPakai: 8_000_000,
      tenure: { kind: "tahun", years: 5 },
      hargaPerpanjangan: 3_000_000,
      effectiveOn: "2027-01-01",
      reason: null,
    });
    const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);

    const result = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked });

    expect(result).toMatchObject({ ok: false, reason: "gerbang_belum_terpenuhi" });
    if (result.ok || result.reason !== "gerbang_belum_terpenuhi") throw new Error("unreachable");
    expect(result.gate.items).toContainEqual({ key: "tarif_diperiksa", met: false, tarifBerubahSejakDiperiksa: true });
  });

  it("publishing again is a harmless no-op", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await readyToPublish(setup, admin, lokasiMitra.id);
    const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);
    await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked });

    expect(await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked: null })).toEqual({
      ok: true,
      status: "terverifikasi",
    });
  });

  it("an Admin Lokasi (not Admin Platform) cannot publish", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.lokasi.publish(adminLokasi, lokasiMitra.id, { tariffsChecked: null })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});
