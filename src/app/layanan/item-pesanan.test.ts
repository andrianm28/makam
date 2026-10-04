/**
 * What the family-side Layanan order forms send as `item` (ticket 115), from what the family has filled in. The
 * ids below differ between a Layanan and its variants on purpose: the form keeps the date and the text under the
 * Layanan's id, and a lookup by the variant's id is the mistake these tests exist to catch. The same items,
 * through the real Server Actions, are in `actions.test.ts` and `tpu/actions.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { itemPesananLayanan, type LayananDiForm } from "./item-pesanan";

const layanan: LayananDiForm[] = [
  { id: "l-bunga", teksLabel: null, targetPalingDini: "2026-10-02", varian: [{ id: "v-bunga" }] },
  { id: "l-nisan", teksLabel: "Tulisan pada nisan", targetPalingDini: "2026-10-04", varian: [{ id: "v-nisan-80" }, { id: "v-nisan-100" }] },
];

describe("the items a Layanan order form sends", () => {
  it("carry, for each chosen variant, the target date and the text typed for its Layanan", () => {
    const item = itemPesananLayanan(layanan, {
      dipilih: { "l-nisan": "v-nisan-100" },
      tanggal: { "l-nisan": "2026-11-02" },
      teks: { "l-nisan": "  Siti Aminah binti Ahmad  " },
    });

    expect(item).toEqual([{ layananVariantId: "v-nisan-100", targetDate: "2026-11-02", teks: "Siti Aminah binti Ahmad" }]);
  });

  it("send the earliest allowed date while no date is chosen, and none of the text of a Layanan that asks for none", () => {
    const item = itemPesananLayanan(layanan, {
      dipilih: { "l-bunga": "v-bunga" },
      tanggal: {},
      teks: { "l-bunga": "typed before the Layanan was put back" },
    });

    expect(item).toEqual([{ layananVariantId: "v-bunga", targetDate: "2026-10-02", teks: null }]);
  });

  it("come in the order the family chose them, and leave out a Layanan put back to 'Tidak dipesan'", () => {
    const item = itemPesananLayanan(layanan, {
      dipilih: { "l-nisan": "v-nisan-80", "l-bunga": "v-bunga" },
      tanggal: {},
      teks: { "l-nisan": "Siti Aminah" },
    });
    expect(item.map((satu) => satu.layananVariantId)).toEqual(["v-nisan-80", "v-bunga"]);

    const dibatalkan = itemPesananLayanan(layanan, { dipilih: { "l-nisan": "", "l-bunga": "v-bunga" }, tanggal: {}, teks: {} });
    expect(dibatalkan.map((satu) => satu.layananVariantId)).toEqual(["v-bunga"]);
  });
});
