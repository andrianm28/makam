import { describe, expect, it } from "vitest";
import { fasilitasHref, hasActiveFilter, jenisHref, kotaHref, lokasiHref, type LokasiFilters } from "./filters";

const none: LokasiFilters = { jenis: undefined, kota: undefined, fasilitas: [] };

describe("the Daftar Lokasi Makam chip links", () => {
  it("is bare /lokasi with no filter active", () => {
    expect(lokasiHref(none)).toBe("/lokasi");
    expect(hasActiveFilter(none)).toBe(false);
  });

  it("carries the city, the kind and every facility together", () => {
    const filters: LokasiFilters = { jenis: "lokasi_mitra", kota: "Kota Jakarta Timur", fasilitas: ["parkir", "musala"] };
    expect(lokasiHref(filters)).toBe("/lokasi?jenis=lokasi_mitra&kota=Kota+Jakarta+Timur&fasilitas=parkir&fasilitas=musala");
    expect(hasActiveFilter(filters)).toBe(true);
  });

  it("selects a city, and clears it when the same city is chosen again", () => {
    const selected = kotaHref(none, "Kota Depok");
    expect(selected).toBe("/lokasi?kota=Kota+Depok");
    expect(kotaHref({ ...none, kota: "Kota Depok" }, "Kota Depok")).toBe("/lokasi");
  });

  it("keeps the other filters when a city is toggled", () => {
    const filters: LokasiFilters = { jenis: "tpu", kota: undefined, fasilitas: ["toilet"] };
    expect(kotaHref(filters, "Kota Bogor")).toBe("/lokasi?jenis=tpu&kota=Kota+Bogor&fasilitas=toilet");
  });

  it("selects a kind, and clears it when the same kind is chosen again", () => {
    expect(jenisHref(none, "tpu")).toBe("/lokasi?jenis=tpu");
    expect(jenisHref({ ...none, jenis: "tpu" }, "tpu")).toBe("/lokasi");
    expect(jenisHref({ ...none, jenis: "tpu" }, "lokasi_mitra")).toBe("/lokasi?jenis=lokasi_mitra");
  });

  it("adds a facility not yet checked, and removes one already checked", () => {
    expect(fasilitasHref(none, "parkir")).toBe("/lokasi?fasilitas=parkir");
    expect(fasilitasHref({ ...none, fasilitas: ["parkir"] }, "musala")).toBe("/lokasi?fasilitas=parkir&fasilitas=musala");
    expect(fasilitasHref({ ...none, fasilitas: ["parkir", "musala"] }, "parkir")).toBe("/lokasi?fasilitas=musala");
  });
});
