/**
 * The Layanan a family picks for an empty Petak Makam on the Terencana "Data & kirim" screen (ticket 118), turned
 * into what the order carries and what the screen adds to the total. The question is the one the family asks: is
 * what I picked, at the price I am shown, what the Tagihan will hold? A pick is never left out in silence. The same
 * choice through the real Server Action, with the Tagihan read back, is in `actions.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { OpsiTambahLayanan, PilihanLayanan, PilihanPerLayanan } from "@/lib/layanan-pilihan";
import { layananPetakKosong } from "./layanan-petak";

const opsi: OpsiTambahLayanan[] = [
  {
    id: "l-bersih",
    name: "Pembersihan Makam",
    teksLabel: null,
    leadTimeDays: 3,
    tanggalPalingDini: "2026-10-04",
    varian: [{ id: "v-bersih", name: "Standar", harga: 400_000 }],
  },
  {
    id: "l-foto",
    name: "Laporan Foto",
    teksLabel: "Catatan untuk petugas",
    leadTimeDays: 1,
    tanggalPalingDini: "2026-10-02",
    varian: [
      { id: "v-foto", name: "Sebelum dan sesudah", harga: 150_000 },
      { id: "v-foto-video", name: "Dengan video", harga: 250_000 },
    ],
  },
];

/** What the picker holds for one Layanan: the variant, the text typed and the date chosen ("" for none yet). */
const pick = (varianId: string, targetDate: string, teks = ""): PilihanLayanan => ({ varianId, teks, targetDate });

describe("the Layanan picked for an empty Petak Makam on the Terencana checkout", () => {
  it("go to the order on the date the family picked, and their price is in the total shown", () => {
    const hasil = layananPetakKosong(opsi, {
      "l-bersih": pick("v-bersih", "2026-10-20"),
      "l-foto": pick("v-foto-video", "2026-11-02", "  Foto dari arah gerbang  "),
    });

    expect(hasil.item).toEqual([
      { layananVariantId: "v-bersih", targetDate: "2026-10-20", teks: null },
      { layananVariantId: "v-foto-video", targetDate: "2026-11-02", teks: "Foto dari arah gerbang" },
    ]);
    expect(hasil.subtotal).toBe(650_000);
    expect(hasil.tanpaTanggal).toEqual([]);
    expect(hasil.ditolak).toBeNull();
  });

  it("are never left out in silence: a Layanan picked with no date is named, Kirim is refused in words, and its price is not in the total shown", () => {
    const hasil = layananPetakKosong(opsi, { "l-bersih": pick("v-bersih", "") });

    expect(hasil.tanpaTanggal).toEqual(["Pembersihan Makam"]);
    expect(hasil.ditolak).toContain("Pembersihan Makam");
    expect(hasil.ditolak).toContain("tanggal pengerjaan");
    expect(hasil.ditolak).toContain("Tidak dipesan");
    expect(hasil.subtotal).toBe(0);
  });

  it("count the ones with a date and name the ones without, and nothing is sent while one of them has no date", () => {
    const hasil = layananPetakKosong(opsi, { "l-bersih": pick("v-bersih", "2026-10-20"), "l-foto": pick("v-foto", "") });

    // The total shown is what the Tagihan would hold for the dated one; the other is named, not priced.
    expect(hasil.subtotal).toBe(400_000);
    expect(hasil.tanpaTanggal).toEqual(["Laporan Foto"]);
    expect(hasil.ditolak).toContain("Laporan Foto");
    expect(hasil.ditolak).not.toContain("Pembersihan Makam");
  });

  it("name every Layanan that still has no date, in the order of the catalog", () => {
    const hasil = layananPetakKosong(opsi, { "l-foto": pick("v-foto", ""), "l-bersih": pick("v-bersih", "") });

    expect(hasil.tanpaTanggal).toEqual(["Pembersihan Makam", "Laporan Foto"]);
    expect(hasil.ditolak).toContain("Pembersihan Makam dan Laporan Foto");
  });

  it("leave out a Layanan put back to 'Tidak dipesan', whatever date or text was typed before, and count nothing for it", () => {
    const hasil = layananPetakKosong(opsi, {
      "l-bersih": pick("", "2026-10-20"),
      "l-foto": pick("", "", "ketik sebelum dikembalikan"),
    });

    expect(hasil).toEqual({ item: [], subtotal: 0, tanpaTanggal: [], ditolak: null });
  });

  it("carry no text for a Layanan that asks for none, and none for one that asks for it while only spaces were typed", () => {
    const hasil = layananPetakKosong(opsi, {
      "l-bersih": pick("v-bersih", "2026-10-20", "ketik sebelum"),
      "l-foto": pick("v-foto", "2026-10-21", "   "),
    });

    expect(hasil.item.map((satu) => satu.teks)).toEqual([null, null]);
  });

  it("never lose a pick: each Layanan is either sent with a date or named as lacking one, whatever the family left undone", () => {
    const harga = new Map(opsi.flatMap((grup) => grup.varian.map((varian) => [varian.id, varian.harga] as const)));
    const tanggalPilihan = ["", "2026-10-20"];

    let dicoba = 0;
    for (const bersih of ["", "v-bersih"]) {
      for (const foto of ["", "v-foto", "v-foto-video"]) {
        for (const tanggalBersih of tanggalPilihan) {
          for (const tanggalFoto of tanggalPilihan) {
            const pilihan: PilihanPerLayanan = { "l-bersih": pick(bersih, tanggalBersih), "l-foto": pick(foto, tanggalFoto) };
            const hasil = layananPetakKosong(opsi, pilihan);
            const dipilih = [bersih, foto].filter((varianId) => varianId !== "").length;
            // Nothing picked is lost: it is sent, or it is named as the reason Kirim is refused.
            expect(hasil.item.length + hasil.tanpaTanggal.length, JSON.stringify(pilihan)).toBe(dipilih);
            expect(hasil.ditolak === null, JSON.stringify(pilihan)).toBe(hasil.tanpaTanggal.length === 0);
            // The total shown is the total of what is sent.
            expect(hasil.subtotal, JSON.stringify(pilihan)).toBe(hasil.item.reduce((jumlah, satu) => jumlah + (harga.get(satu.layananVariantId) ?? 0), 0));
            dicoba += 1;
          }
        }
      }
    }
    expect(dicoba).toBe(2 * 3 * 2 * 2);
  });
});
