import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  adminPlatformCalendar,
  daytimeHoursDeadline,
  deadline,
  nextDaytimeEnd,
  nextDaytimeStart,
  nextWorkingDayEnd,
  TPU_SCHEDULE,
  type JamOperasional,
} from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";

const closed = null;
/** The calculator's answer when it can compute: the deadline instant, given as WIB wall-clock. */
const at = (wallClock: string) => ({ ok: true, at: wib(wallClock) });
const hours = (opens: string, closes: string) => ({ opens, closes });

/** Monday–Friday 08:00–16:00, Saturday 08:00–12:00, Sunday closed. */
const weekdaysAndSaturdayMorning: JamOperasional = {
  weekly: {
    monday: hours("08:00", "16:00"),
    tuesday: hours("08:00", "16:00"),
    wednesday: hours("08:00", "16:00"),
    thursday: hours("08:00", "16:00"),
    friday: hours("08:00", "16:00"),
    saturday: hours("08:00", "12:00"),
    sunday: closed,
  },
  tanggalTutup: [],
};

describe("deadline: N service hours inside a Lokasi's Jam Operasional", () => {
  it("submitted Saturday 21:00, Sunday closed, Monday 08:00–16:00: 2 service hours end Monday 10:00", () => {
    // 2026-10-03 is a Saturday.
    expect(deadline(weekdaysAndSaturdayMorning, wib("2026-10-03 21:00"), 2)).toEqual(at("2026-10-05 10:00"));
  });

  const withTanggalTutup: JamOperasional = {
    ...weekdaysAndSaturdayMorning,
    tanggalTutup: [{ date: "2026-10-07", note: "Kerja bakti" }],
  };

  it.each([
    ["a start inside open hours counts from the start", weekdaysAndSaturdayMorning, "2026-10-05 09:30", 2, "2026-10-05 11:30"],
    ["a deadline that lands on the close ends at the close, not the next morning", weekdaysAndSaturdayMorning, "2026-10-05 14:00", 2, "2026-10-05 16:00"],
    ["the clock pauses overnight", weekdaysAndSaturdayMorning, "2026-10-05 15:00", 2, "2026-10-06 09:00"],
    ["a start exactly at close counts from the next opening", weekdaysAndSaturdayMorning, "2026-10-05 16:00", 1, "2026-10-06 09:00"],
    ["a start before opening counts from the opening", weekdaysAndSaturdayMorning, "2026-10-05 05:00", 1, "2026-10-05 09:00"],
    ["the clock pauses over the weekend (Saturday's short hours, closed Sunday)", weekdaysAndSaturdayMorning, "2026-10-02 15:00", 6, "2026-10-05 09:00"],
    ["the clock pauses on a Tanggal Tutup", withTanggalTutup, "2026-10-06 15:00", 2, "2026-10-08 09:00"],
    ["a start on a Tanggal Tutup counts from the next open day", withTanggalTutup, "2026-10-07 10:00", 1, "2026-10-08 09:00"],
    ["service hours may run over several open days", weekdaysAndSaturdayMorning, "2026-10-05 08:00", 20, "2026-10-07 12:00"],
  ])("%s", (_case, schedule, start, serviceHours, expected) => {
    expect(deadline(schedule, wib(start), serviceHours)).toEqual(at(expected));
  });
});

describe("nextWorkingDayEnd: the end of the Lokasi's next Hari Kerja", () => {
  const withTanggalTutup: JamOperasional = {
    ...weekdaysAndSaturdayMorning,
    tanggalTutup: [{ date: "2026-10-06", note: "Kerja bakti" }],
  };

  it.each([
    ["from an open day, the close of the following open day", weekdaysAndSaturdayMorning, "2026-10-05 10:00", "2026-10-06 16:00"],
    ["before opening on an open day, still the following open day", weekdaysAndSaturdayMorning, "2026-10-05 06:00", "2026-10-06 16:00"],
    ["from Friday, Saturday's short-hours close", weekdaysAndSaturdayMorning, "2026-10-02 10:00", "2026-10-03 12:00"],
    ["from Saturday night, over the closed Sunday, to Monday's close", weekdaysAndSaturdayMorning, "2026-10-03 21:00", "2026-10-05 16:00"],
    ["over a Tanggal Tutup", withTanggalTutup, "2026-10-05 10:00", "2026-10-07 16:00"],
  ])("%s", (_case, schedule, start, expected) => {
    expect(nextWorkingDayEnd(schedule, wib(start))).toEqual(at(expected));
  });
});

describe("the TPU schedule: 06:00–18:00 WIB every day", () => {
  it.each([
    ["a night submission at 23:00 with 2 service hours ends 08:00 next day", "2026-10-05 23:00", 2, "2026-10-06 08:00"],
    ["a Sunday counts like any other day", "2026-10-04 17:00", 2, "2026-10-05 07:00"],
    ["a start inside the window counts from the start", "2026-10-05 09:15", 2, "2026-10-05 11:15"],
    ["a start exactly at 18:00 counts from 06:00 next day", "2026-10-05 18:00", 2, "2026-10-06 08:00"],
  ])("%s", (_case, start, serviceHours, expected) => {
    expect(deadline(TPU_SCHEDULE, wib(start), serviceHours)).toEqual(at(expected));
  });
});

describe("daytime hours (the Keluhan first response): hours counted only within 06:00–18:00 WIB", () => {
  it.each([
    ["4 daytime hours from 16:00 end 08:00 next day", "2026-10-05 16:00", "2026-10-06 08:00"],
    ["4 daytime hours from 21:00 end 10:00 next day", "2026-10-05 21:00", "2026-10-06 10:00"],
    ["4 daytime hours from 09:00 end 13:00", "2026-10-05 09:00", "2026-10-05 13:00"],
  ])("%s", (_case, start, expected) => {
    expect(daytimeHoursDeadline(wib(start), 4)).toEqual(wib(expected));
  });
});

describe("the two ends of the daytime window, as instants (ticket 28's night TPU alert and the Bertugas auto-off)", () => {
  it.each([
    ["a 02:00 night waits for that morning's 06:00", "2026-10-05 02:00", "2026-10-05 06:00"],
    ["a 19:00 evening waits for tomorrow's 06:00", "2026-10-05 19:00", "2026-10-06 06:00"],
    ["05:59 has a minute to wait", "2026-10-05 05:59", "2026-10-05 06:00"],
    ["06:00 itself has passed, so the next one is tomorrow", "2026-10-05 06:00", "2026-10-06 06:00"],
    ["17:00 has tonight's 18:00 ahead of it but the next 06:00 is tomorrow's", "2026-10-05 17:00", "2026-10-06 06:00"],
  ])("the 06:00 opening: %s", (_case, from, expected) => {
    expect(nextDaytimeStart(wib(from))).toEqual(wib(expected));
  });

  it.each([
    ["a 08:00 morning has tonight's 18:00 ahead of it", "2026-10-05 08:00", "2026-10-05 18:00"],
    ["17:59 is a minute before tonight's close", "2026-10-05 17:59", "2026-10-05 18:00"],
    ["19:00 is past tonight's close, so it is tomorrow's", "2026-10-05 19:00", "2026-10-06 18:00"],
    ["02:00 has not reached tonight's close yet", "2026-10-05 02:00", "2026-10-05 18:00"],
  ])("the 18:00 closing: %s", (_case, from, expected) => {
    expect(nextDaytimeEnd(wib(from))).toEqual(wib(expected));
  });
});

describe("addWorkingDays on the Admin Platform calendar: Hari Kerja are Monday–Friday that are not a Hari Libur Nasional, ending 23:59 WIB", () => {
  const adminPlatform = adminPlatformCalendar([{ date: "2026-12-25", name: "Hari Raya Natal" }]);

  it.each([
    ["1 Hari Kerja from a Monday ends Tuesday 23:59", "2026-10-05 10:00", 1, "2026-10-06 23:59"],
    ["2 Hari Kerja from Thursday cross the weekend to Monday 23:59", "2026-10-08 15:00", 2, "2026-10-12 23:59"],
    ["a start on Saturday counts from Monday", "2026-10-10 09:00", 1, "2026-10-12 23:59"],
    ["a start late at night still counts from the next day", "2026-10-05 23:59", 1, "2026-10-06 23:59"],
    ["a listed Hari Libur Nasional is skipped (Natal on Friday, then the weekend)", "2026-12-24 09:00", 1, "2026-12-28 23:59"],
    ["3 Hari Kerja over a Hari Libur Nasional and a weekend", "2026-12-23 09:00", 3, "2026-12-29 23:59"],
  ])("%s", (_case, start, n, expected) => {
    expect(addWorkingDays(adminPlatform, wib(start), n)).toEqual(at(expected));
  });

  it("a date not on the Hari Libur Nasional list is a Hari Kerja, even if it is a public holiday in real life", () => {
    expect(addWorkingDays(adminPlatformCalendar([]), wib("2026-12-24 09:00"), 1)).toEqual(at("2026-12-25 23:59"));
  });
});

describe("addWorkingDays on a Lokasi calendar: Hari Kerja are the open days of its Jam Operasional that are not a Tanggal Tutup, ending at its close", () => {
  const closedWednesday: JamOperasional = {
    weekly: { ...weekdaysAndSaturdayMorning.weekly, wednesday: closed },
    tanggalTutup: [{ date: "2026-10-09", note: "Haul pendiri" }],
  };

  it.each([
    ["1 Hari Kerja from Monday ends at Tuesday's close", "2026-10-05 10:00", 1, "2026-10-06 16:00"],
    ["2 Hari Kerja from Monday skip the closed Wednesday", "2026-10-05 10:00", 2, "2026-10-08 16:00"],
    ["2 Hari Kerja from Wednesday skip the Tanggal Tutup on Friday, ending at Saturday's short-hours close", "2026-10-07 10:00", 2, "2026-10-10 12:00"],
    ["3 Hari Kerja from Thursday skip the Tanggal Tutup and the closed Sunday", "2026-10-08 10:00", 3, "2026-10-13 16:00"],
  ])("%s", (_case, start, n, expected) => {
    expect(addWorkingDays(closedWednesday, wib(start), n)).toEqual(at(expected));
  });

  it("1 Hari Kerja on a Lokasi calendar is the end of the Lokasi's next Hari Kerja (nextWorkingDayEnd)", () => {
    const start = wib("2026-10-07 10:00");
    expect(addWorkingDays(closedWednesday, start, 1)).toEqual(nextWorkingDayEnd(closedWednesday, start));
  });
});

describe("the calculator refuses a Lokasi whose Jam Operasional is belum diisi", () => {
  const belumDiisi = { ok: false, reason: "jam_operasional_belum_diisi" };
  const start = wib("2026-10-05 10:00");

  it("deadline refuses", () => {
    expect(deadline(null, start, 2)).toEqual(belumDiisi);
  });

  it("nextWorkingDayEnd refuses", () => {
    expect(nextWorkingDayEnd(null, start)).toEqual(belumDiisi);
  });

  it("addWorkingDays refuses", () => {
    expect(addWorkingDays(null, start, 2)).toEqual(belumDiisi);
  });
});

describe("a Lokasi open 00:00–24:00 every day", () => {
  const allDay = { opens: "00:00", closes: "24:00" };
  const alwaysOpen: JamOperasional = {
    weekly: {
      monday: allDay,
      tuesday: allDay,
      wednesday: allDay,
      thursday: allDay,
      friday: allDay,
      saturday: allDay,
      sunday: allDay,
    },
    tanggalTutup: [],
  };

  it("counts service hours across midnight without a pause", () => {
    expect(deadline(alwaysOpen, wib("2026-10-05 23:00"), 2)).toEqual(at("2026-10-06 01:00"));
  });

  it("a Hari Kerja closing at 24:00 ends at the end of that day", () => {
    expect(nextWorkingDayEnd(alwaysOpen, wib("2026-10-05 10:00"))).toEqual(at("2026-10-07 00:00"));
  });
});
