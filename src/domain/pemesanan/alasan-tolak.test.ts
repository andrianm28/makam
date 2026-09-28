/**
 * The closed list of Tolak reasons, split by **who may choose it** (ticket 24's
 * AC 1; the review's HARD 1). The list itself is one list — a Lokasi answers out
 * of the reasons families can be told, and nothing adds to it — but the reasons
 * belong to two people, and mixing them is how a Lokasi ended up able to write
 * "the family refused the alternative we offered" over an order that was never
 * offered one.
 *
 * This is a pure test of two arrays and a schema: no database, and nothing to
 * arrange.
 */
import { describe, expect, it } from "vitest";
import { ALASAN_TOLAK, alasanTolakKeys, alasanTolakKeluargaKeys, alasanTolakLokasiKeys, alasanTolakLokasiSchema } from "./alasan-tolak";

describe("the closed list of Tolak reasons", () => {
  it("gives the Lokasi only reasons about its own capacity, calendar, papers, area and price", () => {
    // Every one of these is something the Lokasi can find out for itself. The
    // reason a family produces is not on this list, and that is the whole fix.
    expect(alasanTolakLokasiKeys).toEqual([
      "petak_tidak_tersedia",
      "kapasitas_penuh",
      "tanggal_tidak_bisa",
      "dokumen_belum_lengkap",
      "di_luar_wilayah",
      "harga_belum_disepakati",
    ]);
    expect(alasanTolakLokasiKeys).not.toContain("alternatif_ditolak");
  });

  it("keeps the family's own answer out of the Lokasi's list, and every reason worded once", () => {
    // Disjoint by construction, and asserted so an edit that merges them fails.
    for (const kunci of alasanTolakKeluargaKeys) {
      expect(alasanTolakLokasiKeys).not.toContain(kunci);
    }
    // Still one closed list for the column and the family's email: the two halves
    // together, with no third way in and nothing dropped between them.
    expect(alasanTolakKeys).toEqual([...alasanTolakLokasiKeys, ...alasanTolakKeluargaKeys]);
    expect(Object.keys(ALASAN_TOLAK).sort()).toEqual([...alasanTolakKeys].sort());
  });

  it("refuses at the boundary a reason the Lokasi may not choose, and free text", () => {
    const hasil = alasanTolakLokasiSchema.safeParse("alternatif_ditolak");
    expect(hasil.success).toBe(false);
    expect(alasanTolakLokasiSchema.safeParse("sibuk").success).toBe(false);
    expect(alasanTolakLokasiSchema.safeParse("kapasitas_penuh").success).toBe(true);
  });
});
