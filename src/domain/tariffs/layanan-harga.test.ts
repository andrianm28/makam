import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { actorOf, logIn } from "../../../tests/support/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { catalogFixture, layananOnTestDatabase, newLokasiMitra, signedInAdminLokasi } from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const now = () => wib("2026-10-01 09:00");

describe("who may enter a Layanan's price", () => {
  it("refuses an Admin Lokasi, a Petugas Lapangan and a Pemesan, and keeps and audits nothing", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    await setup.identity.inviteStaff(admin, { email: "petugas@contoh.id", phoneNumber: "084444444444", role: "petugas_lapangan" });
    const petugas = await actorOf(setup.identity, (await logIn(setup, "petugas@contoh.id")).cookies);
    const pemesan = await actorOf(setup.identity, (await logIn(setup, "pemesan@contoh.id")).cookies);
    const input = { amount: 500_000, effectiveOn: "2026-10-01", reason: null };

    for (const who of [adminLokasi, petugas, pemesan]) {
      expect(await setup.tariffs.setHargaLayananLokasi(who, lokasiMitra.id, varian.id, input)).toEqual({
        ok: false,
        reason: "tidak_berwenang",
      });
      expect(await setup.tariffs.setHargaLayananDki(who, varian.id, input)).toEqual({ ok: false, reason: "tidak_berwenang" });
      expect(await setup.tariffs.setTarifMitraJasa(who, varian.id, input)).toEqual({ ok: false, reason: "tidak_berwenang" });
    }
    expect(await setup.tariffs.hargaLayananLokasiHistory(lokasiMitra.id, varian.id)).toEqual([]);
    expect(await setup.tariffs.hargaLayananHistory("harga_layanan_dki", varian.id)).toEqual([]);
    expect(await setup.audit.entriesAbout({ kind: "harga_layanan", id: varian.id })).toEqual([]);
  });
});

describe("the price a Lokasi Mitra charges for a Layanan variant", () => {
  it("is the version in force at that moment, so a price with a later effective date is not yet the price", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.id, { amount: 550_000, effectiveOn: "2026-11-01", reason: null });

    expect(await setup.tariffs.hargaLayananLokasi(lokasiMitra.id, varian.id, wib("2026-10-31 23:59"))).toMatchObject({ amount: 500_000 });
    expect(await setup.tariffs.hargaLayananLokasi(lokasiMitra.id, varian.id, wib("2026-11-01 00:00"))).toMatchObject({ amount: 550_000 });
    expect(await setup.tariffs.hargaLayananLokasiHistory(lokasiMitra.id, varian.id)).toMatchObject([
      { amount: 500_000, effectiveOn: "2026-10-01", inForceFrom: wib("2026-10-01 09:00") },
      { amount: 550_000, effectiveOn: "2026-11-01", inForceFrom: wib("2026-11-01 00:00") },
    ]);
    // The same variant at another Lokasi Mitra has no price of its own: no free pricing.
    const lain = await newLokasiMitra(setup, admin, "Makam Swasta Al-Barkah");
    expect(await setup.tariffs.hargaLayananLokasi(lain.id, varian.id, now())).toBeNull();
  });

  it("is audited on its Lokasi Mitra with the version it replaces and the reason", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    setup.clock.set(wib("2026-10-20 10:00"));
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.id, { amount: 550_000, effectiveOn: "2026-10-20", reason: "  Kenaikan 2026  " });

    expect(await setup.audit.entriesAbout({ kind: "harga_layanan", id: varian.id })).toEqual([
      expect.objectContaining({ action: "tarif.ubah_harga_layanan", lokasiId: lokasiMitra.id, before: null, after: { amount: 500_000, effectiveOn: "2026-10-01" } }),
      expect.objectContaining({
        at: wib("2026-10-20 10:00"),
        action: "tarif.ubah_harga_layanan",
        lokasiId: lokasiMitra.id,
        before: { amount: 500_000, effectiveOn: "2026-10-01" },
        after: { amount: 550_000, effectiveOn: "2026-10-20" },
        reason: "Kenaikan 2026",
      }),
    ]);
    // The Lokasi's own Audit Log shows it, like every other write about that Lokasi.
    const untukLokasi = (await setup.audit.entriesForLokasi(lokasiMitra.id)).map((entry) => entry.action);
    expect(untukLokasi.filter((action) => action === "tarif.ubah_harga_layanan")).toHaveLength(2);
  });

  it("never lets an old version be changed or deleted", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setHargaLayananDki(admin, varian.id, { amount: 600_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setTarifMitraJasa(admin, varian.id, { amount: 400_000, effectiveOn: "2026-10-01", reason: null });

    await expect(db.execute(sql`update tariff_layanan_version set amount = 1`)).rejects.toThrow();
    await expect(db.execute(sql`delete from tariff_layanan_version`)).rejects.toThrow();
    await expect(db.execute(sql`delete from tariff_layanan_dki_version`)).rejects.toThrow();
    await expect(db.execute(sql`delete from tariff_mitra_jasa_version`)).rejects.toThrow();
    expect(await setup.tariffs.hargaLayananLokasiHistory(lokasiMitra.id, varian.id)).toMatchObject([{ amount: 500_000 }]);
  });

  it("refuses an amount that is not whole rupiah and an effective date that has passed", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    setup.clock.set(wib("2026-10-02 00:30"));

    for (const input of [
      { amount: -1, effectiveOn: "2026-10-02" },
      { amount: 500_000.5, effectiveOn: "2026-10-02" },
      { amount: 500_000, effectiveOn: "2026-10-01" },
      { amount: 500_000, effectiveOn: "2026-13-01" },
    ]) {
      expect(await setup.tariffs.setHargaLayananLokasi(admin, lokasiMitra.id, varian.id, { ...input, reason: null })).toMatchObject({ ok: false });
    }
    expect(await setup.tariffs.hargaLayananLokasiHistory(lokasiMitra.id, varian.id)).toEqual([]);
  });
});

describe("the DKI price of a Layanan variant", () => {
  it("is versioned and the same in every TPU", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    await setup.tariffs.setHargaLayananDki(admin, varian.id, { amount: 600_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setHargaLayananDki(admin, varian.id, { amount: 650_000, effectiveOn: "2026-12-01", reason: null });

    expect(await setup.tariffs.hargaLayananDki(varian.id, wib("2026-11-30 23:59"))).toMatchObject({ amount: 600_000 });
    expect(await setup.tariffs.hargaLayananDki(varian.id, wib("2026-12-01 00:00"))).toMatchObject({ amount: 650_000 });
    expect(await setup.audit.entriesAbout({ kind: "harga_layanan_dki", id: varian.id })).toMatchObject([
      { action: "tarif.ubah_harga_layanan_dki", lokasiId: null, before: null, after: { amount: 600_000, effectiveOn: "2026-10-01" } },
      { action: "tarif.ubah_harga_layanan_dki", before: { amount: 600_000 }, after: { amount: 650_000 } },
    ]);
  });
});

describe("the Mitra Jasa rate of a Layanan variant", () => {
  it("is versioned, and only Admin Platform reads it: a Pemesan and an Admin Lokasi never see what the Operator pays", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, varian } = await catalogFixture(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const pemesan = await actorOf(setup.identity, (await logIn(setup, "pemesan@contoh.id")).cookies);
    await setup.tariffs.setHargaLayananDki(admin, varian.id, { amount: 600_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setTarifMitraJasa(admin, varian.id, { amount: 400_000, effectiveOn: "2026-10-01", reason: null });
    await setup.tariffs.setTarifMitraJasa(admin, varian.id, { amount: 420_000, effectiveOn: "2026-11-01", reason: null });

    expect(await setup.tariffs.mitraJasaRate(admin, varian.id, wib("2026-10-31 23:59"))).toMatchObject({ amount: 400_000 });
    expect(await setup.tariffs.mitraJasaRate(admin, varian.id, wib("2026-11-01 00:00"))).toMatchObject({ amount: 420_000 });
    expect(await setup.tariffs.mitraJasaRate(adminLokasi, varian.id, now())).toBeNull();
    expect(await setup.tariffs.mitraJasaRate(pemesan, varian.id, now())).toBeNull();

    // It is never a quote line, so no price a family ever sees can carry it: the
    // family pays the DKI price alone, with no Biaya Layanan Platform on top.
    const quoted = await setup.tariffs.quote(
      [{ kind: "layanan_dki", layananVariantId: varian.id, namaLayanan: "Pembersihan Makam", namaVarian: "Reguler" }],
      now(),
    );
    expect(quoted).toMatchObject({ ok: true, total: 600_000, lines: [{ kind: "layanan_dki", amount: 600_000 }] });
  });
});
