import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addWorkingDays } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const natal = { date: "2026-12-25", name: "Hari Raya Natal" };

describe("the Hari Libur Nasional list Admin Platform keeps", () => {
  it("Admin Platform adds a Hari Libur Nasional, audited; it is then not a Hari Kerja on the Admin Platform calendar", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const thursdayBeforeNatal = wib("2026-12-24 09:00");
    expect(addWorkingDays(await setup.lokasi.adminPlatformCalendar(), thursdayBeforeNatal, 1)).toEqual(wib("2026-12-25 23:59"));

    expect(await setup.lokasi.addHariLiburNasional(admin, natal)).toEqual({ ok: true });

    expect(await setup.lokasi.hariLiburNasional()).toEqual([natal]);
    expect(addWorkingDays(await setup.lokasi.adminPlatformCalendar(), thursdayBeforeNatal, 1)).toEqual(wib("2026-12-28 23:59"));
    expect(await setup.audit.entriesAbout({ kind: "hari_libur_nasional", id: "2026-12-25" })).toMatchObject([
      { actor: { accountId: admin.accountId, role: "admin_platform" }, action: "hari_libur.tambah", before: null, after: natal, lokasiId: null },
    ]);
  });

  it("Admin Platform removes a Hari Libur Nasional, audited; it is a Hari Kerja again", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.addHariLiburNasional(admin, natal);

    expect(await setup.lokasi.removeHariLiburNasional(admin, { date: natal.date, reason: "Salah tanggal" })).toEqual({ ok: true });

    expect(await setup.lokasi.hariLiburNasional()).toEqual([]);
    expect(addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2026-12-24 09:00"), 1)).toEqual(wib("2026-12-25 23:59"));
    expect((await setup.audit.entriesAbout({ kind: "hari_libur_nasional", id: "2026-12-25" })).at(-1)).toMatchObject({
      action: "hari_libur.hapus",
      before: natal,
      after: null,
      reason: "Salah tanggal",
    });
  });

  it("lists the Hari Libur Nasional by date", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.addHariLiburNasional(admin, natal);
    await setup.lokasi.addHariLiburNasional(admin, { date: "2026-08-17", name: "Proklamasi Kemerdekaan RI" });

    expect((await setup.lokasi.hariLiburNasional()).map((libur) => libur.date)).toEqual(["2026-08-17", "2026-12-25"]);
  });

  it.each([
    ["a date that does not exist", { date: "2026-02-30", name: "Libur" }, "hari_libur_tidak_valid"],
    ["an empty name", { date: "2026-12-26", name: "  " }, "hari_libur_tidak_valid"],
    ["a date already on the list", natal, "hari_libur_sudah_ada"],
  ])("refuses %s", async (_case, holiday, reason) => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.lokasi.addHariLiburNasional(admin, natal);

    expect(await setup.lokasi.addHariLiburNasional(admin, holiday)).toEqual({ ok: false, reason });
    expect(await setup.lokasi.hariLiburNasional()).toEqual([natal]);
  });

  it("removing a date not on the list is refused", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await setup.lokasi.removeHariLiburNasional(admin, { date: "2026-12-25", reason: "" })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });

  it("only Admin Platform keeps the list: an Admin Lokasi cannot add or remove a Hari Libur Nasional", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    await setup.lokasi.addHariLiburNasional(admin, natal);

    expect(await setup.lokasi.addHariLiburNasional(adminLokasi, { date: "2026-08-17", name: "HUT RI" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.lokasi.removeHariLiburNasional(adminLokasi, { date: natal.date, reason: "" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.lokasi.hariLiburNasional()).toEqual([natal]);
  });
});

describe("a Lokasi calendar", () => {
  it("is the Lokasi's Jam Operasional: Hari Kerja are its open days that are not a Tanggal Tutup, ending at its close; a Hari Libur Nasional does not apply", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.lokasi.addHariLiburNasional(admin, natal);
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
      tanggalTutup: [{ date: "2026-12-26", note: "Kerja bakti" }],
    });

    const calendar = await setup.lokasi.scheduleOf(lokasiMitra.id);

    // Tuesday 22nd → (Wednesday closed) Thursday 24th, Friday 25th (Natal, but open here), (26th a Tanggal Tutup), Sunday 27th.
    expect(calendar && addWorkingDays(calendar, wib("2026-12-22 10:00"), 3)).toEqual(wib("2026-12-27 15:00"));
  });

  it("is null for no such Lokasi", async () => {
    const setup = lokasiOnTestDatabase(db);

    expect(await setup.lokasi.scheduleOf("7d1c5a52-5f3e-4b8e-9a51-2d8c1f0e9b11")).toBeNull();
  });
});
