/**
 * What a family has picked among the Layanan a booking checkout offers (Saat Duka hari-H, Perpanjangan "Tambah
 * Layanan", Terencana empty-plot; ticket 53), turned into the items the Server Action sends and the subtotal the
 * sticky bar shows. Display and shaping only: which items are allowed, their dates and their prices are the
 * Layanan module's own, which prices them again where the Tagihan is issued.
 */

/** One Layanan a checkout offers, with its variants at the price a Lokasi shows. */
export interface OpsiLayananView {
  id: string;
  name: string;
  teksLabel: string | null;
  leadTimeDays: number;
  varian: { id: string; name: string; harga: number }[];
}

/** An Opsi plus the earliest date the family may pick for it (lead time after the Tagihan's due date). */
export type OpsiTambahLayanan = OpsiLayananView & { tanggalPalingDini: string };

/** What the family chose for one Layanan: a variant ("" = not ordered), the text it asks for, a target date. */
export interface PilihanLayanan {
  varianId: string;
  teks: string;
  targetDate: string;
}

export type PilihanPerLayanan = Readonly<Record<string, PilihanLayanan>>;

export type ItemPilihan = { layananVariantId: string; teks: string | null; targetDate?: string };

/** The chosen items in catalog order; a hari-H item has no date (the burial day is the Lokasi's to confirm). */
export function itemDariPilihan(opsi: readonly OpsiLayananView[], pilihan: PilihanPerLayanan, mode: "hari_h" | "perpanjangan" | "petak_kosong"): ItemPilihan[] {
  return opsi.flatMap((grup) => {
    const satu = pilihan[grup.id];
    if (!satu || satu.varianId === "") return [];
    const teks = grup.teksLabel ? satu.teks.trim() || null : null;
    return [mode === "hari_h" ? { layananVariantId: satu.varianId, teks } : { layananVariantId: satu.varianId, teks, targetDate: satu.targetDate }];
  });
}

/** The sum of the chosen variants' own prices (the one Biaya Layanan Platform is the Tagihan's, not a variant's). */
export function subtotalPilihan(opsi: readonly OpsiLayananView[], pilihan: PilihanPerLayanan): number {
  return opsi.reduce((jumlah, grup) => jumlah + (grup.varian.find((varian) => varian.id === pilihan[grup.id]?.varianId)?.harga ?? 0), 0);
}
