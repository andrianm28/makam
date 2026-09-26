import { describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { tagihanDue } from "./index";

describe("Tagihan due rules", () => {
  it("a Saat Duka Tagihan is pay-after, due 3×24 h after the burial (the Lokasi Mitra's payment window)", () => {
    expect(
      tagihanDue({ kind: "saat_duka", burialAt: wib("2026-10-05 10:00"), paymentWindowHours: 72 }, [], wib("2026-10-04 15:00")),
    ).toEqual({ kind: "pay_after", dueAt: wib("2026-10-08 10:00") });
  });

  it("a Saat Duka Tagihan follows its Lokasi Mitra's own payment window", () => {
    expect(
      tagihanDue({ kind: "saat_duka", burialAt: wib("2026-10-05 10:00"), paymentWindowHours: 48 }, [], wib("2026-10-04 15:00")),
    ).toEqual({ kind: "pay_after", dueAt: wib("2026-10-07 10:00") });
  });

  it("a burial under an existing Hak Pakai is pay-after, due 3×24 h after the recorded Pemakaman", () => {
    expect(
      tagihanDue({ kind: "pemakaman_hak_pakai_ada", burialAt: wib("2026-10-05 13:30") }, [], wib("2026-10-05 16:00")),
    ).toEqual({ kind: "pay_after", dueAt: wib("2026-10-08 13:30") });
  });

  it("a Pemesanan Terencana Tagihan is pay-first, due when the hold expires", () => {
    expect(
      tagihanDue({ kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") }, [], wib("2026-10-01 11:00")),
    ).toEqual({ kind: "pay_first", dueAt: wib("2026-10-02 09:00") });
  });

  it("a Perpanjangan Tagihan is pay-first, due 3×24 h after issue", () => {
    expect(tagihanDue({ kind: "perpanjangan" }, [], wib("2026-10-01 11:15"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-04 11:15"),
    });
  });

  it("a filing-only Pengurusan Tagihan is pay-first, due 3×24 h after issue", () => {
    expect(tagihanDue({ kind: "pengurusan_berkas" }, [], wib("2026-10-01 20:45"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-04 20:45"),
    });
  });

  it("a standalone Layanan order is pay-first, due on the last lead-time day at 23:59 WIB when that comes first: target the 20th with a 3-day lead time → due the 17th 23:59", () => {
    const bunga = { kind: "layanan", targetDate: "2026-10-20", leadTimeDays: 3 } as const;

    expect(tagihanDue({ kind: "layanan" }, [bunga], wib("2026-10-17 08:00"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-17 23:59"),
    });
  });

  it("a standalone Layanan order is pay-first, due 24 h after issue when that comes before the last lead-time day", () => {
    const bunga = { kind: "layanan", targetDate: "2026-10-20", leadTimeDays: 3 } as const;

    expect(tagihanDue({ kind: "layanan" }, [bunga], wib("2026-10-10 14:20"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-11 14:20"),
    });
  });

  it("a Paket Layanan cycle Tagihan is pay-first, due at H-1 (23:59 WIB the day before the cycle)", () => {
    expect(tagihanDue({ kind: "paket_cycle", cycleDate: "2026-11-01" }, [], wib("2026-10-25 06:00"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-31 23:59"),
    });
  });
});

describe("the earliest due date of a Tagihan's lines", () => {
  it("a Tagihan with several Layanan is due at the earliest of their due dates", () => {
    const lines = [
      { kind: "layanan", targetDate: "2026-10-30", leadTimeDays: 2 },
      { kind: "layanan", targetDate: "2026-10-12", leadTimeDays: 1 },
      { kind: "layanan", targetDate: "2026-10-20", leadTimeDays: 3 },
    ] as const;

    expect(tagihanDue({ kind: "layanan" }, lines, wib("2026-10-10 14:20"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-11 14:20"),
    });
    expect(tagihanDue({ kind: "layanan" }, lines, wib("2026-10-11 09:00"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-11 23:59"),
    });
  });

  it("Layanan at a Terencana checkout make the Tagihan due before the hold expires when their last lead-time day comes first", () => {
    const hold = { kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") } as const;
    const plotLine = { kind: "other" } as const;
    const early = { kind: "layanan", targetDate: "2026-10-03", leadTimeDays: 2 } as const;
    const late = { kind: "layanan", targetDate: "2026-12-01", leadTimeDays: 2 } as const;

    expect(tagihanDue(hold, [plotLine, early], wib("2026-10-01 20:00"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-01 23:59"),
    });
    expect(tagihanDue(hold, [plotLine, late], wib("2026-10-01 20:00"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-02 09:00"),
    });
  });

  it("hari-H Layanan on a Saat Duka Tagihan take its due date, so it stays pay-after", () => {
    const saatDuka = { kind: "saat_duka", burialAt: wib("2026-10-02 10:00"), paymentWindowHours: 72 } as const;
    const bungaTabur = { kind: "layanan", targetDate: "2026-10-02", leadTimeDays: 0 } as const;

    expect(tagihanDue(saatDuka, [{ kind: "other" }, bungaTabur], wib("2026-10-01 21:00"))).toEqual({
      kind: "pay_after",
      dueAt: wib("2026-10-05 10:00"),
    });
  });

  it("Layanan added at a Perpanjangan checkout take the Perpanjangan due date", () => {
    const rumput = { kind: "layanan", targetDate: "2026-10-06", leadTimeDays: 2 } as const;

    expect(tagihanDue({ kind: "perpanjangan" }, [{ kind: "other" }, rumput], wib("2026-10-01 10:00"))).toEqual({
      kind: "pay_first",
      dueAt: wib("2026-10-04 10:00"),
    });
  });
});
