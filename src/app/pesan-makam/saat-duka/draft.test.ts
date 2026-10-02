/**
 * Where a signed-in Pemesan lands after "Kirim pesanan": a placed order leaves
 * the wizard for its own page, and every other outcome keeps the family on the form.
 */
import { describe, expect, it } from "vitest";
import { pesananPath, tujuanSetelahKirim } from "./draft";

describe("Saat Duka Kirim for a signed-in Pemesan", () => {
  it("sends the family to the order page once the Pemesanan Makam is placed", () => {
    expect(tujuanSetelahKirim({ status: "selesai", nomor: "MKM-2026-000004" })).toBe(pesananPath("MKM-2026-000004"));
  });

  it("keeps the family on the form when the order is refused or needs a Kode Masuk", () => {
    expect(tujuanSetelahKirim({ status: "gagal", message: "x" })).toBeNull();
    expect(tujuanSetelahKirim({ status: "perlu_kode_masuk" })).toBeNull();
    expect(tujuanSetelahKirim({ status: "idle" })).toBeNull();
  });
});
