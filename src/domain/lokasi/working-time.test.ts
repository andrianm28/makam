import { describe, expect, it } from "vitest";
import { daytimeHoursDeadline, deadline, nextWorkingDayEnd, TPU_SCHEDULE, type JamOperasional } from "@/domain/lokasi";
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
