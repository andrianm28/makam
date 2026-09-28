import { describe, expect, it } from "vitest";
import { bentukKartu } from "./tampilan";

/**
 * "Pilih makam" draws a Lokasi Mitra card differently depending on how many
 * Jenis Makam it has to offer (the prototype's own single-row shape for one,
 * the header-plus-list shape once there is a choice to lay out).
 */
describe("the shape Pilih makam draws a Lokasi Mitra card in", () => {
  it("is 'tunggal' for a Lokasi Mitra with exactly one Jenis Makam tersedia", () => {
    expect(bentukKartu({ pilihan: [{} as never] })).toBe("tunggal");
  });

  it("is 'banyak' once there is more than one Jenis Makam to choose between", () => {
    expect(bentukKartu({ pilihan: [{} as never, {} as never] })).toBe("banyak");
  });
});
