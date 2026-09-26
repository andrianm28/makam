import { describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { confirmationPromise } from "./confirmation-promise";

describe("the pre-submission promise text", () => {
  it.each([
    ["a deadline later today names only the time", "2026-10-05 10:00", "2026-10-05 08:30", "dikonfirmasi paling lambat pukul 10:00"],
    ["a deadline tomorrow says besok", "2026-10-06 08:00", "2026-10-05 23:00", "dikonfirmasi paling lambat besok pukul 08:00"],
    ["a later deadline names the weekday and date", "2026-10-05 10:00", "2026-10-03 21:00", "dikonfirmasi paling lambat Senin, 5 Oktober pukul 10:00"],
    ["the time is WIB whatever the instant", "2026-12-31 16:00", "2026-12-31 09:00", "dikonfirmasi paling lambat pukul 16:00"],
  ])("%s", (_case, due, now, expected) => {
    expect(confirmationPromise({ ok: true, at: wib(due) }, wib(now))).toEqual({ ok: true, text: expected });
  });

  it.each([
    ["a deadline at a 24:00 close today says pukul 24:00, not besok pukul 00:00", "2026-10-06 00:00", "2026-10-05 22:00", "dikonfirmasi paling lambat pukul 24:00"],
    ["a deadline at a 24:00 close tomorrow says besok pukul 24:00", "2026-10-07 00:00", "2026-10-05 22:00", "dikonfirmasi paling lambat besok pukul 24:00"],
    ["a later deadline at a 24:00 close names the day it closes", "2026-10-06 00:00", "2026-10-03 21:00", "dikonfirmasi paling lambat Senin, 5 Oktober pukul 24:00"],
  ])("%s", (_case, due, now, expected) => {
    expect(confirmationPromise({ ok: true, at: wib(due) }, wib(now))).toEqual({ ok: true, text: expected });
  });

  it("makes no promise for a Lokasi whose Jam Operasional is belum diisi", () => {
    expect(confirmationPromise({ ok: false, reason: "jam_operasional_belum_diisi" }, wib("2026-10-05 08:30"))).toEqual({
      ok: false,
      reason: "jam_operasional_belum_diisi",
    });
  });
});
