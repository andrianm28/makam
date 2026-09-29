import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import type { PekerjaanMitraJasa } from "@/domain/layanan";
import {
  layananOnTestDatabase,
  mitraJasaLengkap,
  newPekerjaan,
  signedInAdminPlatform,
  signedInMitraJasa,
  type LayananSetup,
} from "../../../tests/support/layanan";
import { wib } from "@/lib/time/jakarta";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The Clock the whole harness starts at: 1 October 2026, 09:00 WIB. */
const SEKARANG = wib("2026-10-01 09:00");

/** A job finished `hari` days before the Clock, with whatever else it carried. */
function selesai(hari: number, overrides: Partial<PekerjaanMitraJasa> = {}) {
  return newPekerjaan({
    id: "selesai",
    ...overrides,
    status: "selesai",
    dihitungPada: new Date(SEKARANG.getTime() - hari * 86_400_000),
  });
}

/** A job declined (or never answered) `hari` days before the Clock. */
function decline(hari: number, tidakDirespons = false) {
  return newPekerjaan({
    id: tidakDirespons ? "tidak-direspons" : "ditolak",
    status: "dibatalkan",
    dihitungPada: new Date(SEKARANG.getTime() - hari * 86_400_000),
    ditolak: !tidakDirespons,
    tidakDirespons,
  });
}

describe("the 90-day scorecard", () => {
  it("counts Selesai, Terlambat, upheld Keluhan, declines and the mean Penilaian over the last 90 days", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [
      selesai(1, { id: "a", penilaian: 5 }),
      selesai(2, { id: "b", terlambat: true, penilaian: 3 }),
      selesai(3, { id: "c", keluhanUpheld: true, penilaian: 4 }),
      selesai(10, { id: "d", terlambat: true }),
      decline(4),
      decline(5, true),
    ]);

    const skor = await setup.layanan.skorMitraJasa(admin, mitraJasa.id);

    if (!skor.ok) throw new Error(skor.reason);
    expect(skor.skor).toEqual({
      selesai: 4,
      terlambat: 2,
      keluhanUpheld: 1,
      declines: 2,
      rataPenilaian: 4,
      // The window is the last 90 days from the Clock, and says which two instants it is.
      window: { dari: wib("2026-07-03 09:00"), sampai: SEKARANG },
    });
  });

  it("leaves a job out at exactly 90 days and counts the one a day younger: the window is 90 days, not 91", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [selesai(90, { id: "tepat-90" }), selesai(89, { id: "89-hari" })]);

    const skor = await setup.layanan.skorMitraJasa(admin, mitraJasa.id);

    if (!skor.ok) throw new Error(skor.reason);
    expect(skor.skor.selesai).toBe(1);
  });

  it("counts a job that has not happened yet in no way, and averages nothing when no Penilaian was given", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [
      newPekerjaan({ id: "masih-dijadwalkan", status: "dijadwalkan", targetDate: "2026-10-05" }),
      selesai(2, { id: "tanpa-penilaian", penilaian: null }),
    ]);

    const skor = await setup.layanan.skorMitraJasa(admin, mitraJasa.id);

    if (!skor.ok) throw new Error(skor.reason);
    expect(skor.skor).toMatchObject({ selesai: 1, terlambat: 0, keluhanUpheld: 0, declines: 0, rataPenilaian: null });
  });

  it("is read from the Clock, never from the wall clock: moving the Clock moves the window", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [selesai(40, { id: "lupa" })]);

    expect(await setup.layanan.skorMitraJasa(admin, mitraJasa.id)).toMatchObject({ ok: true, skor: { selesai: 1 } });
    setup.clock.set(wib("2026-12-01 09:00"));
    expect(await setup.layanan.skorMitraJasa(admin, mitraJasa.id)).toMatchObject({ ok: true, skor: { selesai: 0 } });
  });

  it("is the Mitra Jasa's own to read, and nobody else's", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const satu = await mitraJasaLengkap(setup, admin, { email: "satu@contoh.id" });
    const dua = await mitraJasaLengkap(setup, admin, { email: "dua@contoh.id" });
    setup.pekerjaan.seed(satu.id, [selesai(1, { id: "a", penilaian: 5 })]);
    const actorSatu = await signedInMitraJasa(setup, admin, satu.email);
    const actorDua = await signedInMitraJasa(setup, admin, dua.email);

    expect(await setup.layanan.skorSaya(actorSatu)).toMatchObject({ ok: true, skor: { selesai: 1, rataPenilaian: 5 } });
    expect(await setup.layanan.skorMitraJasa(actorSatu, dua.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.layanan.skorMitraJasa(actorDua, satu.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("the monthly scorecard review row", () => {
  it("the tick opens one row per Mitra Jasa for this month with the numbers as they stand, and running it twice changes nothing", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    setup.pekerjaan.seed(mitraJasa.id, [selesai(2, { id: "a", terlambat: true, penilaian: 4 })]);

    await setup.layanan.tinjauSkorTick(SEKARANG);
    await setup.layanan.tinjauSkorTick(SEKARANG);

    const terbuka = await setup.layanan.tinjauanTerbuka(admin);
    expect(terbuka).toHaveLength(1);
    expect(terbuka[0]).toMatchObject({
      mitraJasaId: mitraJasa.id,
      namaLengkap: mitraJasa.namaLengkap,
      bulan: "2026-10",
      skor: { selesai: 1, terlambat: 1, keluhanUpheld: 0, declines: 0, rataPenilaian: 4 },
      ditinjauPada: null,
    });
    expect(await setup.layanan.tinjauanMitraJasa(admin, mitraJasa.id)).toHaveLength(1);
  });

  it("a review row is about a month of its own: the next month opens a new one", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);

    await setup.layanan.tinjauSkorTick(SEKARANG);
    // November: the tick runs at the start of the month, so the Clock is in it too.
    setup.clock.set(wib("2026-11-01 05:13"));
    await setup.layanan.tinjauSkorTick(setup.clock.now());

    expect((await setup.layanan.tinjauanMitraJasa(admin, mitraJasa.id)).map((satu) => satu.bulan)).toEqual(["2026-10", "2026-11"]);
    expect((await setup.layanan.tinjauanTerbuka(admin)).map((satu) => satu.bulan)).toEqual(["2026-11"]);
  });

  it("recording the review closes that month's row, with the note, and it is Admin Platform's alone", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    await setup.layanan.tinjauSkorTick(SEKARANG);
    const [row] = await setup.layanan.tinjauanTerbuka(admin);
    if (!row) throw new Error("no review row");
    const mitra = await masukSebagai(setup, mitraJasa.email);

    expect(await setup.layanan.catatTinjauan(mitra, { mitraJasaId: mitraJasa.id, tinjauanId: row.id, catatan: "Bagus" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.layanan.catatTinjauan(admin, { mitraJasaId: mitraJasa.id, tinjauanId: row.id, catatan: "Terlambat sering" })).toEqual({
      ok: true,
    });

    expect(await setup.layanan.tinjauanTerbuka(admin)).toEqual([]);
    const Ditinjau = await setup.layanan.tinjauanMitraJasa(admin, mitraJasa.id);
    expect(Ditinjau[0]).toMatchObject({ ditinjauPada: SEKARANG, catatan: "Terlambat sering" });
    // A second press is not a second review.
    expect(await setup.layanan.catatTinjauan(admin, { mitraJasaId: mitraJasa.id, tinjauanId: row.id, catatan: "Ulang" })).toEqual({
      ok: false,
      reason: "sudah_ditinjau",
    });
    expect((await setup.audit.entriesAbout({ kind: "mitra_jasa", id: mitraJasa.id })).filter((entry) => entry.action === "mitra_jasa.catat_tinjauan")).toHaveLength(1);
  });

  it("a Mitra Jasa takes no review row of their own, and the Operator's list is Admin Platform's", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const mitraJasa = await mitraJasaLengkap(setup, admin);
    await setup.layanan.tinjauSkorTick(SEKARANG);
    const mitra = await masukSebagai(setup, mitraJasa.email);

    expect(await setup.layanan.tinjauanTerbuka(mitra)).toEqual([]);
    expect(await setup.layanan.tinjauanMitraJasa(mitra, mitraJasa.id)).toEqual([]);
  });
});

/** A Mitra Jasa signed in on its own Akun, through a Kode Masuk, as a person would. */
async function masukSebagai(setup: LayananSetup, email: string) {
  return actorOf(setup.identity, (await logIn(setup, email)).cookies);
}
