import { describe, expect, it } from "vitest";
import { itemDariPilihan, subtotalPilihan, type OpsiLayananView } from "./layanan-pilihan";

const opsi: OpsiLayananView[] = [
  { id: "l-bunga", name: "Tabur Bunga", teksLabel: null, leadTimeDays: 1, varian: [{ id: "v-bunga", name: "Standar", harga: 150_000 }] },
  { id: "l-nisan", name: "Nisan", teksLabel: "Tulisan nisan", leadTimeDays: 7, varian: [{ id: "v-nisan", name: "Granit", harga: 900_000 }] },
];

describe("what a family picked at a checkout", () => {
  it("hari-H items carry no date: the burial day is set when the Lokasi confirms", () => {
    const pilihan = { "l-bunga": { varianId: "v-bunga", teks: "", targetDate: "" } };
    expect(itemDariPilihan(opsi, pilihan, "hari_h")).toEqual([{ layananVariantId: "v-bunga", teks: null }]);
  });

  it("Tambah Layanan on a Perpanjangan carries the target date and the text the Layanan asks for", () => {
    const pilihan = { "l-nisan": { varianId: "v-nisan", teks: "  Siti Aminah ", targetDate: "2026-11-01" } };
    expect(itemDariPilihan(opsi, pilihan, "perpanjangan")).toEqual([{ layananVariantId: "v-nisan", teks: "Siti Aminah", targetDate: "2026-11-01" }]);
  });

  it("a Layanan left on 'Tidak dipesan' is not an item and adds nothing to the total", () => {
    const pilihan = { "l-bunga": { varianId: "", teks: "", targetDate: "" }, "l-nisan": { varianId: "v-nisan", teks: "x", targetDate: "2026-11-01" } };
    expect(itemDariPilihan(opsi, pilihan, "perpanjangan")).toHaveLength(1);
    expect(subtotalPilihan(opsi, pilihan)).toBe(900_000);
  });
});
