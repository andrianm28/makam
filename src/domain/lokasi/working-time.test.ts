import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  confirmationPromise,
  daytimeHoursDeadline, deadline, nextWorkingDayEnd, TPU_SCHEDULE,
  type JamOperasional,
  type WorkingDayCalendar,
} from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";

const closed = null;
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
  closures: [],
};

describe("deadline: N service hours inside a Lokasi's Jam Operasional", () => {
  it("submitted Saturday 21:00, Sunday closed, Monday 08:00–16:00: 2 service hours end Monday 10:00", () => {
    // 2026-10-03 is a Saturday.
    expect(deadline(weekdaysAndSaturdayMorning, wib("2026-10-03 21:00"), 2)).toEqual(wib("2026-10-05 10:00"));
  });

  const withClosure: JamOperasional = {
    ...weekdaysAndSaturdayMorning,
    closures: [{ date: "2026-10-07", note: "Kerja bakti" }],
  };

  it.each([
    ["a start inside open hours counts from the start", weekdaysAndSaturdayMorning, "2026-10-05 09:30", 2, "2026-10-05 11:30"],
    ["a deadline that lands on the close ends at the close, not the next morning", weekdaysAndSaturdayMorning, "2026-10-05 14:00", 2, "2026-10-05 16:00"],
    ["the clock pauses overnight", weekdaysAndSaturdayMorning, "2026-10-05 15:00", 2, "2026-10-06 09:00"],
    ["a start exactly at close counts from the next opening", weekdaysAndSaturdayMorning, "2026-10-05 16:00", 1, "2026-10-06 09:00"],
    ["a start before opening counts from the opening", weekdaysAndSaturdayMorning, "2026-10-05 05:00", 1, "2026-10-05 09:00"],
    ["the clock pauses over the weekend (Saturday's short hours, closed Sunday)", weekdaysAndSaturdayMorning, "2026-10-02 15:00", 6, "2026-10-05 09:00"],
    ["the clock pauses on a dated closure", withClosure, "2026-10-06 15:00", 2, "2026-10-08 09:00"],
    ["a start on a dated closure counts from the next open day", withClosure, "2026-10-07 10:00", 1, "2026-10-08 09:00"],
    ["service hours may run over several open days", weekdaysAndSaturdayMorning, "2026-10-05 08:00", 20, "2026-10-07 12:00"],
  ])("%s", (_case, schedule, start, serviceHours, expected) => {
    expect(deadline(schedule, wib(start), serviceHours)).toEqual(wib(expected));
  });
});

describe("nextWorkingDayEnd: the end of the Lokasi's next open day", () => {
  const withClosure: JamOperasional = {
    ...weekdaysAndSaturdayMorning,
    closures: [{ date: "2026-10-06", note: "Kerja bakti" }],
  };

  it.each([
    ["from an open day, the close of the following open day", weekdaysAndSaturdayMorning, "2026-10-05 10:00", "2026-10-06 16:00"],
    ["before opening on an open day, still the following open day", weekdaysAndSaturdayMorning, "2026-10-05 06:00", "2026-10-06 16:00"],
    ["from Friday, Saturday's short-hours close", weekdaysAndSaturdayMorning, "2026-10-02 10:00", "2026-10-03 12:00"],
    ["from Saturday night, over the closed Sunday, to Monday's close", weekdaysAndSaturdayMorning, "2026-10-03 21:00", "2026-10-05 16:00"],
    ["over a dated closure", withClosure, "2026-10-05 10:00", "2026-10-07 16:00"],
  ])("%s", (_case, schedule, start, expected) => {
    expect(nextWorkingDayEnd(schedule, wib(start))).toEqual(wib(expected));
  });
});

describe("the TPU schedule: 06:00–18:00 WIB every day", () => {
  it.each([
    ["a night submission at 23:00 with 2 service hours ends 08:00 next day", "2026-10-05 23:00", 2, "2026-10-06 08:00"],
    ["a Sunday counts like any other day", "2026-10-04 17:00", 2, "2026-10-05 07:00"],
    ["a start inside the window counts from the start", "2026-10-05 09:15", 2, "2026-10-05 11:15"],
    ["a start exactly at 18:00 counts from 06:00 next day", "2026-10-05 18:00", 2, "2026-10-06 08:00"],
  ])("%s", (_case, start, serviceHours, expected) => {
    expect(deadline(TPU_SCHEDULE, wib(start), serviceHours)).toEqual(wib(expected));
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

describe("addWorkingDays on the Admin Platform calendar: Monday–Friday minus the listed national holidays, ending 23:59 WIB", () => {
  const adminPlatform: WorkingDayCalendar = {
    kind: "admin_platform",
    nationalHolidays: [{ date: "2026-12-25", name: "Hari Raya Natal" }],
  };

  it.each([
    ["1 working day from a Monday ends Tuesday 23:59", "2026-10-05 10:00", 1, "2026-10-06 23:59"],
    ["2 working days from Thursday cross the weekend to Monday 23:59", "2026-10-08 15:00", 2, "2026-10-12 23:59"],
    ["a start on Saturday counts from Monday", "2026-10-10 09:00", 1, "2026-10-12 23:59"],
    ["a start late at night still counts from the next day", "2026-10-05 23:59", 1, "2026-10-06 23:59"],
    ["a listed national holiday is skipped (Natal on Friday, then the weekend)", "2026-12-24 09:00", 1, "2026-12-28 23:59"],
    ["3 working days over a national holiday and a weekend", "2026-12-23 09:00", 3, "2026-12-29 23:59"],
  ])("%s", (_case, start, n, expected) => {
    expect(addWorkingDays(adminPlatform, wib(start), n)).toEqual(wib(expected));
  });

  it("a date not on the holiday list is a working day, even if it is a holiday in real life", () => {
    const noHolidays: WorkingDayCalendar = { kind: "admin_platform", nationalHolidays: [] };
    expect(addWorkingDays(noHolidays, wib("2026-12-24 09:00"), 1)).toEqual(wib("2026-12-25 23:59"));
  });
});

describe("addWorkingDays on a Lokasi calendar: open days of its Jam Operasional minus its dated closures, ending at its close", () => {
  const closedWednesday: JamOperasional = {
    weekly: { ...weekdaysAndSaturdayMorning.weekly, wednesday: closed },
    closures: [{ date: "2026-10-09", note: "Haul pendiri" }],
  };
  const lokasi: WorkingDayCalendar = { kind: "lokasi", jamOperasional: closedWednesday };

  it.each([
    ["1 working day from Monday ends at Tuesday's close", "2026-10-05 10:00", 1, "2026-10-06 16:00"],
    ["2 working days from Monday skip the closed Wednesday", "2026-10-05 10:00", 2, "2026-10-08 16:00"],
    ["2 working days from Wednesday skip the dated closure on Friday, ending at Saturday's short-hours close", "2026-10-07 10:00", 2, "2026-10-10 12:00"],
    ["3 working days from Thursday skip the closure and the closed Sunday", "2026-10-08 10:00", 3, "2026-10-13 16:00"],
  ])("%s", (_case, start, n, expected) => {
    expect(addWorkingDays(lokasi, wib(start), n)).toEqual(wib(expected));
  });

  it("1 working day on a Lokasi calendar is the Lokasi's next working day end", () => {
    const start = wib("2026-10-07 10:00");
    expect(addWorkingDays(lokasi, start, 1)).toEqual(nextWorkingDayEnd(closedWednesday, start));
  });
});

describe("the pre-submission promise text", () => {
  it.each([
    ["a deadline later today names only the time", "2026-10-05 10:00", "2026-10-05 08:30", "dikonfirmasi paling lambat pukul 10:00"],
    ["a deadline tomorrow says besok", "2026-10-06 08:00", "2026-10-05 23:00", "dikonfirmasi paling lambat besok pukul 08:00"],
    ["a later deadline names the weekday and date", "2026-10-05 10:00", "2026-10-03 21:00", "dikonfirmasi paling lambat Senin, 5 Oktober pukul 10:00"],
    ["the time is WIB whatever the instant", "2026-12-31 16:00", "2026-12-31 09:00", "dikonfirmasi paling lambat pukul 16:00"],
  ])("%s", (_case, due, now, expected) => {
    expect(confirmationPromise(wib(due), wib(now))).toBe(expected);
  });
});
