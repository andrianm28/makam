import { describe, expect, it } from "vitest";
import { dalamMasaTenggang, masaTenggangSelesai, pengingatHakPakaiHari, sudahKedaluwarsa } from "./expiry";

describe("a fixed-term Hak Pakai's end reminders (story 57)", () => {
  const akhir = "2027-06-30";

  it("goes 60, 30 and 7 days before the end date", () => {
    expect(pengingatHakPakaiHari(akhir, 3, "2027-05-01")).toBe("h60");
    expect(pengingatHakPakaiHari(akhir, 3, "2027-05-31")).toBe("h30");
    expect(pengingatHakPakaiHari(akhir, 3, "2027-06-23")).toBe("h7");
  });

  it("is silent on every other day before the end date", () => {
    for (const hari of ["2027-05-02", "2027-05-30", "2027-06-22", "2027-06-29", "2027-06-30"]) {
      expect(pengingatHakPakaiHari(akhir, 3, hari)).toBeNull();
    }
  });

  it("then goes weekly through the Masa Tenggang, and stops once it ends", () => {
    // Default 3 months: 2027-06-30 + 3 months = 2027-09-30.
    expect(masaTenggangSelesai(akhir, 3)).toBe("2027-09-30");
    expect(pengingatHakPakaiHari(akhir, 3, "2027-07-07")).toBe("mingguan");
    expect(pengingatHakPakaiHari(akhir, 3, "2027-07-14")).toBe("mingguan");
    expect(pengingatHakPakaiHari(akhir, 3, "2027-07-08")).toBeNull();
    expect(pengingatHakPakaiHari(akhir, 3, "2027-10-01")).toBeNull();
  });

  it("keeps the Masa Tenggang open on the end date and its last day, and closed after", () => {
    expect(dalamMasaTenggang(akhir, 3, "2027-06-30")).toBe(true);
    expect(dalamMasaTenggang(akhir, 3, "2027-09-30")).toBe(true);
    expect(dalamMasaTenggang(akhir, 3, "2027-10-01")).toBe(false);
  });

  it("is Kedaluwarsa only after the end date, not on it", () => {
    expect(sudahKedaluwarsa(akhir, "2027-06-30")).toBe(false);
    expect(sudahKedaluwarsa(akhir, "2027-07-01")).toBe(true);
  });
});
