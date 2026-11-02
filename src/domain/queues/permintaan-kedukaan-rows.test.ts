/**
 * The Antrean's Permintaan Kedukaan rows (ADR 0010): a family waiting for the Operator's first call
 * is a row at the tier its jenis sets, and the row closes the moment Admin Platform moves it on.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { keluargaDenganEmail, signedInAdminPlatform } from "../../../tests/support/kedukaan";
import { createQueuesTicks } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const umum = { nama: "Siti Aminah", telepon: "081234567890", kabKota: "Kota Bekasi" };
const MOBIL = { jenis: "mobil_jenazah", ...umum, rincian: { asal: "RSUD Bekasi", tujuan: "Graha Sentosa", tanggal: "2026-10-01" } };
const PETI = { jenis: "peti_jenazah", ...umum, rincian: { tanggal: "2026-10-01" } };
const KONSULTASI = { jenis: "konsultasi", ...umum, rincian: { waktuDihubungi: "pagi" } };

const KEDUKAAN = ["permintaan_kedukaan_mendesak", "permintaan_kedukaan", "konsultasi_rencana_pemakaman"];

describe("the Antrean's Permintaan Kedukaan rows", () => {
  it("puts a Mobil Jenazah in Tier 1, a Peti Jenazah in Tier 2 and a Konsultasi in Tier 3, and closes each at the first contact", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const keluarga = await keluargaDenganEmail(setup as never);
    const diajukan = [];
    for (const input of [MOBIL, PETI, KONSULTASI]) {
      const hasil = await setup.kedukaan.ajukan(keluarga, input);
      if (!hasil.ok) throw new Error(hasil.reason);
      diajukan.push(hasil);
    }

    const baris = (await setup.queues.antrean(admin)).filter((row) => KEDUKAAN.includes(row.type));
    expect(baris.map((row) => [row.type, row.tier, row.subjectId])).toEqual(
      expect.arrayContaining([
        ["permintaan_kedukaan_mendesak", 1, diajukan[0]!.permintaanId],
        ["permintaan_kedukaan", 2, diajukan[1]!.permintaanId],
        ["konsultasi_rencana_pemakaman", 3, diajukan[2]!.permintaanId],
      ]),
    );
    expect(baris).toHaveLength(3);
    expect(baris.find((row) => row.tier === 1)?.subjectLabel).toContain("Mobil Jenazah");

    for (const { permintaanId } of diajukan) {
      expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "dihubungi", catatan: null })).toEqual({ ok: true });
    }
    expect((await setup.queues.antrean(admin)).filter((row) => KEDUKAAN.includes(row.type))).toEqual([]);
  });

  it("alerts Admin Platform for an urgent Permintaan Kedukaan, as every Tier 1 row does", async () => {
    const setup = queuesOnTestDatabase(db);
    await signedInAdminPlatform(setup);
    const keluarga = await keluargaDenganEmail(setup as never);
    const ticks = createQueuesTicks({
      db,
      clock: setup.clock,
      identity: setup.identity,
      notifications: setup.notifications,
      pemesanan: setup.pemesanan,
      pengurusan: setup.pengurusan,
      layanan: setup.layanan,
      kedukaan: setup.kedukaan,
    });

    expect((await ticks.peringatanTick(setup.clock.now())).diantrekan).toBe(0);
    await setup.kedukaan.ajukan(keluarga, MOBIL);
    expect((await ticks.peringatanTick(setup.clock.now())).diantrekan).toBe(1);
  });
});
