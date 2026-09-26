import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logInByOtp } from "../../../tests/support/identity";
import { setLokasiMitraStatusForTest } from "../../../tests/support/lokasi";
import {
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  tariffsOnTestDatabase,
  type TariffsSetup,
} from "../../../tests/support/tariffs";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const at = wib("2026-10-05 10:00");

/** A Belum Tayang Lokasi Mitra with its tariffs entered and marked "diperiksa". */
async function belumTayangWithTariffs(setup: TariffsSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasiMitra = await newLokasiMitra(setup, admin);
  const created = await setup.tariffs.createJenisMakam(admin, lokasiMitra.id, {
    name: "Reguler",
    description: "",
    tariff: { hargaHakPakai: 7_500_000, tenure: { kind: "tahun", years: 5 }, hargaPerpanjangan: 3_000_000, effectiveOn: "2026-10-01" },
    reason: null,
  });
  if (!created.ok) throw new Error(created.reason);
  await setup.tariffs.setBiayaPemakaman(admin, lokasiMitra.id, {
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: null,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
  setup.clock.set(wib("2026-10-02 11:00"));
  await setup.tariffs.markTariffsChecked(admin, lokasiMitra.id, { reason: null });
  return { admin, lokasiMitra, jenisMakam: created.jenisMakam };
}

const saatDuka = (jenisMakamId: string, lokasiId: string) =>
  [
    { kind: "harga_hak_pakai", jenisMakamId },
    { kind: "biaya_pemakaman", lokasiId, tumpang: false },
  ] as const;

describe("public tariff reads (no actor) serve only a Terverifikasi Lokasi Mitra", () => {
  it("a Belum Tayang Lokasi reads as unknown: no tariffs, no history, no mark, and its quote is tidak_ditemukan", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { lokasiMitra, jenisMakam } = await belumTayangWithTariffs(setup);

    expect(await setup.tariffs.lokasiTariffs(lokasiMitra.id, at)).toEqual({
      jenisMakam: [],
      biayaPemakaman: { inForce: null, scheduledChange: null },
    });
    expect(await setup.tariffs.jenisMakamTariffHistory(jenisMakam.id)).toEqual([]);
    expect(await setup.tariffs.biayaPemakamanHistory(lokasiMitra.id)).toEqual([]);
    expect(await setup.tariffs.tariffsChecked(lokasiMitra.id)).toBeNull();
    expect(await setup.tariffs.quote([{ kind: "harga_hak_pakai", jenisMakamId: jenisMakam.id }], at)).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: lokasiMitra.id, tumpang: false }], at)).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });

  it("once Terverifikasi it is served; its 'tarif diperiksa' mark says when, never who", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { lokasiMitra, jenisMakam } = await belumTayangWithTariffs(setup);
    await setLokasiMitraStatusForTest(db, lokasiMitra.id, "terverifikasi");

    expect((await setup.tariffs.lokasiTariffs(lokasiMitra.id, at)).jenisMakam).toMatchObject([{ name: "Reguler" }]);
    expect(await setup.tariffs.jenisMakamTariffHistory(jenisMakam.id)).toHaveLength(1);
    expect(await setup.tariffs.biayaPemakamanHistory(lokasiMitra.id)).toHaveLength(1);
    expect(await setup.tariffs.quote(saatDuka(jenisMakam.id, lokasiMitra.id), at)).toMatchObject({ ok: true, total: 9_650_000 });
    expect(await setup.tariffs.tariffsChecked(lokasiMitra.id)).toEqual({
      checkedAt: wib("2026-10-02 11:00"),
      changedSinceCheck: false,
    });
  });

  it("a Ditangguhkan Lokasi is off the listings, so off the public reads too", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { lokasiMitra, jenisMakam } = await belumTayangWithTariffs(setup);
    await setLokasiMitraStatusForTest(db, lokasiMitra.id, "ditangguhkan");

    expect(await setup.tariffs.quote(saatDuka(jenisMakam.id, lokasiMitra.id), at)).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });
});

describe("staff tariff reads (actor-aware) also serve a Belum Tayang Lokasi Mitra, to its staff only", () => {
  it("Admin Platform and that Lokasi's Admin Lokasi read its tariffs, histories and quote, and who marked it 'diperiksa'", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, jenisMakam } = await belumTayangWithTariffs(setup);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    for (const who of [admin, adminLokasi]) {
      const staff = setup.tariffs.asStaff(who);
      expect((await staff.lokasiTariffs(lokasiMitra.id, at)).jenisMakam).toMatchObject([{ name: "Reguler" }]);
      expect(await staff.jenisMakamTariffHistory(jenisMakam.id)).toHaveLength(1);
      expect(await staff.biayaPemakamanHistory(lokasiMitra.id)).toHaveLength(1);
      expect(await staff.quote(saatDuka(jenisMakam.id, lokasiMitra.id), at)).toMatchObject({ ok: true, total: 9_650_000 });
      expect(await staff.tariffsChecked(lokasiMitra.id)).toEqual({
        checkedAt: wib("2026-10-02 11:00"),
        checkedByAccountId: admin.accountId,
        changedSinceCheck: false,
      });
    }
  });

  it("another Lokasi's Admin Lokasi and a Pemesan get nothing from it, as if it did not exist", async () => {
    const setup = tariffsOnTestDatabase(db);
    const { admin, lokasiMitra, jenisMakam } = await belumTayangWithTariffs(setup);
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const otherAdminLokasi = await signedInAdminLokasi(setup, admin, [other.id]);
    const pemesan = await actorOf(setup.identity, (await logInByOtp(setup.identity, setup.whatsapp, "085555555555")).cookies);

    for (const who of [otherAdminLokasi, pemesan]) {
      const staff = setup.tariffs.asStaff(who);
      expect(await staff.lokasiTariffs(lokasiMitra.id, at)).toEqual({ jenisMakam: [], biayaPemakaman: { inForce: null, scheduledChange: null } });
      expect(await staff.jenisMakamTariffHistory(jenisMakam.id)).toEqual([]);
      expect(await staff.biayaPemakamanHistory(lokasiMitra.id)).toEqual([]);
      expect(await staff.quote(saatDuka(jenisMakam.id, lokasiMitra.id), at)).toEqual({ ok: false, reason: "tidak_ditemukan" });
      expect(await staff.tariffsChecked(lokasiMitra.id)).toBeNull();
    }
  });
});
