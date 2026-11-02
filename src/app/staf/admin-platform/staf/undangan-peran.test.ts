import { describe, expect, it } from "vitest";
import { roleUndangan, roleUndanganAwal } from "./undangan-peran";

/** The Peran field of an Undangan Staf: what the page offers and where it starts. */
describe("the Peran field of an Undangan Staf", () => {
  it("offers the roles the domain knows, each under its own name, without Admin Lokasi", () => {
    expect(roleUndangan(4)).toEqual([
      { value: "admin_platform", label: "Admin Platform" },
      { value: "petugas_lapangan", label: "Petugas Lapangan" },
      { value: "mitra_jasa", label: "Mitra Jasa" },
    ]);
  });

  it("does not offer Mitra Jasa while it is taken out of the product with the TPU (ADR 0010)", () => {
    for (const rilis of [1, 2, 3] as const) {
      expect(roleUndangan(rilis).map((role) => role.value)).toEqual(["admin_platform", "petugas_lapangan"]);
    }
  });

  it("starts on Petugas Lapangan, a role the page does offer", () => {
    expect(roleUndangan(3)).toContainEqual({ value: "petugas_lapangan", label: "Petugas Lapangan" });
    expect(roleUndanganAwal(roleUndangan(3))).toBe("petugas_lapangan");
  });

  it("falls back to the first role on offer, and to nothing when the list is empty", () => {
    expect(roleUndanganAwal([{ value: "mitra_jasa", label: "Mitra Jasa" }])).toBe("mitra_jasa");
    expect(roleUndanganAwal([])).toBeUndefined();
  });
});
