import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import {
  layananOnTestDatabase,
  newLayananFor,
  newLayananInput,
  newLokasiMitra,
  publishedLokasiMitra,
  setLokasiMitraStatusForTest,
  signedInAdminPlatform,
  type LayananSetup,
} from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const now = () => wib("2026-10-01 09:00");

describe("the Layanan a Lokasi Mitra offers", () => {
  it("are only the ones Admin Platform switched on, each with that place's all-in price", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const { layanan, varian } = await newLayananFor(setup, admin);
    const marmer = await setup.layanan.tambahVarian(admin, layanan.id, { name: "Marmer 80 cm", reason: null });
    if (!marmer.ok) throw new Error("varian refused");

    // Switching a Layanan on and pricing it are one decision, so the form is one too.
    await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, marmer.varian.id, { amount: 900_000, effectiveOn: "2026-10-01", reason: null });

    const penawaran = await setup.layanan.penawaranLokasi(lokasiMitra.id, now());
    expect(penawaran).toHaveLength(1);
    expect(penawaran[0].layanan).toMatchObject({ name: "Pembersihan Makam", leadTimeDays: 3, proof: { fotoSesudah: true, fotoSebelum: true } });
    // All-in: the variant's own price plus the one Biaya Layanan Platform of the order.
    expect(penawaran[0].varian.map((one) => [one.name, one.harga.total])).toEqual([
      ["Marmer 80 cm", 1_050_000],
      ["Reguler", 650_000],
    ]);
    const reguler = penawaran[0].varian.find((one) => one.name === "Reguler");
    expect(reguler?.harga.parts).toEqual([
      { label: "Layanan – Pembersihan Makam (Reguler)", amount: 500_000, inForceSince: "2026-10-01", scheduledChange: null },
      { label: "Biaya Layanan Platform", amount: 150_000, inForceSince: "2026-10-01", scheduledChange: null },
    ]);
    // What the Operator pays a Mitra Jasa for the work is in no price a family
    // reads: the rate enters, and the page shows exactly the same thing.
    await setup.tariffs.setTarifMitraJasa(admin, varian.id, { amount: 300_000, effectiveOn: "2026-10-01", reason: null });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, now())).toEqual(penawaran);
  });

  it("shows nothing until the price it is offered with is in force: no free pricing", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const { varian } = await newLayananFor(setup, admin);

    // The offering is real from the moment it is made; the price starts later.
    await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-11-01", reason: null });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, wib("2026-10-31 23:59"))).toEqual([]);
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, wib("2026-11-01 00:00"))).toMatchObject([
      { layanan: { name: "Pembersihan Makam" }, varian: [{ name: "Reguler", harga: { total: 650_000 } }] },
    ]);

    // Stopping it takes it off the page again, price or not.
    await setup.layanan.stopLayanan(admin, lokasiMitra.id, varian.id, { reason: "Sudah tidak berlaku" });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, wib("2026-11-01 00:00"))).toEqual([]);
  });

  it("disappear from the page when Admin Platform stops them, and the switch is audited on the Lokasi", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const { varian } = await newLayananFor(setup, admin);
    await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: "Mulai bulan ini" });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, now())).toHaveLength(1);

    expect(await setup.layanan.stopLayanan(admin, lokasiMitra.id, varian.id, { reason: "Sudah tidak berlaku" })).toEqual({ ok: true });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, now())).toEqual([]);
    expect(await setup.layanan.stopLayanan(admin, lokasiMitra.id, varian.id, { reason: null })).toEqual({ ok: false, reason: "tidak_ditawarkan" });

    // One decision, two Entri Audits: the offering and the price version.
    const jejakLayanan = (await setup.audit.entriesForLokasi(lokasiMitra.id)).filter(
      (entry) => entry.action === "layanan.tawarkan" || entry.action === "layanan.stop_tawarkan",
    );
    expect(jejakLayanan).toMatchObject([
      { action: "layanan.tawarkan", before: null, after: { name: "Reguler" }, reason: "Mulai bulan ini" },
      { action: "layanan.stop_tawarkan", before: { name: "Reguler" }, after: { berhentiPada: "2026-10-01" }, reason: "Sudah tidak berlaku" },
    ]);

    // Offering it again is a change of its own, with the stop it replaces in the log.
    expect(await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, { amount: 550_000, effectiveOn: "2026-10-01", reason: "Mulai lagi" })).toMatchObject({ ok: true });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, now())).toHaveLength(1);
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).filter((entry) => entry.action === "layanan.tawarkan").at(-1)).toMatchObject({
      before: { berhentiPada: "2026-10-01" },
      after: { name: "Reguler" },
      reason: "Mulai lagi",
    });
  });

  it("are nothing at a Lokasi Mitra that is not listed, and nothing at another Lokasi Mitra", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const belumTayang = await newLokasiMitra(setup, admin, "Makam Baru Belum Tayang");
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const { varian } = await newLayananFor(setup, admin);
    for (const satu of [belumTayang, lokasiMitra]) {
      await setup.layanan.tawarkanLayanan(admin, satu.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null });
    }

    expect(await setup.layanan.penawaranLokasi(belumTayang.id, now())).toEqual([]);
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, now())).toHaveLength(1);
    // A second listed Lokasi Mitra that was never switched on offers nothing of it.
    const kedua = await newLokasiMitra(setup, admin, "Makam Swasta Al-Barkah");
    await setLokasiMitraStatusForTest(db, kedua.id, "terverifikasi");
    expect(await setup.layanan.penawaranLokasi(kedua.id, now())).toEqual([]);
  });
});

describe("switching a Layanan on at a Lokasi Mitra", () => {
  it("is one decision with the place's price: a price the Tariffs module refuses leaves no offering behind", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra } = await publishedLokasiMitra(setup, admin);
    const { varian } = await newLayananFor(setup, admin);
    setup.clock.set(wib("2026-10-20 10:00"));

    // A past effective date never rewrites a price, so the version is refused.
    const refused = await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, {
      amount: 500_000,
      effectiveOn: "2026-10-01",
      reason: null,
    });
    expect(refused).toEqual({ ok: false, reason: "tanggal_berlaku_lampau" });

    // Nothing half-offered: the Lokasi offers nothing, the page shows nothing,
    // and the Audit Log has no entry of either kind.
    const penawaran = await setup.layanan.asStaff(admin).lokasiLayanan(lokasiMitra.id, setup.clock.now());
    expect(penawaran.flatMap((entry) => entry.varian).map((one) => [one.name, one.ditawarkan, one.harga])).toEqual([["Reguler", false, null]]);
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, setup.clock.now())).toEqual([]);
    expect(await setup.tariffs.hargaLayananLokasi(lokasiMitra.id, varian.id, now())).toBeNull();
    const jejak = (await setup.audit.entriesForLokasi(lokasiMitra.id)).filter((entry) =>
      ["layanan.tawarkan", "tarif.ubah_harga_layanan"].includes(entry.action),
    );
    expect(jejak).toEqual([]);

    // The same decision, with a price it accepts, is both facts at once.
    const ditulis = await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, {
      amount: 500_000,
      effectiveOn: "2026-10-20",
      reason: "Mulai hari ini",
    });
    expect(ditulis).toMatchObject({ ok: true, version: { amount: 500_000, effectiveOn: "2026-10-20" } });
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, setup.clock.now())).toHaveLength(1);
    expect(
      (await setup.audit.entriesForLokasi(lokasiMitra.id))
        .map((entry) => entry.action)
        .filter((action) => action === "layanan.tawarkan" || action === "tarif.ubah_harga_layanan"),
    ).toEqual(["layanan.tawarkan", "tarif.ubah_harga_layanan"]);
  });
});

describe("the Layanan offered at a DKI TPU", () => {
  it("are only the variants Admin Platform marked 'boleh di TPU DKI', at the DKI price with no platform fee", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { marmer, granit, pembersihan } = await katalogV1(setup, admin);

    // Only the Marmer variant is marked for TPU DKI, by hand; every variant has a
    // DKI price, so only the mark decides what a TPU may offer.
    await setup.layanan.tandaiBolehDiTpu(admin, marmer.id, { boleh: true, reason: "Sesuai ketentuan TPU" });
    for (const satu of [marmer, granit, pembersihan]) {
      await setup.tariffs.setHargaLayananDki(admin, satu.id, { amount: 600_000, effectiveOn: "2026-10-01", reason: null });
    }

    const penawaran = await setup.layanan.penawaranTpu(now());
    const marmerTpu = penawaran.flatMap((entry) => entry.varian).find((one) => one.id === marmer.id);
    expect(marmerTpu).toMatchObject({ name: "Marmer 80 cm", namaLayanan: "Batu Nisan" });
    // The family pays the DKI price alone: no Biaya Layanan Platform at a TPU.
    expect(marmerTpu?.harga).toMatchObject({ total: 600_000, parts: [{ label: "Layanan – Batu Nisan (Marmer 80 cm)", amount: 600_000 }] });
    expect(penawaran.flatMap((entry) => entry.varian).map((one) => one.name)).toEqual(["Marmer 80 cm"]);
  });

  it("are nothing for a marked variant with no DKI price yet", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { marmer } = await katalogV1(setup, admin);
    await setup.layanan.tandaiBolehDiTpu(admin, marmer.id, { boleh: true, reason: null });

    expect(await setup.layanan.penawaranTpu(now())).toEqual([]);
    await setup.tariffs.setHargaLayananDki(admin, marmer.id, { amount: 600_000, effectiveOn: "2026-10-01", reason: null });
    expect(await setup.layanan.penawaranTpu(now())).toHaveLength(1);
  });
});

describe("who may switch a Lokasi's Layanan on", () => {
  it("refuses an Admin Lokasi, a Petugas Lapangan and a Pemesan, and the Lokasi's page shows nothing of it", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { lokasiMitra, adminLokasi, petugas } = await publishedLokasiMitra(setup, admin);
    const pemesan = await actorOf(setup.identity, (await logIn(setup, "pemesan@contoh.id")).cookies);
    const { varian } = await newLayananFor(setup, admin);

    for (const who of [adminLokasi, petugas, pemesan]) {
      expect(await setup.layanan.tawarkanLayanan(who, lokasiMitra.id, varian.id, { amount: 500_000, effectiveOn: "2026-10-01", reason: null })).toEqual({
        ok: false,
        reason: "tidak_berwenang",
      });
      expect(await setup.layanan.stopLayanan(who, lokasiMitra.id, varian.id, { reason: null })).toEqual({
        ok: false,
        reason: "tidak_berwenang",
      });
    }
    expect(await setup.layanan.penawaranLokasi(lokasiMitra.id, now())).toEqual([]);
  });
});

/** The v1 catalog: Batu Nisan with two variants, and one Pembersihan Makam. */
async function katalogV1(setup: LayananSetup, admin: Actor) {
  const pembersihan = await newLayananFor(setup, admin, { name: "Pembersihan Makam", varian: ["Reguler"] });
  const created = await setup.layanan.createLayanan(
    admin,
    newLayananInput({
      name: "Batu Nisan",
      description: "Pesan dan pasang batu nisan.",
      jenis: "nisan",
      leadTimeDays: 14,
      adaDiPetakKosong: false,
      teksLabel: "Teks nisan",
      varian: ["Granit 60 cm", "Marmer 80 cm"],
    }),
  );
  if (!created.ok) throw new Error(`Layanan refused: ${created.reason}`);
  const varian = (name: string) => {
    const found = created.layanan.varian.find((one) => one.name === name);
    if (!found) throw new Error(`no ${name} variant`);
    return found;
  };
  return { nisan: created.layanan, marmer: varian("Marmer 80 cm"), granit: varian("Granit 60 cm"), pembersihan: pembersihan.varian };
}
