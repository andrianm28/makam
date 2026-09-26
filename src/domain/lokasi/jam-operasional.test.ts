import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_JAM_OPERASIONAL, type JamOperasional } from "@/domain/lokasi";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const open = (opens: string, closes: string) => ({ opens, closes });

/** Tuesday–Sunday 07:00–15:00, closed Monday, closed on 17 August. */
const typed: JamOperasional = {
  weekly: {
    monday: null,
    tuesday: open("07:00", "15:00"),
    wednesday: open("07:00", "15:00"),
    thursday: open("07:00", "15:00"),
    friday: open("07:00", "15:00"),
    saturday: open("07:00", "15:00"),
    sunday: open("07:00", "15:00"),
  },
  closures: [{ date: "2027-08-17", note: "HUT RI" }],
};

describe("Jam Operasional of a Lokasi Mitra", () => {
  it("a new Lokasi Mitra starts with the default Jam Operasional: Monday–Saturday 08:00–16:00, closed Sunday, no closures", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    expect(DEFAULT_JAM_OPERASIONAL).toEqual({
      weekly: {
        monday: open("08:00", "16:00"),
        tuesday: open("08:00", "16:00"),
        wednesday: open("08:00", "16:00"),
        thursday: open("08:00", "16:00"),
        friday: open("08:00", "16:00"),
        saturday: open("08:00", "16:00"),
        sunday: null,
      },
      closures: [],
    });
    expect(await setup.lokasi.jamOperasional(admin, lokasiMitra.id)).toEqual({ ok: true, jamOperasional: DEFAULT_JAM_OPERASIONAL });
  });

  it("the Admin Lokasi sets weekly hours per weekday (Monday closed) and dated closures; the change is in its Lokasi's Audit Log", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, typed)).toEqual({ ok: true });

    expect(await setup.lokasi.jamOperasional(adminLokasi, lokasiMitra.id)).toEqual({ ok: true, jamOperasional: typed });
    const log = await setup.lokasi.auditLog(adminLokasi, lokasiMitra.id);
    expect(log.ok && log.entries.at(-1)).toMatchObject({
      actor: { accountId: adminLokasi.accountId, role: "admin_lokasi" },
      action: "lokasi.ubah_jam_operasional",
      lokasiId: lokasiMitra.id,
      before: { jamOperasional: DEFAULT_JAM_OPERASIONAL },
      after: { jamOperasional: typed },
    });
  });

  it.each<[string, JamOperasional]>([
    ["a close before the opening", { ...typed, weekly: { ...typed.weekly, tuesday: open("15:00", "07:00") } }],
    ["a time that is not HH:MM", { ...typed, weekly: { ...typed.weekly, tuesday: open("7 pagi", "15:00") } }],
    ["a close past 24:00", { ...typed, weekly: { ...typed.weekly, tuesday: open("08:00", "25:00") } }],
    ["every weekday closed", { ...typed, weekly: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null } }],
    ["a closure on a date that does not exist", { ...typed, closures: [{ date: "2027-02-30", note: "" }] }],
    ["the same date closed twice", { ...typed, closures: [{ date: "2027-08-17", note: "" }, { date: "2027-08-17", note: "HUT RI" }] }],
  ])("refuses a Jam Operasional with %s, and nothing changes", async (_case, jamOperasional) => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, jamOperasional)).toEqual({
      ok: false,
      reason: "jam_operasional_tidak_valid",
    });
    expect(await setup.lokasi.jamOperasional(adminLokasi, lokasiMitra.id)).toEqual({ ok: true, jamOperasional: DEFAULT_JAM_OPERASIONAL });
  });

  it("an Admin Lokasi of another Lokasi cannot set this Lokasi's Jam Operasional; Admin Platform can", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);

    expect(await setup.lokasi.setJamOperasional(adminLokasi, other.id, typed)).toEqual({ ok: false, reason: "tidak_berwenang" });
    const invalid = { ...typed, closures: [{ date: "bukan tanggal", note: "" }] };
    expect(await setup.lokasi.setJamOperasional(adminLokasi, other.id, invalid)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.jamOperasional(admin, other.id)).toEqual({ ok: true, jamOperasional: DEFAULT_JAM_OPERASIONAL });
    expect(await setup.lokasi.setJamOperasional(admin, other.id, typed)).toEqual({ ok: true });
    expect(await setup.lokasi.jamOperasional(admin, other.id)).toEqual({ ok: true, jamOperasional: typed });
  });
});
