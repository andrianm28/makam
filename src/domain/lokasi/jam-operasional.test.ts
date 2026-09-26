import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addWorkingDays, deadline, type JamOperasional } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const open = (opens: string, closes: string) => ({ opens, closes });

/** Tuesday–Sunday 07:00–15:00, closed Monday, 17 August a Tanggal Tutup. */
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
  tanggalTutup: [{ date: "2027-08-17", note: "HUT RI" }],
};

describe("Jam Operasional of a Lokasi Mitra", () => {
  it("a new Lokasi Mitra has no Jam Operasional until its Admin Lokasi saves one", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    expect(await setup.lokasi.jamOperasional(admin, lokasiMitra.id)).toEqual({ ok: true, jamOperasional: null });
    expect(await setup.lokasi.jamOperasionalOf(lokasiMitra.id)).toEqual({ ok: true, jamOperasional: null });
  });

  it("the calculator refuses a new Lokasi Mitra: no confirmation deadline or Hari Kerja deadline without a saved Jam Operasional", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const read = await setup.lokasi.jamOperasionalOf(lokasiMitra.id);
    if (!read.ok) throw new Error(read.reason);
    const submittedAt = wib("2026-10-05 10:00");

    expect(deadline(read.jamOperasional, submittedAt, 2)).toEqual({ ok: false, reason: "jam_operasional_belum_diisi" });
    expect(addWorkingDays(read.jamOperasional, submittedAt, 2)).toEqual({ ok: false, reason: "jam_operasional_belum_diisi" });
  });

  it("the Jam Operasional of no such Lokasi is not found", async () => {
    const setup = lokasiOnTestDatabase(db);

    expect(await setup.lokasi.jamOperasionalOf("7d1c5a52-5f3e-4b8e-9a51-2d8c1f0e9b11")).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("the Admin Lokasi sets weekly hours per weekday (Monday closed) and Tanggal Tutup; the change is in its Lokasi's Audit Log", async () => {
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
      before: { jamOperasional: null },
      after: { jamOperasional: typed },
    });
  });

  const allClosed: JamOperasional["weekly"] = {
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
  const tuesday = (hours: { opens: string; closes: string }): JamOperasional => ({ ...typed, weekly: { ...typed.weekly, tuesday: hours } });

  it.each<[string, JamOperasional]>([
    ["an opening after the close", tuesday(open("15:00", "07:00"))],
    ["an opening equal to the close", tuesday(open("08:00", "08:00"))],
    ["an opening at 24:00", tuesday(open("24:00", "24:00"))],
    ["a time that is not HH:MM", tuesday(open("7 pagi", "15:00"))],
    ["a time without its leading zero", tuesday(open("8:00", "15:00"))],
    ["a minute past 59", tuesday(open("08:00", "12:60"))],
    ["a close past 24:00", tuesday(open("08:00", "24:01"))],
    ["a Tanggal Tutup on a date that does not exist", { ...typed, tanggalTutup: [{ date: "2027-02-30", note: "" }] }],
    ["the same Tanggal Tutup twice", { ...typed, tanggalTutup: [{ date: "2027-08-17", note: "" }, { date: "2027-08-17", note: "HUT RI" }] }],
  ])("refuses a Jam Operasional with %s, and the saved one stays", async (_case, jamOperasional) => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, typed);

    expect(await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, jamOperasional)).toEqual({
      ok: false,
      reason: "jam_operasional_tidak_valid",
    });
    expect(await setup.lokasi.jamOperasional(adminLokasi, lokasiMitra.id)).toEqual({ ok: true, jamOperasional: typed });
  });

  it("allows every weekday closed (the ticket only says a weekday may be closed); the calculator then finds no open hours", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const closedEveryDay: JamOperasional = { weekly: allClosed, tanggalTutup: [] };

    expect(await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, closedEveryDay)).toEqual({ ok: true });

    const read = await setup.lokasi.jamOperasionalOf(lokasiMitra.id);
    expect(read).toEqual({ ok: true, jamOperasional: closedEveryDay });
    const schedule = read.ok ? read.jamOperasional : null;
    const tanpaJamBuka = { ok: false, reason: "jam_operasional_tanpa_jam_buka" };
    expect(deadline(schedule, wib("2026-10-05 10:00"), 2)).toEqual(tanpaJamBuka);
    expect(addWorkingDays(schedule, wib("2026-10-05 10:00"), 1)).toEqual(tanpaJamBuka);
  });

  it("an Admin Lokasi of another Lokasi cannot set this Lokasi's Jam Operasional; Admin Platform can", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const own = await newLokasiMitra(setup, admin, "Makam Wakaf Al-Ikhlas");
    const other = await newLokasiMitra(setup, admin, "Makam Keluarga Sentosa");
    const adminLokasi = await signedInAdminLokasi(setup, admin, [own.id]);

    expect(await setup.lokasi.setJamOperasional(adminLokasi, other.id, typed)).toEqual({ ok: false, reason: "tidak_berwenang" });
    const invalid = { ...typed, tanggalTutup: [{ date: "bukan tanggal", note: "" }] };
    expect(await setup.lokasi.setJamOperasional(adminLokasi, other.id, invalid)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.lokasi.jamOperasional(admin, other.id)).toEqual({ ok: true, jamOperasional: null });
    expect(await setup.lokasi.setJamOperasional(admin, other.id, typed)).toEqual({ ok: true });
    expect(await setup.lokasi.jamOperasional(admin, other.id)).toEqual({ ok: true, jamOperasional: typed });
  });
});
