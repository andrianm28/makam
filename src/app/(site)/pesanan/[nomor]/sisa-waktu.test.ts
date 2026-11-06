import { describe, expect, it } from "vitest";
import { sisaWaktuLabel } from "./sisa-waktu";

describe("the time left for the Lokasi Mitra to confirm a Pemesanan Makam", () => {
  it("counts minutes and seconds under an hour", () => {
    expect(sisaWaktuLabel(4 * 60_000 + 7_000)).toBe("Sisa 04:07");
  });

  it("counts hours and minutes from an hour on", () => {
    expect(sisaWaktuLabel(3_600_000 + 5 * 60_000 + 30_000)).toBe("Sisa 1 jam 05 menit");
  });

  it("says the order is still being processed once the deadline has passed", () => {
    expect(sisaWaktuLabel(0)).toBe("Batas waktu terlewati, pesanan masih kami proses");
    expect(sisaWaktuLabel(-60_000)).toBe("Batas waktu terlewati, pesanan masih kami proses");
  });
});
