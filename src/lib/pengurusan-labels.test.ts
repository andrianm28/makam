import { describe, expect, it } from "vitest";
import { catatanPembatalanPengurusan } from "./pengurusan-labels";

/**
 * What a Pemesan is told about the refund when cancelling a Pengurusan (spec, Pengurusan; story 77). The refund rule is
 * the Pengurusan module's (an unpaid Tagihan is voided; a paid one is refunded in full, except the Biaya Pengurusan once
 * the order is at Dimakamkan or later); only its wording is here, in the words of the kind of order.
 */
describe("the cancellation notice of a Pengurusan, by kind of order", () => {
  it("tells a Saat Duka TPU order that the Biaya Pengurusan is kept since the burial was arranged with the TPU", () => {
    expect(catatanPembatalanPengurusan("saat_duka_tpu")).toBe(
      "Tagihan yang belum dibayar dibatalkan; yang sudah dibayar dikembalikan, kecuali Biaya Pengurusan sejak pemakaman diatur dengan TPU.",
    );
  });

  it("tells a filing-only Pengurusan IPTM order the same in the words of the filing, with no burial in it: the family buried on its own", () => {
    const catatan = catatanPembatalanPengurusan("pengurusan_iptm");

    expect(catatan).toBe("Tagihan yang belum dibayar dibatalkan; yang sudah dibayar dikembalikan, kecuali Biaya Pengurusan sejak berkas IPTM mulai kami urus.");
    expect(catatan).not.toMatch(/pemakaman|TPU/);
  });

  it("tells a Perpanjangan TPU order only that an unpaid Tagihan is cancelled, as it always has", () => {
    expect(catatanPembatalanPengurusan("perpanjangan_tpu")).toBe("Tagihan yang belum dibayar dibatalkan.");
  });
});
