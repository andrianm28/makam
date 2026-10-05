/**
 * What the family-side Layanan order forms send as `item` (ticket 115), from what the family has filled in. The
 * ids below differ between a Layanan and its variants on purpose: the form keeps the date and the text under the
 * Layanan's id, and a lookup by the variant's id is the mistake these tests exist to catch. The same items,
 * through the real Server Actions, are in `actions.test.ts` and `tpu/actions.test.ts`, which also hold what a
 * Layanan put back to "Tidak dipesan" does to the price asked and to the order (ticket 118).
 */
import { describe, expect, it } from "vitest";
import { itemPesananLayanan, pilihVarian, varianDipilih, type LayananDiForm } from "./item-pesanan";

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

describe("the choice a Layanan order form keeps", () => {
  it("loses a Layanan the family puts back to 'Tidak dipesan', and keeps the others in the order they were chosen", () => {
    const dipilih = pilihVarian(pilihVarian({}, "l-nisan", "v-nisan-80"), "l-bunga", "v-bunga");
    expect(varianDipilih(dipilih)).toEqual(["v-nisan-80", "v-bunga"]);

    const kembali = pilihVarian(dipilih, "l-nisan", "");

    expect(kembali).toEqual({ "l-bunga": "v-bunga" });
    expect(varianDipilih(kembali)).toEqual(["v-bunga"]);
  });

  it("has nothing chosen once every Layanan is put back, so there is nothing to price, nothing to order and no one to press 'Pesan layanan'", () => {
    const dipilih = pilihVarian(pilihVarian(pilihVarian(pilihVarian({}, "l-nisan", "v-nisan-80"), "l-bunga", "v-bunga"), "l-nisan", ""), "l-bunga", "");

    expect(dipilih).toEqual({});
    expect(varianDipilih(dipilih)).toEqual([]);
    // Whatever date or text was typed for them before is of no use to an order that has no Layanan.
    expect(itemPesananLayanan(layanan, { dipilih, tanggal: { "l-bunga": "2026-10-20", "l-nisan": "2026-11-02" }, teks: { "l-nisan": "Siti Aminah" } })).toEqual([]);
  });

  it("reads a Layanan whose variant is '' as not chosen, whatever else the choice holds", () => {
    expect(varianDipilih({ "l-nisan": "", "l-bunga": "v-bunga" })).toEqual(["v-bunga"]);
    expect(varianDipilih({ "l-nisan": "" })).toEqual([]);
    expect(varianDipilih({})).toEqual([]);
  });

  it("keeps the place of a Layanan whose variant is changed, and puts one chosen again after 'Tidak dipesan' last", () => {
    const awal = pilihVarian(pilihVarian({}, "l-nisan", "v-nisan-80"), "l-bunga", "v-bunga");

    expect(varianDipilih(pilihVarian(awal, "l-nisan", "v-nisan-100"))).toEqual(["v-nisan-100", "v-bunga"]);
    expect(varianDipilih(pilihVarian(pilihVarian(awal, "l-nisan", ""), "l-nisan", "v-nisan-100"))).toEqual(["v-bunga", "v-nisan-100"]);
  });

  it("leaves the choice it was given as it was", () => {
    const awal = Object.freeze({ "l-nisan": "v-nisan-80" });

    expect(pilihVarian(awal, "l-nisan", "")).toEqual({});
    expect(awal).toEqual({ "l-nisan": "v-nisan-80" });
  });
});
