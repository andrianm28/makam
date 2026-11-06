import { describe, expect, it } from "vitest";
import { pesanKonsultasi } from "./pesan";

describe("Info Makam Swasta consultation", () => {
  it("opens the CS consultation with the location's name", () => {
    expect(pesanKonsultasi("Heaven Memorial Park")).toBe("Halo CS Makam.co.id, saya ingin konsultasi tentang Heaven Memorial Park.");
  });
});
