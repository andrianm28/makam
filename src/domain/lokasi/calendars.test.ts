import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addWorkingDays, TPU_SCHEDULE } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const natal = { date: "2026-12-25", name: "Hari Raya Natal" };

describe("the national holiday list Admin Platform keeps", () => {
  it("Admin Platform adds a national holiday, audited; the Admin Platform calendar then skips it", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const thursdayBeforeNatal = wib("2026-12-24 09:00");
    expect(addWorkingDays(await setup.lokasi.adminPlatformCalendar(), thursdayBeforeNatal, 1)).toEqual(wib("2026-12-25 23:59"));

    expect(await setup.lokasi.addNationalHoliday(admin, natal)).toEqual({ ok: true });

    expect(await setup.lokasi.nationalHolidays()).toEqual([natal]);
    expect(addWorkingDays(await setup.lokasi.adminPlatformCalendar(), thursdayBeforeNatal, 1)).toEqual(wib("2026-12-28 23:59"));
    expect(await setup.audit.entriesAbout({ kind: "hari_libur_nasional", id: "2026-12-25" })).toMatchObject([
      { actor: { accountId: admin.accountId, role: "admin_platform" }, action: "hari_libur.tambah", before: null, after: natal, lokasiId: null },
    ]);
  });

  it("Admin Platform removes a national holiday, audited; it is a working day again", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.addNationalHoliday(admin, natal);

    expect(await setup.lokasi.removeNationalHoliday(admin, { date: natal.date, reason: "Salah tanggal" })).toEqual({ ok: true });

    expect(await setup.lokasi.nationalHolidays()).toEqual([]);
    expect(addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2026-12-24 09:00"), 1)).toEqual(wib("2026-12-25 23:59"));
    expect((await setup.audit.entriesAbout({ kind: "hari_libur_nasional", id: "2026-12-25" })).at(-1)).toMatchObject({
      action: "hari_libur.hapus",
      before: natal,
      after: null,
      reason: "Salah tanggal",
    });
  });

  it("lists national holidays by date", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.addNationalHoliday(admin, natal);
    await setup.lokasi.addNationalHoliday(admin, { date: "2026-08-17", name: "Proklamasi Kemerdekaan RI" });

    expect((await setup.lokasi.nationalHolidays()).map((holiday) => holiday.date)).toEqual(["2026-08-17", "2026-12-25"]);
  });

  it.each([
    ["a date that does not exist", { date: "2026-02-30", name: "Libur" }, "hari_libur_tidak_valid"],
    ["an empty name", { date: "2026-12-26", name: "  " }, "hari_libur_tidak_valid"],
    ["a date already on the list", natal, "hari_libur_sudah_ada"],
  ])("refuses %s", async (_case, holiday, reason) => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.addNationalHoliday(admin, natal);

    expect(await setup.lokasi.addNationalHoliday(admin, holiday)).toEqual({ ok: false, reason });
    expect(await setup.lokasi.nationalHolidays()).toEqual([natal]);
  });

  it("removing a date not on the list is refused", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await setup.lokasi.removeNationalHoliday(admin, { date: "2026-12-25", reason: "" })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });

  it("only Admin Platform keeps the list: an Admin Lokasi cannot add or remove a national holiday", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    await setup.lokasi.addNationalHoliday(admin, natal);

    expect(await setup.lokasi.addNationalHoliday(adminLokasi, { date: "2026-08-17", name: "HUT RI" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.lokasi.removeNationalHoliday(adminLokasi, { date: natal.date, reason: "" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.lokasi.nationalHolidays()).toEqual([natal]);
  });
});

describe("a Lokasi calendar", () => {
  it("follows the Lokasi's Jam Operasional: its open days minus its dated closures, ending at its close; national holidays do not apply", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.lokasi.addNationalHoliday(admin, natal);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    const workday = { opens: "08:00", closes: "15:00" };
    await setup.lokasi.setJamOperasional(adminLokasi, lokasiMitra.id, {
      weekly: {
        monday: workday,
        tuesday: workday,
        wednesday: null,
        thursday: workday,
        friday: workday,
        saturday: workday,
        sunday: workday,
      },
      closures: [{ date: "2026-12-26", note: "Kerja bakti" }],
    });

    const calendar = await setup.lokasi.lokasiCalendar(lokasiMitra.id);

    // Tuesday 22nd → (Wednesday closed) Thursday 24th, Friday 25th (Natal, but open here), (26th closed), Sunday 27th.
    expect(calendar && addWorkingDays(calendar, wib("2026-12-22 10:00"), 3)).toEqual(wib("2026-12-27 15:00"));
  });

  it("is null for no such Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);

    expect(await setup.lokasi.lokasiCalendar("7d1c5a52-5f3e-4b8e-9a51-2d8c1f0e9b11")).toBeNull();
  });
});

describe("the working-time calculator on the Clock", () => {
  it("reads now from the Clock only when a caller passes no start", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { workingTime } = setup.lokasi;
    setup.clock.set(wib("2026-10-05 23:00"));
    const adminPlatform = await setup.lokasi.adminPlatformCalendar();

    expect(workingTime.deadline(TPU_SCHEDULE, undefined, 2)).toEqual(wib("2026-10-06 08:00"));
    expect(workingTime.deadline(TPU_SCHEDULE, wib("2026-10-06 09:00"), 2)).toEqual(wib("2026-10-06 11:00"));
    expect(workingTime.nextWorkingDayEnd(TPU_SCHEDULE)).toEqual(wib("2026-10-06 18:00"));
    expect(workingTime.addWorkingDays(adminPlatform, undefined, 1)).toEqual(wib("2026-10-06 23:59"));
    expect(workingTime.daytimeHoursDeadline(undefined, 4)).toEqual(wib("2026-10-06 10:00"));
    expect(workingTime.confirmationPromise(wib("2026-10-06 08:00"))).toBe("dikonfirmasi paling lambat besok pukul 08:00");
  });
});
